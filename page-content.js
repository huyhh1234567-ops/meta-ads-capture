(() => {
  if (window.__normalPageCaptureInstalled) return;
  window.__normalPageCaptureInstalled = true;
  const state = { settings: {}, container: null, originalTop: 0, stopped: false, hidden: [], fixedPrepared: false };
  const sleep = (ms) => chrome.runtime.sendMessage({ type: 'MAC_CONTENT_WAIT', ms });
  function findContainer() {
    if (state.settings.scrollSelector) {
      const custom = document.querySelector(state.settings.scrollSelector);
      if (custom) return custom;
      throw new Error('Không tìm thấy vùng cuộn tùy chọn.');
    }
    const root = document.scrollingElement;
    if (root.scrollHeight > root.clientHeight + 5) return root;
    return [...document.querySelectorAll('main, [role="main"], div, section')]
      .filter((node) => {
        const r = node.getBoundingClientRect(), style = getComputedStyle(node);
        return r.width > innerWidth * .5 && r.height > innerHeight * .45
          && r.bottom > 0 && r.top < innerHeight && style.visibility !== 'hidden'
          && /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 5;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      })[0] || root;
  }
  function snapshot() {
    const el = state.container;
    if (!el?.isConnected) throw new Error('Trang đã thay vùng cuộn. Tool sẽ chụp lại từ đầu.');
    const raw = el === document.scrollingElement ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : el.getBoundingClientRect();
    const left = Math.max(0, raw.left), top = Math.max(0, raw.top);
    return {
      // On app layouts only the main pane scrolls. Extending the whole window
      // leaves a white sidebar gutter and copies an unrelated footer into it.
      name: document.title || 'Trang hiện tại', level: 'page', wholePage: el === document.scrollingElement,
      scrollTop: Math.round(el.scrollTop), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 5,
      rect: { left, top, width: Math.min(innerWidth, raw.left + raw.width) - left, height: Math.min(innerHeight, raw.top + raw.height) - top },
      viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio,
      stickyCutoffX: null, advantageHighlight: null, backgroundColor: '#ffffff'
    };
  }
  function restoreFixed() {
    for (const { node, value, priority } of state.hidden) {
      if (value) node.style.setProperty('visibility', value, priority);
      else node.style.removeProperty('visibility');
    }
    state.hidden = [];
  }
  function hideFixed() {
    if (state.fixedPrepared) return;
    state.fixedPrepared = true;
    // Keep the header/sidebar once. Hiding overlays preserves their layout and
    // reveals the scrolled page beneath, unlike display:none which moves it.
    for (const node of document.querySelectorAll('*')) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (rect.top >= innerHeight || rect.bottom <= 0 || rect.width <= 0 || rect.height <= 0
        || node === state.container || node.contains(state.container) || !['fixed', 'sticky'].includes(style.position) || style.visibility === 'hidden') continue;
      state.hidden.push({ node, value: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility') });
      node.style.setProperty('visibility', 'hidden', 'important');
    }
  }
  async function stable() {
    const start = Date.now();
    let previous = '', count = 0;
    while (Date.now() - start < Math.max(10000, Number(state.settings.maxLoadWaitMs) || 30000)) {
      if (state.stopped) throw new Error('__MAC_STOPPED__');
      await sleep(300);
      const el = state.container;
      if (!el?.isConnected) throw new Error('Trang thay đổi vùng nội dung trong lúc chụp.');
      const pending = [...el.querySelectorAll('img, [aria-busy="true"]')].filter((node) => {
        const r = node.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight
          && getComputedStyle(node).visibility !== 'hidden' && (node.tagName !== 'IMG' || !node.complete);
      }).length;
      const signature = `${el.scrollTop}:${el.scrollHeight}:${el.clientHeight}:${pending}`;
      count = signature === previous ? count + 1 : 0; previous = signature;
      const minWait = state.settings.capturePace === 'steady' ? Math.max(1000, Number(state.settings.settleMs) || 1800) : 1000;
      if (!pending && count >= 3 && Date.now() - start >= minWait) return;
    }
    throw new Error('Trang chưa tải xong ảnh hoặc nội dung để chụp.');
  }
  async function prepare() {
    restoreFixed();
    state.fixedPrepared = false;
    state.container = findContainer();
    state.container.scrollTop = 0;
    await stable();
    return snapshot();
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!message.type?.startsWith('MAC_PAGE_')) return false;
    (async () => {
      if (message.type === 'MAC_PAGE_CAPTURE_INIT') {
        state.settings = message.settings || {}; state.stopped = false;
        state.container = findContainer(); state.originalTop = state.container.scrollTop;
        return { ok: true, version: '6.8.0' };
      }
      if (message.type === 'MAC_PAGE_ENTITY_PREPARE') return { ok: true, snapshot: await prepare() };
      if (message.type === 'MAC_PAGE_PREVIEW_SNAPSHOT') return { ok: true, snapshot: snapshot() };
      if (message.type === 'MAC_PAGE_PREVIEW_SCROLL') {
        const el = state.container, before = el.scrollTop;
        hideFixed();
        const target = message.toBottom ? el.scrollHeight - el.clientHeight : before + Math.max(100, Math.floor(el.clientHeight * (1 - (Number(message.overlapRatio) || .25))));
        await window.__captureScrollTo(el, target, () => state.stopped);
        await stable();
        return { ok: true, moved: Math.abs(el.scrollTop - before) > 2, snapshot: snapshot() };
      }
      if (message.type === 'MAC_PAGE_CONTENT_STOP') { state.stopped = true; return { ok: true }; }
      if (message.type === 'MAC_PAGE_RESTORE') {
        restoreFixed();
        if (state.container?.isConnected) state.container.scrollTop = state.originalTop;
        return { ok: true };
      }
      return { ok: false, error: 'Lệnh chụp trang không hợp lệ.' };
    })().then(respond).catch((error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
