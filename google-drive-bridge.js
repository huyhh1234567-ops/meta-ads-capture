(() => {
  if (!/^[a-z0-9-]+-script\.googleusercontent\.com$/.test(location.hostname)) return;
  if (window.__macGoogleDriveBridge) return;
  const nonce = document.querySelector('meta[name="mac-drive-bridge"]')?.content;
  const client = document.querySelector('meta[name="mac-drive-client"]')?.content;
  if (!nonce || client !== chrome.runtime.id) return;
  window.__macGoogleDriveBridge = true;
  const pending = new Map();
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.nonce !== nonce || data.client !== client) return;
    if (data.type === 'MAC_GOOGLE_READY') {
      chrome.runtime.sendMessage(data).catch(() => {});
    } else if (data.type === 'MAC_GOOGLE_RESPONSE' && pending.has(data.id)) {
      const task = pending.get(data.id); pending.delete(data.id); clearTimeout(task.timer); task.respond(data.result);
    }
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.type !== 'MAC_GOOGLE_REQUEST' || message.nonce !== nonce || message.client !== client) return false;
    if (!['status', 'upload'].includes(message.action) || typeof message.id !== 'string') return false;
    const timer = setTimeout(() => { pending.delete(message.id); respond({ ok: false, error: 'Google xử lý quá lâu. Hãy kết nối lại rồi thử tiếp.' }); }, 120000);
    pending.set(message.id, { respond, timer });
    window.postMessage(message, location.origin);
    return true;
  });
  window.postMessage({ type: 'MAC_GOOGLE_HELLO', nonce, client }, location.origin);
})();
