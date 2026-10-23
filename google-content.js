(() => {
  if (window.__googleAdsCaptureInstalled) return;
  window.__googleAdsCaptureInstalled = true;
  const state = { settings: {}, container: null, stopped: false, running: false, name: '', level: 'campaign', originalTop: 0 };
  const sleep = (ms) => chrome.runtime.sendMessage({ type: 'MAC_CONTENT_WAIT', ms });
  const visible = (node) => {
    const r = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return r.width > 2 && r.height > 2 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  // Google settings are captured as displayed. No edit, Save, or Apply controls
  // are clicked, and input into settings is blocked while a capture is running.
  for (const type of ['click', 'beforeinput', 'keydown', 'paste', 'drop']) {
    document.addEventListener(type, (event) => {
      if (!state.running || !event.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
  }
  function container() {
    if (state.settings.scrollSelector) {
      const custom = document.querySelector(state.settings.scrollSelector);
      if (custom) return custom;
      throw new Error('Không tìm thấy vùng cuộn tùy chọn trên Google Ads.');
    }
    const main = document.querySelector('main, [role="main"]') || document.body;
    const candidates = [...main.querySelectorAll('*'), main]
      .filter((node) => {
        const r = node.getBoundingClientRect();
        return visible(node) && r.width > innerWidth * .45 && r.height > innerHeight * .45
          && node.scrollHeight > node.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(node).overflowY);
      }).sort((a, b) => {
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      });
    return candidates[0] || document.scrollingElement;
  }
  function pageName() {
    const heading = [...document.querySelectorAll('h1, [role="heading"][aria-level="1"], h2')].find(visible);
    return String(heading?.textContent || document.title || 'Google Ads').replace(/\s+/g, ' ').trim();
  }
  function snapshot() {
    const el = state.container;
    if (!el?.isConnected) throw new Error('Google đã thay vùng nội dung. Tool sẽ chụp lại từ đầu.');
    const raw = el === document.scrollingElement ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : el.getBoundingClientRect();
    const left = Math.max(0, raw.left), top = Math.max(0, raw.top);
    return {
      name: state.name || pageName(), level: state.level,
      scrollTop: Math.round(el.scrollTop), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 5,
      rect: { left, top, width: Math.min(raw.left + raw.width, innerWidth) - left, height: Math.min(raw.top + raw.height, innerHeight) - top },
      viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio,
      stickyCutoffX: null, advantageHighlight: null, backgroundColor: '#ffffff'
    };
  }
  async function stable() {
    const start = Date.now();
    const max = Math.max(10000, Number(state.settings.maxLoadWaitMs) || 30000);
    let last = '', samples = 0;
    while (Date.now() - start < max) {
      if (state.stopped) throw new Error('__MAC_STOPPED__');
      await sleep(350);
      const el = state.container;
      if (!el?.isConnected) throw new Error('Google đang chuyển màn.');
      const loaders = [...el.querySelectorAll('[aria-busy="true"], [role="progressbar"]')].filter((node) => {
        const r = node.getBoundingClientRect();
        return visible(node) && r.bottom > 0 && r.top < innerHeight && !node.closest('[aria-label*="strength" i]');
      });
      const value = `${el.scrollHeight}:${el.scrollTop}:${(el.innerText || '').slice(0, 18000)}`;
      samples = value === last ? samples + 1 : 0; last = value;
      const minWait = state.settings.capturePace === 'steady' ? Math.max(1000, Number(state.settings.settleMs) || 1800) : 1000;
      if (!loaders.length && samples >= 3 && Date.now() - start >= minWait) return;
    }
    throw new Error('Google Ads chưa tải xong nội dung để chụp.');
  }
  async function prepare(level, name = '') {
    state.level = level || state.settings.googleLevel || 'campaign';
    state.name = name;
    state.container = container();
    state.originalTop = state.container.scrollTop;
    for (let attempt = 0; attempt < 4; attempt++) {
      state.container.scrollTop = 0;
      await sleep(250);
      if (state.container.scrollTop <= 2) break;
    }
    await stable();
    return snapshot();
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (![
      'MAC_CAPTURE_INIT', 'MAC_DETECT_LEVEL', 'MAC_ENTITY_PREPARE',
      'MAC_PREVIEW_SNAPSHOT', 'MAC_PREVIEW_SCROLL', 'MAC_CONTENT_STOP',
      'MAC_RESTORE', 'MAC_GET_PREVIEW_LINK'
    ].includes(message.type)) return false;
    (async () => {
      if (message.type === 'MAC_CAPTURE_INIT') {
        state.settings = message.settings || {}; state.stopped = false; state.running = true;
        return { ok: true, version: '6.7.0' };
      }
      if (message.type === 'MAC_DETECT_LEVEL') return { ok: true, level: state.settings.googleLevel || 'campaign' };
      if (message.type === 'MAC_ENTITY_PREPARE') return { ok: true, snapshot: await prepare(message.level, message.name || '') };
      if (message.type === 'MAC_PREVIEW_SNAPSHOT') return { ok: true, snapshot: snapshot() };
      if (message.type === 'MAC_PREVIEW_SCROLL') {
        const el = state.container, before = el.scrollTop;
        const target = message.toBottom ? el.scrollHeight - el.clientHeight : before + Math.max(100, Math.floor(el.clientHeight * (1 - (Number(message.overlapRatio) || .25))));
        await window.__captureScrollTo(el, target, () => state.stopped);
        await stable();
        return { ok: true, moved: Math.abs(el.scrollTop - before) > 2, snapshot: snapshot() };
      }
      if (message.type === 'MAC_CONTENT_STOP') { state.stopped = true; return { ok: true }; }
      if (message.type === 'MAC_RESTORE') {
        state.running = false;
        if (state.container?.isConnected) state.container.scrollTop = state.originalTop;
        return { ok: true };
      }
      if (message.type === 'MAC_GET_PREVIEW_LINK') throw new Error('Chế độ Google hiện chụp ảnh; chưa lấy link preview tự động.');
      return { ok: false, error: 'Thao tác này chưa được hỗ trợ trên Google Ads.' };
    })().then(respond).catch((error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
