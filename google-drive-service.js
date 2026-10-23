// Google owns the login session. Only a tab/frame binding is stored here.
globalThis.MAC_GOOGLE_DRIVE = (() => {
  const key = 'googleDriveBridge';
  const endpoint = () => globalThis.MAC_DRIVE_PACKAGE?.googleExecUrl || '';
  const read = async () => (await chrome.storage.session.get(key))[key];
  const save = async (value) => chrome.storage.session.set({ [key]: value });
  const trustedTab = (tab, bridge) => {
    try {
      const url = new URL(tab.url), expected = new URL(endpoint());
      const deployment = url.pathname.match(/^\/macros\/s\/([^/]+)\/exec$/)
        || url.pathname.match(/^\/a\/macros\/[^/]+\/s\/([^/]+)\/exec$/);
      const expectedDeployment = expected.pathname.match(/^\/macros\/s\/([^/]+)\/exec$/);
      return url.origin === expected.origin && !!deployment && !!expectedDeployment && deployment[1] === expectedDeployment[1]
        && url.searchParams.get('connect') === '1' && url.searchParams.get('nonce') === bridge.nonce
        && url.searchParams.get('client') === chrome.runtime.id;
    } catch { return false; }
  };
  async function status() {
    const bridge = await read();
    if (!bridge?.tabId) return { ok: true, connected: false };
    try {
      if (!trustedTab(await chrome.tabs.get(bridge.tabId), bridge)) return { ok: true, connected: false };
      return { ok: true, connected: bridge.ready === true, account: bridge.account || '' };
    } catch { return { ok: true, connected: false }; }
  }
  async function connect() {
    const execUrl = endpoint();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(execUrl)) throw new Error('Gói chưa được cấu hình deployment đăng nhập Google.');
    const bridge = { nonce: crypto.randomUUID(), ready: false, account: '' };
    const tab = await chrome.tabs.create({ url: 'about:blank' });
    bridge.tabId = tab.id;
    await save(bridge);
    const url = new URL(execUrl);
    url.searchParams.set('connect', '1'); url.searchParams.set('client', chrome.runtime.id); url.searchParams.set('nonce', bridge.nonce);
    await chrome.tabs.update(tab.id, { url: url.href, active: true });
    return { ok: true, pending: true };
  }
  async function ready(message, sender) {
    const bridge = await read();
    if (!bridge || sender.tab?.id !== bridge.tabId || message.nonce !== bridge.nonce || message.client !== chrome.runtime.id
      || !Number.isInteger(sender.frameId) || !/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com\//.test(sender.url || '')
      || typeof message.account !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(message.account) || message.account.length > 254) return { ok: false };
    if (!trustedTab(await chrome.tabs.get(bridge.tabId), bridge)) return { ok: false };
    await save({ ...bridge, frameId: sender.frameId, ready: true, account: message.account });
    return { ok: true };
  }
  async function request(action, payload = {}, expectedAccount = '') {
    const bridge = await read();
    if (!(await status()).connected) throw new Error('Hãy đăng nhập Google trong tool và giữ tab kết nối mở.');
    if (expectedAccount && expectedAccount !== bridge.account) throw new Error('Tài khoản Google đã thay đổi. Hãy dùng lại tài khoản của phiên chụp.');
    const result = await chrome.tabs.sendMessage(bridge.tabId, {
      type: 'MAC_GOOGLE_REQUEST', id: crypto.randomUUID(), nonce: bridge.nonce, client: chrome.runtime.id,
      action, payload: { ...payload, account: bridge.account }
    }, { frameId: bridge.frameId });
    if (!result?.ok) throw new Error(result?.error || 'Tab Google không phản hồi. Hãy kết nối lại.');
    if (result.account !== bridge.account) throw new Error('Tài khoản trong tab Google đã thay đổi. Hãy kết nối lại.');
    return result;
  }
  return { status, connect, ready, request };
})();
