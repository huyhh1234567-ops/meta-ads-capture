(() => {
  if (window.__metaAdsCaptureInstalled) return;
  window.__metaAdsCaptureInstalled = true;

  const state = { container: null, originalTop: 0, hidden: [], settings: {}, preview: null, visitedAds: new Set(), currentAd: '', currentLevel: 'ad', selectedPath: {}, selectedIds: {}, stopRequested: false, readOnly: false, allowedClick: null, allowedSearch: null };
  // Only the tree's Search input may receive scripted typing, never an ad setting.
  function protectSettings(event) {
    if (!state.readOnly) return;
    const target = event.target;
    if (target === state.allowedSearch && target === findEntitySearchInput()) return;
    const approved = state.allowedClick && (target === state.allowedClick || state.allowedClick.contains(target));
    if (event.type === 'click' && approved) return;
    const editable = target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="radio"], [role="checkbox"], [role="switch"], [role="combobox"]');
    if (editable || (event.type === 'click' && !event.isTrusted)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  for (const type of ['click', 'beforeinput', 'keydown', 'paste', 'drop']) document.addEventListener(type, protectSettings, true);
  function readOnlyClick(node) {
    if (!node || node.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="radio"], [role="checkbox"], [role="switch"], [role="combobox"]')) {
      throw new Error('Tool đã chặn thao tác vào ô thiết lập quảng cáo.');
    }
    state.allowedClick = node;
    try { node.click(); } finally { state.allowedClick = null; }
  }
  // Timers inside a background tab are aggressively throttled by Chrome.
  // Delegate capture waits to the extension service worker so scrolling and
  // lazy-load checks continue at the intended pace after the user changes tab.
  const sleep = async (ms) => {
    const duration = Math.max(0, Math.min(60000, Number(ms) || 0));
    try { await chrome.runtime.sendMessage({ type: 'MAC_CONTENT_WAIT', ms: duration }); }
    catch { await new Promise((resolve) => setTimeout(resolve, duration)); }
  };

  function visible(el) {
    const r = el === document.scrollingElement ? { left: 0, top: 0, bottom: innerHeight, width: innerWidth, height: innerHeight } : el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && s.visibility !== 'hidden' && s.display !== 'none';
  }

  function rowCandidates(root = document) {
    const selectors = state.settings.rowSelector || '[role="row"], [data-testid*="row"], tr';
    try { return [...root.querySelectorAll(selectors)].filter(visible); }
    catch { return [...root.querySelectorAll('[role="row"], tr')].filter(visible); }
  }

  function findScrollContainer() {
    if (state.settings.scrollSelector) {
      try {
        const selected = document.querySelector(state.settings.scrollSelector);
        if (selected) return selected;
      } catch {}
    }
    const candidates = [...document.querySelectorAll('div, section, main')]
      .filter((el) => visible(el) && el.scrollHeight > el.clientHeight + 120 && el.clientHeight > 220)
      .map((el) => {
        const rows = rowCandidates(el).length;
        const style = getComputedStyle(el);
        const scrollable = /auto|scroll/.test(style.overflowY) ? 30 : 0;
        return { el, score: rows * 100 + scrollable + Math.min(el.clientHeight, 900) / 100 };
      })
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.el || document.scrollingElement;
  }

  function cleanLines(text) {
    return text.split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  function extractAdName(row) {
    const custom = state.settings.nameSelector;
    if (custom) {
      try {
        const node = row.querySelector(custom);
        if (node?.textContent.trim()) return node.textContent.trim();
      } catch {}
    }
    const cells = [...row.querySelectorAll('[role="gridcell"], td')].filter(visible);
    const lines = cleanLines(row.innerText || row.textContent || '');
    const preferred = lines.find((line) => /\b(?:post|ad|qc|quảng cáo)\s*[-:#]?\s*\d{2,}\b/i.test(line));
    if (preferred) return preferred;
    for (const cell of cells) {
      const cellLines = cleanLines(cell.innerText || '');
      const candidate = cellLines.find((line) => line.length >= 2 && line.length <= 160 && !/^(on|off|active|inactive|learning|draft)$/i.test(line));
      if (candidate) return candidate;
    }
    return lines.find((line) => line.length >= 2 && line.length <= 160) || '';
  }

  function snapshot() {
    const container = state.container || findScrollContainer();
    state.container = container;
    const cr = container === document.scrollingElement
      ? { top: 0, bottom: innerHeight }
      : container.getBoundingClientRect();
    const ads = rowCandidates(container === document.scrollingElement ? document : container)
      .map((row, index) => {
        const r = row.getBoundingClientRect();
        return { name: extractAdName(row), rowPosition: index + 1, top: Math.round(r.top), bottom: Math.round(r.bottom) };
      })
      .filter((ad) => ad.name && ad.bottom > Math.max(0, cr.top) && ad.top < Math.min(innerHeight, cr.bottom));
    return {
      ads,
      scrollTop: Math.round(container.scrollTop),
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      atBottom: container.scrollTop + container.clientHeight >= container.scrollHeight - 8
    };
  }

  function hideChrome() {
    if (!state.settings.hideChrome) return;
    const selectors = ['[role="navigation"]', '[aria-label*="navigation" i]', '[data-pagelet*="LeftRail"]'];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!el.closest('[role="grid"]') && visible(el)) {
          state.hidden.push({ el, visibility: el.style.visibility });
          el.style.visibility = 'hidden';
        }
      }
    }
  }

  function restore() {
    state.readOnly = false;
    state.allowedClick = null;
    if (state.container) state.container.scrollTop = state.originalTop;
    for (const item of state.hidden) item.el.style.visibility = item.visibility;
    state.hidden = [];
  }

  function findPreviewContainer() {
    if (state.settings.previewSelector) {
      try { const selected = document.querySelector(state.settings.previewSelector); if (selected) return selected; } catch {}
    }
    const edgePoints = [innerHeight * .35, innerHeight * .55, innerHeight * .8];
    for (const y of edgePoints) {
      for (const hit of document.elementsFromPoint(innerWidth - 8, y)) {
        let node = hit;
        while (node && node !== document.body) {
          const r = node.getBoundingClientRect();
          if (r.right >= innerWidth - 15 && r.width > innerWidth * .45 && node.scrollHeight > node.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
          node = node.parentElement;
        }
      }
    }
    const candidates = [document.scrollingElement, ...document.querySelectorAll('div, section, main')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return el && r.right >= innerWidth - 25 && r.width > innerWidth * .45 && r.height > innerHeight * .55 && el.scrollHeight > el.clientHeight + 40;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const overflow = /auto|scroll/.test(getComputedStyle(el).overflowY) ? 60 : 0;
        const outsideEdge = r.right >= innerWidth - 5 ? 100 : 0;
        return { el, score: outsideEdge + overflow + r.width / innerWidth * 20 + r.height / innerHeight * 10 };
      }).sort((a,b) => b.score - a.score);
    if (candidates.length) return candidates[0].el;
    // A short Campaign can fit in one viewport and still be a valid capture.
    return [...document.querySelectorAll('main, [role="main"], div, section')].find((el) => {
      const r = el.getBoundingClientRect();
      return visible(el) && r.right >= innerWidth - 25 && r.width > innerWidth * .45
        && r.height > innerHeight * .55 && /auto|scroll/.test(getComputedStyle(el).overflowY);
    }) || (document.scrollingElement && visible(document.scrollingElement) ? document.scrollingElement : null);
  }

  function currentAdName() {
    if (state.settings.currentNameSelector) {
      try { const el = document.querySelector(state.settings.currentNameSelector); if (el?.value || el?.textContent) return (el.value || el.textContent).trim(); } catch {}
    }
    const adLabel = [...document.querySelectorAll('label, [role="heading"], span, div')].find((el) => visible(el) && /^ad name$/i.test((el.textContent || '').trim()) && el.children.length < 3);
    let card = adLabel;
    while (card && card !== document.body && !card.querySelector('input')) card = card.parentElement;
    const labelledInput = card?.querySelector('input');
    if (labelledInput?.value) return labelledInput.value.trim();
    const inputs = [...document.querySelectorAll('input')].filter((el) => visible(el) && /post|ad|qc/i.test(el.value || ''));
    const likely = inputs.find((el) => el.getBoundingClientRect().left > innerWidth * .3 && !/q\d+[-_]\d+.*post/i.test(el.value || '')) || inputs[0];
    if (likely?.value) return likely.value.trim();
    const crumb = [...document.querySelectorAll('[aria-current="page"], [role="heading"]')].find((el) => /post\s*\d+/i.test(el.textContent || ''));
    return crumb?.textContent.trim() || document.title;
  }

  const LEVEL_CONFIG = {
    campaign: { aria: 'Campaign', heading: 'Campaign name|Tên chiến dịch', rowLabel: /^(campaign|chiến dịch)$/i, output: 'Campaign' },
    adset: { aria: 'Ad set', heading: 'Ad set name|Tên nhóm quảng cáo', rowLabel: /^(ad\s*set|nhóm quảng cáo)$/i, output: 'Ad set' },
    ad: { aria: 'Ad', heading: 'Ad name|Tên quảng cáo', rowLabel: /^(ad|quảng cáo)$/i, output: 'Ad' }
  };

  function currentEntityName(level = state.currentLevel) {
    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.ad;
    if (level === 'ad' && state.settings.currentNameSelector) {
      const custom = document.querySelector(state.settings.currentNameSelector);
      if (custom?.value) return custom.value.trim();
    }
    const label = [...document.querySelectorAll('label, [role="heading"], span, div')]
      .find((el) => visible(el) && new RegExp(`^(?:${config.heading})$`, 'i').test((el.textContent || '').trim()) && el.children.length < 3);
    let card = label;
    while (card && card !== document.body && !card.querySelector('input, textarea')) card = card.parentElement;
    return card && card !== document.body ? card.querySelector('input, textarea')?.value?.trim() || '' : '';
  }

  function isLevelScreen(level) {
    const heading = LEVEL_CONFIG[level]?.heading;
    return !!heading && [...document.querySelectorAll('label, [role="heading"], span, div')]
      .some((el) => visible(el) && new RegExp(`^(?:${heading})$`, 'i').test((el.textContent || '').trim()) && el.children.length < 3);
  }

  function detectCurrentLevel() {
    return ['ad', 'adset', 'campaign'].find((level) => isLevelScreen(level)) || null;
  }

  function advantageHighlight(captureRect, scrollTop) {
    if (!state.settings.highlightAdvantage || state.currentLevel !== 'ad') return null;
    const textOf = (node) => String(node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
    const startPattern = /^(?:advantage\+\s*(?:creative(?:\s+enhancements)?|nội dung)|nội dung(?: quảng cáo)?\s+advantage\+)(?:\s*\(\s*\d+\s*\/\s*\d+\s*\))?(?:\s*[ⓘℹ✦✨])?$/i;
    const nodes = [...document.querySelectorAll('h1, h2, h3, h4, [role="heading"], strong, span, div')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 2 && rect.height > 2 && style.display !== 'none' && style.visibility !== 'hidden'
          && node.children.length < 3;
      });
    const heading = nodes.filter((node) => startPattern.test(textOf(node)))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= captureRect.left && rect.right <= captureRect.left + captureRect.width;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.top - br.top || ar.width * ar.height - br.width * br.height;
      })[0];
    if (!heading) return null;
    let card = null;
    let current = heading.parentElement;
    for (let depth = 0; current && current !== document.body && depth < 9; depth++, current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      const text = (current.innerText || current.textContent || '').replace(/\s+/g, ' ').trim();
      const containsDetails = /(essential enhancements|try it out|creative translation|thử ngay)/i.test(text);
      const sensibleCard = rect.width >= 180 && rect.width <= innerWidth * .72 && rect.height >= 60;
      if (containsDetails && sensibleCard) { card = current; break; }
    }
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    // A shared Ad creative card can start far above Advantage (Primary text,
    // Headline, Description, CTA). Its top is not the section's top.
    const beginsWithAdvantage = /^(?:advantage\+\s*(?:creative|nội dung)|nội dung(?: quảng cáo)?\s+advantage\+)/i.test(textOf(card));
    const localCard = beginsWithAdvantage && rect.height <= 650 && headingRect.top - rect.top <= 40;
    const top = localCard ? rect.top : Math.max(rect.top, headingRect.top - 6);
    const inColumn = (node) => {
      const r = node.getBoundingClientRect();
      return Math.min(rect.right, r.right) - Math.max(rect.left, r.left) >= Math.min(rect.width, r.width) * .5;
    };
    const standalone = !/enhancements/i.test(textOf(heading));
    const following = nodes.filter((node) => inColumn(node) && node.getBoundingClientRect().top > headingRect.top + 20);
    const nextSection = following.filter((node) =>
      /^(?:creative testing|tracking|conversions|ad transparency|thử nghiệm nội dung|theo dõi|chuyển đổi)(?:\s|$)/i.test(textOf(node))
      || (startPattern.test(textOf(node)) && !(standalone && /enhancements/i.test(textOf(node)))))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    const limit = nextSection ? nextSection.getBoundingClientRect().top - 12 : Infinity;
    let bottom = rect.top + rect.height;
    const trial = following.filter((node) => /^(?:try it out|thử ngay)$/i.test(textOf(node)) && node.getBoundingClientRect().top < limit)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    if (trial) {
      const control = trial.closest?.('button, [role="button"]') || trial;
      const r = control.getBoundingClientRect();
      bottom = Math.min(bottom, r.top + r.height + 6);
    }
    // Translation can be a sibling of the enhancements container. Include
    // that local section, but never the next Advantage block or Creative testing.
    for (const translation of following.filter((node) => /^advantage\+\s*creative translation$/i.test(textOf(node)) && node.getBoundingClientRect().top < limit)) {
      for (let section = translation.parentElement; section && section !== document.body; section = section.parentElement) {
        const r = section.getBoundingClientRect();
        if (r.width >= 180 && r.height >= 40 && r.height <= 500 && /turned (?:on|off)|\bedit\b|chỉnh sửa/i.test(textOf(section))) {
          bottom = r.top + r.height;
          break;
        }
      }
    }
    bottom = Math.min(bottom, limit);
    const left = Math.max(captureRect.left, rect.left);
    const right = Math.min(captureRect.left + captureRect.width, rect.right);
    if (right - left < 40 || bottom - top < 30 || bottom - top > 900) return null;
    return {
      x: left - captureRect.left,
      y: scrollTop + top - captureRect.top,
      width: right - left,
      height: bottom - top
    };
  }

  function sectionHighlight(captureRect, scrollTop, kind) {
    const audience = kind === 'ta';
    if (audience ? !state.settings.highlightTA || state.currentLevel !== 'adset'
      : !state.settings.highlightBudget || !['campaign', 'adset'].includes(state.currentLevel)) return null;
    const pattern = audience ? /^(?:audience|targeting|đối tượng|nhắm mục tiêu)$/i
      : /^(?:budget(?:\s*(?:&|and)\s*schedule)?|ngân sách(?:\s*(?:và|&)\s*lịch trình)?)$/i;
    const textOf = (node) => String(node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
    const nodes = [...document.querySelectorAll('h1, h2, h3, h4, [role="heading"], strong, span, div')];
    const headings = nodes.filter((node) => {
      const r = node.getBoundingClientRect(), style = getComputedStyle(node);
      return node.children.length < 3 && pattern.test(textOf(node)) && r.width > 2 && r.height > 2
        && r.left >= captureRect.left && r.right <= captureRect.left + captureRect.width
        && style.display !== 'none' && style.visibility !== 'hidden';
    }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const heading = headings[0];
    if (!heading) return null;
    const title = heading.getBoundingClientRect();
    for (let node = heading.parentElement, depth = 0; node && node !== document.body && depth < 9; node = node.parentElement, depth++) {
      const r = node.getBoundingClientRect();
      // A local settings card starts near its heading. Never use the editor
      // column/page as the fallback region when a card cannot be established.
      if (r.width < 180 || r.width > captureRect.width || r.height < 70 || r.height > 2000
        || title.top - r.top > 60 || r.left < captureRect.left || r.right > captureRect.left + captureRect.width) continue;
      const details = audience ? /locations?|age|gender|custom audiences|vị trí|độ tuổi|giới tính/i
        : /daily|lifetime|budget strategy|campaign budget|ad set budget|start date|ngân sách hàng|ngày bắt đầu|[$€₫¥]|\b(?:usd|vnd)\b/i;
      if (!details.test(textOf(node))) continue;
      const containsOtherSection = nodes.some((other) => {
        if (other.children.length >= 3 || other === heading || !/^(?:ad transparency|placements|conversion|tracking|brand safety(?: and suitability)?|dynamic creative|creative testing|campaign details|identity|ad setup|budget(?:\s*(?:&|and)\s*schedule)?|audience)$/i.test(textOf(other))) return false;
        const b = other.getBoundingClientRect();
        return b.top > title.top + 20 && b.top < r.top + r.height && b.left >= r.left && b.right <= r.right;
      });
      if (containsOtherSection) continue;
      return { kind, x: r.left - captureRect.left, y: scrollTop + r.top - captureRect.top, width: r.width, height: r.height };
    }
    return null;
  }

  function previewSnapshot() {
    if (!state.preview?.isConnected || !visible(state.preview)) state.preview = findPreviewContainer();
    const el = state.preview || findPreviewContainer();
    if (!el) throw new Error('Không tìm thấy thanh cuộn ngoài cùng của trang Edit.');
    state.preview = el;
    const r = el === document.scrollingElement ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : el.getBoundingClientRect();
    const stickyPattern = state.currentLevel === 'adset'
      ? /^(estimated audience size|quy mô đối tượng (?:ước tính|dự kiến))(?:\s|$)/i
      : state.currentLevel === 'ad' ? /^(ad preview|bản xem trước quảng cáo)(?:\s|$)/i : null;
    const stickyLabel = stickyPattern
      ? [...document.querySelectorAll('span, div, [role="heading"]')]
        .filter((node) => {
          if (!visible(node) || node.children.length >= 8) return false;
          const rect = node.getBoundingClientRect();
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          return stickyPattern.test(text) && rect.left > r.left + r.width * .42 && rect.right <= r.left + r.width + 8;
        })
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return ar.left - br.left || ar.width * ar.height - br.width * br.height;
        })[0]
      : null;
    const stickyCutoffX = stickyLabel ? Math.max(r.left, stickyLabel.getBoundingClientRect().left - 20) : null;
    const rawBackground = getComputedStyle(el).backgroundColor;
    const backgroundColor = rawBackground && rawBackground !== 'rgba(0, 0, 0, 0)' ? rawBackground : '#edf6fc';
    const highlight = advantageHighlight(r, el.scrollTop);
    return {
      name: currentEntityName(), level: state.currentLevel, scrollTop: Math.round(el.scrollTop), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 5,
      rect: { left: Math.max(0, r.left), top: Math.max(0, r.top), width: Math.min(r.width, innerWidth - r.left), height: Math.min(r.height, innerHeight - r.top) },
      stickyCutoffX, backgroundColor, advantageHighlight: highlight,
      regionHighlights: [highlight && { ...highlight, kind: 'advantage' }, sectionHighlight(r, el.scrollTop, 'ta'), sectionHighlight(r, el.scrollTop, 'budget')].filter(Boolean),
      viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio
    };
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function contentSignature(container) {
    const viewport = container === document.scrollingElement
      ? { left: 0, right: innerWidth, top: 0, bottom: innerHeight }
      : container.getBoundingClientRect();
    const nodes = [...container.querySelectorAll('input, textarea, button, label, img, [role="heading"], [role="region"], [role="group"], [aria-busy="true"], [data-testid*="skeleton" i], [class*="skeleton" i]')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2 && rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom;
      })
      .slice(0, 240)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const value = node.tagName === 'IMG' ? `${node.currentSrc || node.src}:${node.complete ? 'done' : 'loading'}` : ('value' in node ? node.value : node.textContent);
        return `${Math.round(rect.top)}:${Math.round(rect.height)}:${String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100)}`;
      });
    const pending = [...container.querySelectorAll('[aria-busy="true"], [data-testid*="skeleton" i], [class*="skeleton" i], img:not([src=""])')]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const unfinishedImage = node.tagName === 'IMG' && (!node.complete || ((node.currentSrc || node.src) && node.naturalWidth === 0));
        const loader = node.tagName !== 'IMG';
        return (unfinishedImage || loader) && rect.width > 8 && rect.height > 8 && rect.right > viewport.left && rect.left < viewport.right && rect.bottom > viewport.top && rect.top < viewport.bottom;
      });
    return {
      value: hashText(`${Math.round(container.scrollTop)}|${container.scrollHeight}|${nodes.join('|')}`),
      skeletons: pending.length,
      pendingImages: pending.filter((node) => node.tagName === 'IMG').length,
      nodeCount: nodes.length
    };
  }

  async function waitForStableContent(container = state.preview, options = {}) {
    if (!container) throw new Error('Không tìm thấy vùng nội dung để chờ tải.');
    const minWait = state.settings.capturePace === 'steady'
      ? Math.max(1000, Number(options.settleMs || state.settings.settleMs || 1800)) : 600;
    const maxWait = Math.max(30000, minWait + 1800, Number(options.maxLoadWaitMs || state.settings.maxLoadWaitMs || 30000));
    const startedAt = Date.now();
    let previous = '';
    let stableSamples = 0;
    let lastState = null;
    while (Date.now() - startedAt < maxWait) {
      if (state.stopRequested) throw new Error('__MAC_STOPPED__');
      await sleep(200);
      lastState = contentSignature(container);
      if (lastState.value === previous) stableSamples++;
      else stableSamples = 0;
      previous = lastState.value;
      const elapsed = Date.now() - startedAt;
      const fullyLoaded = lastState.skeletons === 0 && lastState.nodeCount >= 4 && stableSamples >= 2;
      const stableWithPersistentLoader = lastState.pendingImages === 0 && lastState.skeletons <= 2 && lastState.nodeCount >= 8 && stableSamples >= 6 && elapsed >= 2400;
      // Campaign recommendations có số liệu/khối gợi ý tự cập nhật nên chữ ký
      // có thể không đứng yên dù phần form chính đã render đầy đủ. Khi không còn
      // quá hai loader và đã chờ đủ lâu, cho phép chụp thay vì lặp lỗi ba lần.
      const campaignReady = state.currentLevel === 'campaign'
        && lastState.pendingImages === 0
        && lastState.skeletons <= 2
        && lastState.nodeCount >= 8
        && elapsed >= Math.max(minWait + 1400, 3600);
      if (elapsed >= minWait && (fullyLoaded || stableWithPersistentLoader || campaignReady)) {
        return { stable: true, waitedMs: Date.now() - startedAt, persistentLoaders: stableWithPersistentLoader ? lastState.skeletons : 0 };
      }
    }
    return { stable: false, waitedMs: Date.now() - startedAt, skeletons: lastState?.skeletons || 0, nodeCount: lastState?.nodeCount || 0 };
  }

  async function requireStableContent(options = {}) {
    let result = await waitForStableContent(state.preview, options);
    if (!result.stable) {
      // Đánh thức một lượt render/lazy-load nữa trước khi kết luận lỗi. Việc
      // này hữu ích khi tab vừa bị đưa xuống nền hoặc người dùng mở tab mới.
      try { state.preview.dispatchEvent(new Event('scroll', { bubbles: true })); } catch {}
      try { window.dispatchEvent(new Event('resize')); } catch {}
      await sleep(900);
      result = await waitForStableContent(state.preview, options);
    }
    if (!result.stable) {
      throw new Error(`Meta chưa render được nội dung sau ${Math.round(result.waitedMs / 1000)} giây. Hãy mở tab Ads Manager một lần rồi chạy tiếp.`);
    }
    return result;
  }

  async function preparePreview() {
    const onAdLevel = [...document.querySelectorAll('label, [role="heading"], span, div')].some((el) => visible(el) && /^ad name$/i.test((el.textContent || '').trim()) && el.children.length < 3);
    if (!onAdLevel) throw new Error('Bạn đang mở Ad Set. Hãy chọn hàng Ad con có tên creative rồi chạy lại.');
    state.preview = findPreviewContainer();
    if (!state.preview) throw new Error('Không tìm thấy thanh cuộn ngoài cùng. Hãy mở một Ad trong màn hình Edit.');
    state.currentAd = currentAdName();
    state.visitedAds.add(state.currentAd.toLowerCase());
    await resetOuterScroll();
    await requireStableContent();
    return previewSnapshot();
  }

  function forceScrollTop(el) {
    if (!el || el.scrollTop === 0) return;
    try { el.scrollTo({ top: 0, behavior: 'instant' }); } catch { el.scrollTop = 0; }
    if (el === document.scrollingElement) {
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch {}
    }
    try { el.dispatchEvent(new Event('scroll', { bubbles: true })); } catch {}
  }

  async function resetOuterScroll() {
    let stableAtTop = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const detected = findPreviewContainer();
      // Chỉ cuộn scrollbar ngoài cùng đã nhận diện và document. Không quét mọi
      // div scrollable vì có thể chạm vào dropdown/khung thiết lập bên trong.
      const candidates = [...new Set([state.preview, detected, document.scrollingElement, document.documentElement, document.body])]
        .filter(Boolean);
      candidates.forEach(forceScrollTop);
      await sleep(220);
      state.preview = findPreviewContainer() || detected || state.preview;
      if (state.preview && state.preview.scrollTop <= 2) stableAtTop++;
      else stableAtTop = 0;
      if (stableAtTop >= 2) break;
    }
    state.preview = findPreviewContainer() || state.preview;
    if (state.preview?.scrollTop > 2) {
      forceScrollTop(state.preview);
      await sleep(220);
    }
  }

  async function prepareEntity(level) {
    state.currentLevel = level;
    if (!state.preview?.isConnected || !visible(state.preview)) state.preview = findPreviewContainer();
    await resetOuterScroll();
    if (!state.preview) throw new Error('Không tìm thấy scrollbar ngoài cùng của màn hình Edit.');
    await requireStableContent();
    if (!isLevelScreen(level)) throw new Error(`Màn hình hiện tại không ở cấp ${LEVEL_CONFIG[level]?.output || level}.`);
    return previewSnapshot();
  }

  function adItemsOnLeft() {
    return [...document.querySelectorAll('[role="rowheader"][aria-label="Ad" i]')]
      .filter(visible)
      .map((el) => {
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        return { el, text, name: text };
      })
      .filter((item) => /post\s*\d+/i.test(item.name));
  }

  function findLeftScroller(items) {
    const onLeft = (node) => {
      const r = node.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth * .5 && r.width > 80 && r.height > innerHeight * .35;
    };
    const leftPane = (node) => onLeft(node) && node.clientHeight > 0
      && node.scrollHeight >= node.clientHeight && /auto|scroll|hidden|overlay/.test(getComputedStyle(node).overflowY);
    const candidates = new Set();
    const collect = (seed) => {
      for (let node = seed; node && node !== document.body; node = node.parentElement) {
        if (leftPane(node)) candidates.add(node);
      }
    };
    const choose = () => [...candidates].sort((a, b) =>
      Number(b.scrollHeight > b.clientHeight + 2) - Number(a.scrollHeight > a.clientHeight + 2)
      || Number(/auto|scroll|overlay/.test(getComputedStyle(b).overflowY)) - Number(/auto|scroll|overlay/.test(getComputedStyle(a).overflowY))
      || (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
    // Do not stop at a non-scrolling overflow:hidden wrapper around the rows.
    // Look at every level even if this viewport contains only child Ads.
    const seeds = [...items.map((item) => item.el), ...document.querySelectorAll('[role="rowheader"], [role="treeitem"]')];
    seeds.forEach(collect);
    let best = choose();
    if (best && best.scrollHeight > best.clientHeight + 2 && /auto|scroll|overlay/.test(getComputedStyle(best).overflowY)) return best;
    for (const x of [innerWidth * .12, innerWidth * .22, innerWidth * .3]) {
      for (const hit of document.elementsFromPoint?.(x, innerHeight * .55) || []) collect(hit);
    }
    // During virtualized loading there may be no rows or hit-test target yet.
    // Search only the left pane, never the settings scrollbar on the right.
    for (const node of document.querySelectorAll('div, section, [role="grid"], [role="tree"]')) {
      if (leftPane(node)) candidates.add(node);
    }
    return choose() || null;
  }

  function findEntitySearchInput() {
    const root = document.getElementById('campaign_structure_tree_root');
    if (!root || !visible(root) || root.getBoundingClientRect().right > innerWidth * .5) return null;
    const inputs = [...root.querySelectorAll('input')].filter((input) => {
      const labels = (input.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '').join(' ');
      return visible(input) && ['text', 'search'].includes(input.type) && !input.disabled && !input.readOnly
        && [input.getAttribute('aria-label'), input.getAttribute('placeholder'), labels]
          .some((label) => /^(?:search|tìm kiếm|tìm)$/i.test((label || '').trim()));
    });
    return inputs.length === 1 ? inputs[0] : null;
  }

  async function searchEntityList(target, level) {
    if (state.stopRequested) throw new Error('__MAC_STOPPED__');
    const input = findEntitySearchInput();
    if (!input) throw new Error('Không xác định được ô Search / tìm kiếm duy nhất trong cây bên trái. Hãy mở ô Search rồi thử lại.');
    state.allowedSearch = input;
    try {
      input.focus({ preventScroll: true });
      // Use the native setter so React sees the replacement query as an input change.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, target);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { state.allowedSearch = null; }
    // Meta reflects React's committed query in the value attribute. The DOM
    // property alone changes before React is ready to handle Enter.
    const updateBy = Date.now() + Math.max(3000, Number(state.settings.maxLoadWaitMs) || 30000);
    do {
      await sleep(100);
      if (state.stopRequested) throw new Error('__MAC_STOPPED__');
      if (findEntitySearchInput() !== input || input.value !== target) throw new Error('Ô Search đã thay đổi trước khi áp dụng tìm kiếm.');
      if (!input.hasAttribute('value') || input.getAttribute('value') === target) break;
      if (Date.now() >= updateBy) throw new Error('Meta chưa cập nhật tên Search mới. Tool chưa gửi Enter để tránh tìm theo tên cũ.');
    } while (true);
    state.allowedSearch = input;
    try {
      for (const type of ['keydown', 'keyup']) {
        input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      }
    } finally { state.allowedSearch = null; }
    await sleep(500);
    return resetEntityListToTop(level, target);
  }

  async function settleEntityListAt(top, searchQuery = null, searchLevel = null) {
    let scroller = null, stable = 0, previous = '', emptyResult = false;
    const deadline = Date.now() + Math.max(3000, Number(state.settings.maxLoadWaitMs) || 30000);
    while (Date.now() < deadline) {
      emptyResult = false;
      if (state.stopRequested) throw new Error('__MAC_STOPPED__');
      const detected = findLeftScroller([]);
      if (detected !== scroller) { stable = 0; previous = ''; scroller = detected; }
      const desired = scroller ? Math.min(top, Math.max(0, scroller.scrollHeight - scroller.clientHeight)) : 0;
      if (scroller && Math.abs(scroller.scrollTop - desired) > 1) {
        if (desired === 0) forceScrollTop(scroller);
        else {
          try { scroller.scrollTo({ top: desired, behavior: 'instant' }); }
          catch { scroller.scrollTop = desired; }
          try { scroller.dispatchEvent(new Event('scroll', { bubbles: true })); } catch {}
        }
      }
      await sleep(250);
      if (findLeftScroller([]) !== scroller) { stable = 0; previous = ''; continue; }
      const root = scroller || document;
      const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const rows = [...root.querySelectorAll('[role="rowheader"], [role="treeitem"]')]
        .filter((row) => {
          const r = row.getBoundingClientRect();
          return visible(row) && r.right <= innerWidth * .5 && r.bottom > bounds.top && r.top < bounds.bottom;
        });
      const signature = rows.map((row) => `${row.getAttribute('aria-label')}:${row.textContent || ''}:${Math.round(row.getBoundingClientRect().top)}`).join('|');
      const search = searchQuery === null ? null : findEntitySearchInput();
      if (searchQuery !== null && (!search || search.value !== searchQuery)) throw new Error('Ô Search đã thay đổi trong lúc tìm. Tool dừng để tránh chọn kết quả cũ.');
      const loading = search?.getAttribute('aria-busy') === 'true' || [...root.querySelectorAll('[aria-busy="true"], [role="progressbar"], [class*="skeleton" i]')]
        .some((node) => visible(node) && node.getBoundingClientRect().right <= innerWidth * .5);
      const signatureWithPosition = `${Math.round(scroller?.scrollTop || 0)}:${scroller?.scrollHeight || 0}:${signature}`;
      const ready = rows.length || searchQuery !== null || (!scroller && detectCurrentLevel());
      stable = (!scroller || Math.abs(scroller.scrollTop - desired) <= 1) && ready && !loading && signatureWithPosition === previous ? stable + 1 : 0;
      const hasResults = searchLevel
        ? rows.some((row) => LEVEL_CONFIG[searchLevel].rowLabel.test(row.getAttribute('aria-label') || row.getAttribute('data-level') || ''))
        : rows.length;
      emptyResult = searchQuery !== null && !hasResults && !loading && stable >= 2;
      previous = signatureWithPosition;
      if (stable >= 2 && (hasResults || searchQuery === null)) return scroller;
    }
    // A retained parent row does not mean the requested Ad results have loaded.
    if (emptyResult) return scroller;
    throw new Error('Danh sách bên trái chưa cuộn hoặc tải ổn định. Tool chưa quét hết; hãy thử lại khi Meta tải xong.');
  }

  async function resetEntityListToTop(level, searchQuery = null) {
    try { return await settleEntityListAt(0, searchQuery, searchQuery === null ? null : level); }
    catch (error) {
      if (error.message === '__MAC_STOPPED__') throw error;
      throw new Error('Danh sách Campaign/Ad set/Ad bên trái chưa tải ổn định hoặc ô Search đã thay đổi. Tool không tìm từ vị trí cuộn hiện tại; hãy mở cây danh sách rồi thử lại.');
    }
  }

  function clickableFor(el) {
    const semantic = el.closest('[role="treeitem"], [role="row"], a, button');
    if (semantic) return semantic;
    let node = el;
    while (node && node !== document.body) {
      const r = node.getBoundingClientRect();
      if (r.height >= 24 && r.height <= 90 && (getComputedStyle(node).cursor === 'pointer' || node.onclick)) return node;
      node = node.parentElement;
    }
    return el;
  }

  async function selectNextAd() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const items = adItemsOnLeft();
      const unvisited = items.filter((item) => !state.visitedAds.has(item.name.toLowerCase()));
      unvisited.sort((a,b) => ((/_dp_|_fbr_|_ig_/i.test(b.text)?1:0)-(/_dp_|_fbr_|_ig_/i.test(a.text)?1:0)) || a.text.length-b.text.length);
      const next = unvisited[0];
      if (next) {
        state.visitedAds.add(next.name.toLowerCase());
        next.el.scrollIntoView({ block: 'center' });
        readOnlyClick(next.el);
        await sleep(Math.max(1600, state.settings.settleMs || 1000));
        state.preview = null;
        return { done: false, name: currentAdName(), snapshot: await preparePreview() };
      }
      const scroller = findLeftScroller(items);
      if (!scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5) return { done: true };
      const before = scroller.scrollTop;
      scroller.scrollTop += Math.floor(scroller.clientHeight * .75);
      await sleep(700);
      if (Math.abs(scroller.scrollTop - before) < 2) return { done: true };
    }
    return { done: true };
  }

  const normalized = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedExact = (value) => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  function truncatedNameMatch(value, target) {
    const candidate = normalizedExact(value);
    const wanted = normalizedExact(target);
    if (!candidate || !wanted || candidate === wanted) return candidate === wanted;
    const explicitTruncation = /(?:…|\.{2,})$/.test(candidate);
    const stem = candidate.replace(/(?:…|\.{2,})+$/g, '').trim();
    if (stem.length < 12 || stem.length >= wanted.length) return false;
    return wanted.startsWith(stem) && explicitTruncation;
  }

  function cleanEntityVariant(value) {
    return String(value || '')
      .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
      .replace(/(?:\s*default\s*action\s*menu|\s*defaultaction\s*menu)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function entityNameVariants(el, level) {
    const cleanRow = el.cloneNode(true);
    // SVG <title>default</title> and icon labels are metadata, not the name.
    // Remove their nodes, not suffix words that may be part of a real name.
    for (const decoration of cleanRow.querySelectorAll('button, [role="button"], [aria-haspopup], svg, img, [role="img"]')) decoration.remove();
    const cleanText = cleanRow.textContent;
    const values = [
      cleanText,
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.getAttribute('data-tooltip-content'),
      ...[...cleanRow.querySelectorAll('[title], [data-tooltip-content], span, div')].flatMap((node) => [node.getAttribute('title'), node.getAttribute('data-tooltip-content'), node.children.length === 0 ? node.textContent : '']),
      ...(String(cleanText || '').trim() ? [] : [el.innerText, el.textContent])
    ];
    const levelLabel = normalizedExact(LEVEL_CONFIG[level]?.aria || '');
    return [...new Set(values
      .map(cleanEntityVariant)
      .filter((value) => value && normalizedExact(value) !== levelLabel && value.length <= 500))];
  }

  function exactEntityMatch(item, target) {
    const wanted = normalizedExact(target);
    return !!wanted && (item.variants || [item.name]).some((value) =>
      normalizedExact(value) === wanted || truncatedNameMatch(value, target)
    );
  }

  function smallestVisibleText(pattern, root = document) {
    return [...root.querySelectorAll('[role="menuitem"], [role="button"], button, a, span, div')]
      .filter((node) => visible(node) && pattern.test((node.textContent || '').replace(/\s+/g, ' ').trim()))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      })[0] || null;
  }

  function activate(node) {
    if (!node) return false;
    const control = node.closest('[role="menuitem"], button, a, [role="button"]') || clickableFor(node);
    try { control.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
    readOnlyClick(control);
    return true;
  }

  function findSharePreviewTrigger() {
    const label = smallestVisibleText(/^(ad preview|bản xem trước quảng cáo)$/i);
    const labelRect = label?.getBoundingClientRect() || null;
    if (!labelRect) return null;
    let root = document, defaultsRect = null;
    // Meta has both one-row and two-row preview headers. Anchor the menu to
    // Review defaults inside the same preview card, not to a fixed screen corner.
    for (let node = label.parentElement; node && node !== document.body; node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.left < labelRect.left - 120) break;
      const defaults = smallestVisibleText(/^(?:review defaults|xem lại (?:cài đặt )?mặc định)(?:\s*\d+)?$/i, node);
      if (defaults) { root = node; defaultsRect = defaults.getBoundingClientRect(); break; }
    }
    const controls = [...root.querySelectorAll('button, [role="button"]')]
      .filter((node) => {
        if (!visible(node) || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8 && rect.height < 72;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const hints = [node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('data-tooltip-content'), node.textContent]
          .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        const exactShare = hints.some((hint) => /^(share|chia sẻ)$/i.test(hint));
        const mentionsShare = hints.some((hint) => /share|chia sẻ/i.test(hint));
        const otherAction = hints.some((hint) => /expand|full.?screen|maximi[sz]e|mở rộng|toàn màn hình|review defaults/i.test(hint));
        const sameHeaderRow = labelRect
          && rect.left > labelRect.right - 10
          && Math.abs((rect.top + rect.height / 2) - (labelRect.top + labelRect.height / 2)) < 48;
        const afterDefaults = defaultsRect && rect.left >= defaultsRect.right - 2
          && Math.abs((rect.top + rect.height / 2) - (defaultsRect.top + defaultsRect.height / 2)) < 24;
        const icons = [...node.querySelectorAll('svg, img, i')];
        const iconCount = icons.filter((icon) => !icons.some((other) => other !== icon && icon.contains?.(other))).length;
        const iconDropdown = root !== document && afterDefaults && !String(node.innerText ?? node.textContent ?? '').trim()
          && iconCount >= 2 && rect.width <= 100;
        const menuControl = node.getAttribute('aria-haspopup') === 'menu' || node.getAttribute('aria-haspopup') === 'true';
        const inPreviewToolbar = defaultsRect ? afterDefaults : sameHeaderRow;
        const score = (exactShare ? 8000 : mentionsShare ? 6000 : 0) + (menuControl ? 2000 : 0) + (iconDropdown ? 1000 : 0);
        return { node, score, inPreviewToolbar, mentionsShare, menuControl, iconDropdown, otherAction };
      })
      .filter((item) => !item.otherAction && item.inPreviewToolbar && (item.mentionsShare || item.menuControl || item.iconDropdown))
      .filter((item, _index, all) => !all.some((other) => other !== item && item.node.contains?.(other.node)))
      .sort((a, b) => b.score - a.score);
    if (controls.length > 1 && controls[0].score === controls[1].score) return null;
    return controls[0]?.node || null;
  }

  async function ensureAdPreviewEnabled() {
    const label = smallestVisibleText(/^(ad preview|bản xem trước quảng cáo)$/i);
    const labelRect = label?.getBoundingClientRect();
    const toggle = [...document.querySelectorAll('[role="switch"]')]
      .filter((node) => {
        if (!visible(node) || !labelRect) return false;
        const rect = node.getBoundingClientRect();
        return rect.left > innerWidth * .45
          && Math.abs((rect.top + rect.height / 2) - (labelRect.top + labelRect.height / 2)) < 45
          && Math.abs(rect.left - labelRect.left) < 420;
      })
      .sort((a, b) => Math.abs(a.getBoundingClientRect().left - labelRect.left) - Math.abs(b.getBoundingClientRect().left - labelRect.left))[0];
    if (!toggle) return;
    const checked = toggle.getAttribute('aria-checked');
    if (checked === 'false') throw new Error('Ad preview đang tắt. Hãy bật bản xem trước rồi chạy lại; tool không tự đổi switch.');
  }

  function urlsFromText(value) {
    return (String(value || '').replace(/&amp;/g, '&').match(/https?:\/\/[^\s"'<>]+/gi) || [])
      .map((url) => url.replace(/[),.;]+$/g, ''));
  }

  function canonicalPreviewUrl(value) {
    let candidate = String(value || '').trim();
    if (!/^https?:\/\//i.test(candidate)) return '';
    try {
      let parsed = new URL(candidate);
      if (/(^|\.)l\.facebook\.com$/i.test(parsed.hostname) && /^\/l\.php$/i.test(parsed.pathname)) {
        const target = parsed.searchParams.get('u');
        if (target && /^https?:\/\//i.test(target)) { candidate = target; parsed = new URL(target); }
      }
      if (/(^|\.)fb\.me$/i.test(parsed.hostname) && /^\/adspreview\/facebook\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname)) {
        return `https://fb.me${parsed.pathname.replace(/\/$/, '')}`;
      }
      if (/(^|\.)facebook\.com$/i.test(parsed.hostname) && /^\/ads\/(?:experience|preview)(?:\/|$)/i.test(parsed.pathname)) return parsed.toString();
      return '';
    } catch {
      return '';
    }
  }

  function previewUrlFrom(root) {
    const candidates = [];
    for (const node of root.querySelectorAll('input, textarea, a[href], [data-link], code, pre')) {
      if (!visible(node)) continue;
      const urls = urlsFromText(node.value || node.href || node.getAttribute('data-link') || node.textContent || '');
      candidates.push(...urls);
    }
    candidates.push(...urlsFromText(root.innerText || root.textContent || ''));
    const unique = [...new Set(candidates.map(canonicalPreviewUrl).filter(Boolean))];
    const preferred = unique.find((url) => /^https:\/\/fb\.me\/adspreview\/facebook\//i.test(url))
      || unique.find((url) => /facebook\.com\/(?:ads\/experience|ads\/preview)|fb\.me\/|preview/i.test(url));
    return preferred || '';
  }

  function visibleDialog() {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(visible).pop() || null;
  }

  async function closeSharePreviewUi() {
    const dialog = visibleDialog();
    if (dialog && /share|preview|chia sẻ|xem trước/i.test(dialog.textContent || '')) {
      const close = [...dialog.querySelectorAll('button, [role="button"]')].find((node) => {
        if (!visible(node)) return false;
        const hint = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''} ${node.textContent || ''}`.replace(/\s+/g, ' ').trim();
        return /\b(close|done|cancel|đóng|xong|hủy)\b/i.test(hint);
      });
      if (close) { readOnlyClick(close); await sleep(350); return; }
    }
    const openMenuItem = smallestVisibleText(/^(share a link|chia sẻ (?:một )?liên kết)$/i);
    if (openMenuItem) {
      const trigger = findSharePreviewTrigger();
      if (trigger) { readOnlyClick(trigger); await sleep(250); }
    }
  }

  async function capturePreviewLink(maxWaitMs = 12000, expectedLevel = state.currentLevel) {
    // The Ad name card is outside the viewport after a long capture, so a
    // visibility-based level check incorrectly reports that this is not an Ad.
    // The capture job already knows its level; restore the outer page to the
    // top before looking for the Share control.
    if (expectedLevel !== 'ad') throw new Error('Link preview chỉ có ở cấp Ad.');
    state.currentLevel = 'ad';
    await resetOuterScroll();
    await ensureAdPreviewEnabled();
    document.documentElement.removeAttribute('data-mac-preview-link');
    try {
      let shareLink = smallestVisibleText(/^(share a link|chia sẻ (?:một )?liên kết)$/i);
      if (!shareLink) {
        let trigger = findSharePreviewTrigger();
        const triggerDeadline = Date.now() + Math.min(10000, Math.max(4500, Number(maxWaitMs || 12000)));
        while (!trigger && Date.now() < triggerDeadline) {
          if (state.stopRequested) throw new Error('__MAC_STOPPED__');
          await sleep(250);
          trigger = findSharePreviewTrigger();
        }
        if (!trigger) throw new Error('Không tìm thấy nút Share previews trong khung Ad preview.');
        if (state.stopRequested) throw new Error('__MAC_STOPPED__');
        activate(trigger);
        const menuDeadline = Date.now() + Math.max(5000, Number(maxWaitMs) || 12000);
        while (!shareLink && Date.now() < menuDeadline) {
          if (state.stopRequested) throw new Error('__MAC_STOPPED__');
          await sleep(180);
          shareLink = smallestVisibleText(/^(share a link|chia sẻ (?:một )?liên kết)$/i);
        }
      }
      if (!shareLink) throw new Error('Đã mở menu nhưng không thấy mục Share a link.');
      if (state.stopRequested) throw new Error('__MAC_STOPPED__');
      activate(shareLink);

      const deadline = Date.now() + Math.max(5000, Number(maxWaitMs || 12000));
      let copyClicked = false;
      while (Date.now() < deadline) {
        if (state.stopRequested) throw new Error('__MAC_STOPPED__');
        await sleep(250);
        const tapped = canonicalPreviewUrl(document.documentElement.getAttribute('data-mac-preview-link') || '');
        if (/^https?:\/\//i.test(tapped)) return { link: tapped };
        const dialog = visibleDialog();
        // Read the dialog opened for this Ad, not old preview URLs elsewhere
        // in the editor. Copy interception is the fallback when no field exists.
        const found = dialog ? previewUrlFrom(dialog) : '';
        if (found) return { link: found };
        if (!copyClicked && dialog) {
          const copy = smallestVisibleText(/^(copy link|copy|sao chép liên kết|sao chép)$/i, dialog);
          if (copy) { activate(copy); copyClicked = true; }
        }
      }
      throw new Error('Meta không hiển thị URL preview để tool đọc.');
    } finally {
      await closeSharePreviewUi();
    }
  }

  function fuzzyMatchScore(candidate, target) {
    const clean = (value) => normalized(value)
      .replace(/\.{2,}|…/g, ' ')
      .replace(/[^a-z0-9_$À-ỹ]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const a = clean(candidate);
    const b = clean(target);
    if (!a || !b) return 0;
    let score = 0;
    if (a === b) score += 1000;
    if (a.length >= 6 && (a.includes(b) || b.includes(a))) score += 350;
    const postA = a.match(/\bpost\s*(\d+)/i)?.[1];
    const postB = b.match(/\bpost\s*(\d+)/i)?.[1];
    if (postA && postB) score += postA === postB ? 700 : -700;
    const stop = new Set(['post','dp','fbr','ig','q3','ad','ads']);
    const tokensA = new Set(a.split(' ').filter((token) => token.length > 2 && !stop.has(token)));
    const tokensB = new Set(b.split(' ').filter((token) => token.length > 2 && !stop.has(token)));
    const common = [...tokensA].filter((token) => tokensB.has(token)).length;
    const total = new Set([...tokensA, ...tokensB]).size;
    if (total) score += common / total * 250;
    return score;
  }

  function entityItems(level) {
    const aria = LEVEL_CONFIG[level]?.aria;
    if (!aria) return [];
    const items = [...document.querySelectorAll('[role="rowheader"], [role="treeitem"]')]
      .filter((el) => visible(el) && el.getBoundingClientRect().right <= innerWidth * .5
        && LEVEL_CONFIG[level].rowLabel.test((el.getAttribute('aria-label') || el.getAttribute('data-level') || '').trim()))
      .map((el) => {
        const variants = entityNameVariants(el, level);
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        const name = variants[0] || text;
        return { el, name, text, variants };
      }).filter((item) => item.name);
    // Some Meta layouts expose both a treeitem wrapper and its rowheader.
    // They describe one entity, not two duplicate names.
    return items.filter((item) => !items.some((other) => other !== item && item.el.contains?.(other.el)));
  }

  function entityGrid(items) {
    return findLeftScroller(items);
  }

  function entityParentContext(el) {
    const context = {};
    const grid = el?.closest('[role="grid"]') || document;
    const headers = [...grid.querySelectorAll('[role="rowheader"]')];
    const index = headers.indexOf(el);
    if (index < 0) return context;
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const header = headers[cursor];
      const aria = normalizedExact(header.getAttribute('aria-label'));
      const level = Object.keys(LEVEL_CONFIG).find((key) => LEVEL_CONFIG[key].rowLabel.test(aria));
      if (!level || context[level]) continue;
      context[level] = entityNameVariants(header, level);
      // Never borrow an Ad set from the preceding Campaign when its real
      // parent is outside the virtualized viewport.
      if (level === 'campaign') break;
    }
    return context;
  }

  function entityParentIds(el) {
    const ids = {};
    for (const level of ['campaign', 'adset']) {
      const direct = entityIds({ el }, level);
      if (direct.length) ids[level] = direct;
    }
    const grid = el?.closest('[role="grid"], [role="tree"]') || document;
    const headers = [...grid.querySelectorAll('[role="rowheader"], [role="treeitem"]')];
    const index = headers.indexOf(el);
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const header = headers[cursor];
      const level = ['campaign', 'adset'].find((key) => LEVEL_CONFIG[key].rowLabel.test(header.getAttribute('aria-label') || header.getAttribute('data-level') || ''));
      if (!level) continue;
      if (!ids[level]) ids[level] = entityIds({ el: header }, level);
      if (level === 'campaign') break;
    }
    return ids;
  }

  function matchesExpectedParents(item, expectedParents, level, expectedParentIds = {}) {
    const requiredLevels = level === 'ad' ? ['campaign', 'adset'] : level === 'adset' ? ['campaign'] : [];
    const requirements = requiredLevels.filter((key) => String(expectedParents?.[key] || '').trim());
    const parentIds = entityParentIds(item.el);
    if (!requiredLevels.every((key) => {
      if (!expectedParentIds[key]) return true;
      const wanted = normalizedEntityId(expectedParentIds[key], key);
      if (!wanted) return false;
      const known = parentIds[key] || [];
      return known.length ? known.includes(wanted) : normalizedEntityId(state.selectedIds?.[key], key) === wanted;
    })) return false;
    if (!requirements.length) return true;
    const context = entityParentContext(item.el);
    return requirements.every((key) => {
      const wanted = normalizedExact(expectedParents[key]);
      const variants = context[key] || [];
      if (variants.some((value) => normalizedExact(value) === wanted)) return true;
      const selectedParentIsExact = normalizedExact(state.selectedPath[key]) === wanted;
      if (!selectedParentIsExact) return false;
      return !variants.length || variants.some((value) => truncatedNameMatch(value, expectedParents[key]));
    });
  }

  function rememberSelectedPath(level, name, id = '') {
    state.selectedPath[level] = name;
    state.selectedIds[level] = normalizedEntityId(id, level);
    if (level === 'campaign') {
      delete state.selectedPath.adset;
      delete state.selectedPath.ad;
      delete state.selectedIds.adset;
      delete state.selectedIds.ad;
    } else if (level === 'adset') {
      delete state.selectedPath.ad;
      delete state.selectedIds.ad;
    }
  }

  function normalizedEntityId(value, level) {
    // Meta export prefixes describe the entity type, not part of its numeric ID.
    // Keep IDs as strings: these values can exceed Number's safe integer range.
    const prefixes = { campaign: ['cg'], adset: ['as', 'c'], ad: ['ad', 'a'] }[level];
    const match = String(value ?? '').trim().match(/^(?:([a-z]+):)?(\d{8,})$/i);
    return prefixes && match && (!match[1] || prefixes.includes(match[1].toLowerCase())) ? match[2] : '';
  }

  function entityIds(item, level) {
    const attribute = { ad: 'data-ad-id', adset: 'data-adset-id', campaign: 'data-campaign-id' }[level];
    if (!attribute) return [];
    // IDs may be on the navigation row rather than its label. Generic
    // data-id still must not be interpreted as an advertising ID.
    const row = item.el.closest?.('[role="row"], [role="treeitem"]');
    const attributeIds = [item.el, row, ...item.el.querySelectorAll(`[${attribute}]`)]
      .filter(Boolean).map((node) => normalizedEntityId(node.getAttribute(attribute), level))
      .filter(Boolean);
    // This Meta navigation ID is typed by its row label; generic data-id stays ignored.
    for (const node of [item.el, row].filter(Boolean)) {
      if (!LEVEL_CONFIG[level].rowLabel.test(node.getAttribute('aria-label') || '')) continue;
      const id = (node.getAttribute('id') || '').match(/^ads_campaign_structure_item_(\d{8,})$/)?.[1];
      if (id) attributeIds.push(id);
    }
    const links = [item.el, ...item.el.querySelectorAll('a[href]')];
    return [...new Set([...attributeIds, ...links.flatMap((node) => idsFromUrl(node.getAttribute('href') || '', level))])];
  }

  function idsFromUrl(value, level) {
    if (!String(value || '').trim() || String(value).trim().startsWith('#')) return [];
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:' || !/^(adsmanager|business|www)\.facebook\.com$/.test(url.hostname)) return [];
      const keys = { campaign: ['selected_campaign_ids', 'campaign_id'], adset: ['selected_adset_ids', 'adset_id'], ad: ['selected_ad_ids', 'ad_id'] }[level] || [];
      return keys.flatMap((key) => (url.searchParams.get(key) || '').split(','))
        .map((id) => normalizedEntityId(id, level)).filter(Boolean);
    } catch { return []; }
  }

  function currentEntityIds(level) {
    const fromUrl = idsFromUrl(location.href, level);
    if (fromUrl.length) return [...new Set(fromUrl)];
    const selected = entityItems(level).filter((item) => {
      const row = item.el.closest?.('[role="row"], [role="treeitem"]') || item.el;
      return [item.el, row].some((node) => node.getAttribute('aria-selected') === 'true' || node.getAttribute('aria-current') === 'page');
    }).flatMap((item) => entityIds(item, level));
    return [...new Set([...fromUrl, ...selected])];
  }

  async function selectNamedEntity(target, level, expectedParents = {}, expectedId = '') {
    if (!target?.trim()) throw new Error(`Tên ${LEVEL_CONFIG[level]?.output || level} đang trống.`);
    const checkedId = (id, key) => {
      if (!id) return '';
      const normalized = normalizedEntityId(id, key);
      if (!normalized) throw new Error(`ID ${id} không hợp lệ cho ${LEVEL_CONFIG[key]?.output || key}. Hãy kiểm tra cột ID trong file import; tool không chọn theo tên khi ID sai định dạng.`);
      return normalized;
    };
    expectedId = checkedId(expectedId, level);
    state.currentLevel = level;
    const requireExact = level === 'ad' || level === 'adset' || level === 'campaign';
    const currentMatches = requireExact
      ? normalizedExact(currentEntityName(level)) === normalizedExact(target)
      : fuzzyMatchScore(currentEntityName(level), target) >= 500;
    const verifiedScreenId = () => {
      const ids = currentEntityIds(level);
      return ids.length === 1 && ids[0] === String(expectedId);
    };
    if (isLevelScreen(level) && currentMatches && expectedId && verifiedScreenId()) {
      rememberSelectedPath(level, currentEntityName(level) || target, expectedId);
      return { done: false, snapshot: await prepareEntity(level) };
    }
    await searchEntityList(target, level);
    const scanned = new Set();
    const nearby = new Set();
    let rejection = '';
    let reachedBottom = false;
    const found = new Map();
    const candidateKey = (item, grid) => {
      const ids = entityIds(item, level);
      if (ids.length) return `id:${ids.sort().join(',')}`;
      const top = item.el.getBoundingClientRect().top;
      return `position:${Math.round((top + (grid?.scrollTop || 0) - (grid?.getBoundingClientRect?.().top || 0)) / 2)}`;
    };
    const openMatch = async (match) => {
        match.el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        readOnlyClick(match.el);
        state.preview = null;
        let selectedName = '';
        const loadWaitMs = Math.max(10000, Number(state.settings.maxLoadWaitMs || 30000));
        const loadedBy = Date.now() + loadWaitMs;
        do {
          if (state.stopRequested) throw new Error('__MAC_STOPPED__');
          await sleep(250);
          state.preview = findPreviewContainer() || state.preview;
          forceScrollTop(state.preview);
          if (isLevelScreen(level)) selectedName = currentEntityName(level);
          if (normalizedExact(selectedName) === normalizedExact(target) && (!expectedId || verifiedScreenId())) break;
        } while (Date.now() < loadedBy);
        if (requireExact && normalizedExact(selectedName) !== normalizedExact(target)) {
          throw new Error(`Đã tìm thấy ${LEVEL_CONFIG[level]?.output || level}: ${target}, nhưng Meta chưa mở đúng màn hình sau ${Math.round(loadWaitMs / 1000)} giây. Tên trong màn Edit: ${selectedName || 'chưa đọc được'}. Tool dừng để tránh chụp nhầm.`);
        }
        const verifiedIds = currentEntityIds(level);
        if (expectedId && !verifiedScreenId()) throw new Error(`Meta chưa mở đúng ID ${expectedId} của ${LEVEL_CONFIG[level]?.output}. ID đang mở: ${verifiedIds.join(', ') || 'chưa đọc được'}. Tool dừng để tránh chụp nhầm mục trùng tên.`);
        rememberSelectedPath(level, selectedName || target, expectedId || verifiedIds[0] || '');
        return { done: false, name: selectedName, snapshot: await prepareEntity(level) };
    };
    // maxLoadWaitMs bounds EACH render wait, not traversal of the whole tree.
    // A long expanded tree can take more than 30 seconds to reach a real name.
    for (let attempt = 0; attempt < 1000; attempt++) {
      if (state.stopRequested) throw new Error('__MAC_STOPPED__');
      const items = entityItems(level);
      items.forEach((item) => scanned.add(item.name));
      const wanted = normalizedExact(target).replace(/(?:…|\.{2,})+$/g, '').trim();
      for (const item of items) {
        if (wanted.length >= 6 && item.variants.some((value) => {
          const name = normalizedExact(value);
          return name.startsWith(wanted) && (/[\s_,.:/\-]/.test(name[wanted.length] || '') || /(?:…|\.{2,})$/.test(target));
        })) nearby.add(item.name);
      }
      const idMatch = expectedId && items.find((item) => entityIds(item, level).includes(String(expectedId)));
      if (idMatch && !exactEntityMatch(idMatch, target)) {
        throw new Error(`ID ${expectedId} thuộc ${LEVEL_CONFIG[level]?.output || level} "${idMatch.name}", khác tên yêu cầu "${target}". Hãy cập nhật tên đầy đủ từ Meta hoặc import file mới; tool không tự đổi tên hay chọn gần đúng.`);
      }
      const matches = requireExact
        ? items.filter((item) => exactEntityMatch(item, target)).map((item) => ({ ...item, score: 1000 }))
        : items.map((item) => ({ ...item, score: fuzzyMatchScore(item.name, target) })).filter((item) => item.score >= 120).sort((a,b) => b.score - a.score);
      const itemIds = (item) => entityIds(item, level);
      const compatible = expectedId ? matches.filter((item) => !itemIds(item).length || itemIds(item).includes(String(expectedId))) : matches;
      if (matches.length && !compatible.length) {
        rejection = `Tên khớp nhưng ID trong Meta (${[...new Set(matches.flatMap(itemIds))].join(', ')}) khác ID trong file (${expectedId}).`;
      }
      const exactNames = compatible.filter((item) => item.variants.some((value) => normalizedExact(value) === normalizedExact(target)));
      const candidates = exactNames.length ? exactNames : compatible;
      const byId = expectedId ? compatible.find((item) => itemIds(item).includes(String(expectedId))) : null;
      if (!byId && candidates.length > 1) throw new Error(`Có nhiều ${LEVEL_CONFIG[level]?.output} cùng tên trong kết quả tìm kiếm. Meta chưa cung cấp ID để phân biệt; tool dừng để tránh chụp nhầm.`);
      const grid = entityGrid(items);
      if (byId) return openMatch(byId);
      for (const match of candidates) {
        const key = candidateKey(match, grid);
        if (!found.has(key)) found.set(key, { key, top: grid?.scrollTop || 0 });
      }
      if (found.size > 1) throw new Error(`Có nhiều ${LEVEL_CONFIG[level]?.output} cùng tên trong kết quả tìm kiếm. Hãy import ID để phân biệt; tool dừng để tránh chụp nhầm.`);
      if (!grid) { reachedBottom = true; break; }
      if (!items.length) {
        // Ads-only viewports are normal while looking for a Campaign/Ad set.
        // Wait on ALL hierarchy rows; never treat a temporary empty level as EOF.
        const settled = await settleEntityListAt(grid?.scrollTop || 0, target);
        if (settled !== grid) continue;
      }
      if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 2) {
        await settleEntityListAt(grid.scrollTop, target);
        const current = entityGrid(entityItems(level));
        if (!current || current !== grid || current.scrollTop + current.clientHeight < current.scrollHeight - 2) continue;
        // One final pass over rows rendered after reaching the bottom.
        if (!reachedBottom) { reachedBottom = true; continue; }
        break;
      }
      reachedBottom = false;
      const before = grid.scrollTop;
      const moved = await settleEntityListAt(before + Math.max(100, Math.floor(grid.clientHeight * .75)), target);
      if (!moved || Math.abs(moved.scrollTop - before) < 2) throw new Error('Danh sách bên trái bị kẹt khi cuộn; tool chưa quét hết, không thể kết luận không tìm thấy tên.');
    }
    if (!reachedBottom) throw new Error('Danh sách quá dài hoặc đang thay đổi; tool chưa quét hết nên không thể kết luận không tìm thấy tên.');
    if (found.size === 1) {
      const candidate = [...found.values()][0];
      const grid = await settleEntityListAt(candidate.top, target);
      const match = entityItems(level).find((item) => exactEntityMatch(item, target)
        && candidateKey(item, grid) === candidate.key);
      if (!match) throw new Error('Danh sách đã thay đổi sau khi quét; tool dừng để tránh chọn nhầm.');
      return openMatch(match);
    }
    const parentPath = ['campaign', 'adset'].filter((key) => expectedParents?.[key]).map((key) => expectedParents[key]).join(' → ');
    const mode = `${requireExact ? ' theo đúng tên đầy đủ' : ''}${parentPath ? ` (nhóm trong file: ${parentPath})` : ''}`;
    if (rejection) throw new Error(`Đã thấy ${LEVEL_CONFIG[level]?.output || level}: ${target}. ${rejection} Tool dừng để tránh chụp nhầm.`);
    if (nearby.size) throw new Error(`Không có ${LEVEL_CONFIG[level]?.output || level} tên đầy đủ "${target}". Các tên có thêm hậu tố trong Meta: ${[...nearby].slice(0,8).join(' | ')}. Hãy dùng tên đầy đủ hoặc import file mới có ID; tool không tự chọn một mục cùng tiền tố.`);
    throw new Error(`Không tìm thấy ${LEVEL_CONFIG[level]?.output || level}${mode}: ${target}. Đã đọc: ${[...scanned].slice(0,8).join(' | ') || 'không có'}`);
  }

  async function selectNamedAd(target) {
    if (!String(target || '').trim()) return { done: true };
    return selectNamedEntity(target, 'ad');
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (![
      'MAC_PREPARE', 'MAC_PREVIEW_PREPARE', 'MAC_PREVIEW_SNAPSHOT', 'MAC_PREVIEW_SCROLL',
      'MAC_SELECT_NEXT_AD', 'MAC_SELECT_TARGET_AD', 'MAC_ENTITY_PREPARE', 'MAC_CAPTURE_INIT',
      'MAC_DETECT_LEVEL', 'MAC_SELECT_TARGET_ENTITY', 'MAC_GET_PREVIEW_LINK',
      'MAC_CONTENT_STOP', 'MAC_SNAPSHOT', 'MAC_SCROLL', 'MAC_RESTORE'
    ].includes(message.type)) return false;
    (async () => {
      if (message.type === 'MAC_PREPARE') {
        state.settings = message.settings || {};
        state.container = findScrollContainer();
        state.originalTop = state.container.scrollTop;
        hideChrome();
        state.container.scrollTop = 0;
        await sleep(message.settings?.settleMs || 900);
        respond({ ok: true, snapshot: snapshot() });
      } else if (message.type === 'MAC_PREVIEW_PREPARE') {
        state.settings = message.settings || {};
        state.stopRequested = false;
        respond({ ok: true, snapshot: await preparePreview() });
      } else if (message.type === 'MAC_PREVIEW_SNAPSHOT') {
        respond({ ok: true, snapshot: previewSnapshot() });
      } else if (message.type === 'MAC_PREVIEW_SCROLL') {
        if (!state.preview?.isConnected || !visible(state.preview)) state.preview = findPreviewContainer();
        if (!state.preview) throw new Error('Mất scrollbar ngoài cùng sau khi Meta cập nhật giao diện. Tool sẽ chụp lại mục này từ đầu.');
        const before = state.preview.scrollTop;
        const beforeHeight = state.preview.scrollHeight;
        const overlapRatio = Math.min(0.5, Math.max(0.1, Number(message.overlapRatio || state.settings.overlapRatio || 0.25)));
        const step = Math.max(200, Math.floor(state.preview.clientHeight * (1 - overlapRatio)));
        const target = message.toBottom ? state.preview.scrollHeight - state.preview.clientHeight : before + step;
        await window.__captureScrollTo(state.preview, target, () => state.stopRequested);
        await requireStableContent({ settleMs: message.settleMs, maxLoadWaitMs: message.maxLoadWaitMs });
        if (Math.abs(state.preview.scrollTop - before) <= 2 && state.preview.scrollHeight > beforeHeight + 8) {
          await window.__captureScrollTo(state.preview, message.toBottom ? state.preview.scrollHeight - state.preview.clientHeight : target, () => state.stopRequested);
          await requireStableContent({ settleMs: message.settleMs, maxLoadWaitMs: message.maxLoadWaitMs });
        }
        respond({ ok: true, moved: Math.abs(state.preview.scrollTop - before) > 2, snapshot: previewSnapshot() });
      } else if (message.type === 'MAC_SELECT_NEXT_AD') {
        respond({ ok: true, ...(await selectNextAd()) });
      } else if (message.type === 'MAC_SELECT_TARGET_AD') {
        respond({ ok: true, ...(await selectNamedAd(message.name)) });
      } else if (message.type === 'MAC_ENTITY_PREPARE') {
        state.settings = message.settings || {};
        state.stopRequested = false;
        respond({ ok: true, snapshot: await prepareEntity(message.level || 'ad') });
      } else if (message.type === 'MAC_CAPTURE_INIT') {
        state.settings = message.settings || {};
        state.stopRequested = false;
        state.readOnly = true;
        state.selectedPath = {};
        state.selectedIds = {};
        if (!findEntitySearchInput()) throw new Error('Hãy mở ô Search trong cây Campaign/Ad set/Ad bên trái trước khi bắt đầu.');
        respond({ ok: true, version: '6.6.2' });
      } else if (message.type === 'MAC_DETECT_LEVEL') {
        respond({ ok: true, level: detectCurrentLevel() });
      } else if (message.type === 'MAC_SELECT_TARGET_ENTITY') {
        respond({ ok: true, ...(await selectNamedEntity(message.name, message.level || 'ad', message.parentNames || {}, message.id || '')) });
      } else if (message.type === 'MAC_GET_PREVIEW_LINK') {
        respond({ ok: true, ...(await capturePreviewLink(message.maxWaitMs, message.level)) });
      } else if (message.type === 'MAC_CONTENT_STOP') {
        state.stopRequested = true;
        respond({ ok: true });
      } else if (message.type === 'MAC_SNAPSHOT') {
        respond({ ok: true, snapshot: snapshot() });
      } else if (message.type === 'MAC_SCROLL') {
        const before = state.container.scrollTop;
        const step = Math.max(200, Math.floor(state.container.clientHeight * (message.overlapRatio ? 1 - message.overlapRatio : 0.72)));
        state.container.scrollTop = Math.min(state.container.scrollHeight, before + step);
        await sleep(message.settleMs || 900);
        respond({ ok: true, moved: Math.abs(state.container.scrollTop - before) > 2, snapshot: snapshot() });
      } else if (message.type === 'MAC_RESTORE') {
        restore();
        respond({ ok: true });
      }
    })().catch((error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
