(() => {
  if (window.__captureScrollTo) return;
  // Native easing, with worker timers: background tabs must not depend on rAF.
  window.__captureScrollTo = async (el, target, stopped) => {
    if (stopped()) throw new Error('__MAC_STOPPED__');
    if (!el.isConnected) throw new Error('Trang đã thay vùng cuộn. Tool sẽ chụp lại từ đầu.');
    const top = Math.max(0, Math.min(target, el.scrollHeight - el.clientHeight));
    if (Math.abs(el.scrollTop - top) < 1) return;
    const instant = () => {
      // Assigning scrollTop after scrollTo can start CSS smooth scrolling again.
      try { el.scrollTo({ top, behavior: 'instant' }); } catch { el.scrollTop = top; }
    };
    try {
      el.scrollTo({ top, behavior: 'smooth' });
      for (let attempt = 0; attempt < 6; attempt++) {
        await chrome.runtime.sendMessage({ type: 'MAC_CONTENT_WAIT', ms: 100 });
        if (stopped()) {
          try { el.scrollTo({ top: el.scrollTop, behavior: 'instant' }); } catch {}
          throw new Error('__MAC_STOPPED__');
        }
        if (!el.isConnected) throw new Error('Trang đã thay vùng cuộn. Tool sẽ chụp lại từ đầu.');
        if (Math.abs(el.scrollTop - top) < 1) break;
      }
    } catch (error) {
      if (stopped() || !el.isConnected) throw error;
    }
    // Cancel any unfinished easing before readiness checks/screenshot.
    instant();
  };
})();
