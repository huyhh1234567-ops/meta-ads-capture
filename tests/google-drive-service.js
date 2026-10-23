const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const endpoint = 'https://script.google.com/macros/s/user-app/exec', id = 'a'.repeat(32);
let stored = {}, tab = {}, sent = [], sequence = 0;
const context = { URL, crypto: { randomUUID: () => `00000000-0000-0000-0000-${String(++sequence).padStart(12, '0')}` },
  MAC_DRIVE_PACKAGE: { googleExecUrl: endpoint },
  chrome: { runtime: { id }, storage: { session: { get: async () => stored, set: async (value) => Object.assign(stored, value) } }, tabs: {
    create: async () => ({ id: 7 }), update: async (tabId, changes) => { tab = { id: tabId, ...changes }; },
    get: async () => tab, sendMessage: async (_id, message, options) => { sent.push({ message, options }); return { ok: true, account: 'alice@example.test', viewerLink: endpoint + '?view=image&sig=signature' }; }
  } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-drive-service.js'), 'utf8'), context);
(async () => {
  const api = context.MAC_GOOGLE_DRIVE;
  assert.equal((await api.status()).connected, false);
  await api.connect();
  const bridge = stored.googleDriveBridge;
  const ready = { type: 'MAC_GOOGLE_READY', nonce: bridge.nonce, client: id, account: 'alice@example.test' };
  const sender = { tab: { id: 7 }, frameId: 9, url: 'https://n-project-0lu-script.googleusercontent.com/userCodeAppPanel' };
  for (const fake of [{ ...sender, tab: { id: 8 } }, { ...sender, url: 'https://evil.example.test/' }, { ...sender, frameId: undefined }]) {
    assert.equal((await api.ready(ready, fake)).ok, false);
  }
  assert.equal((await api.ready({ ...ready, nonce: 'old-session' }, sender)).ok, false);
  const trustedUrl = tab.url;
  tab.url = 'https://script.google.com/macros/s/another-app/exec?connect=1';
  assert.equal((await api.ready(ready, sender)).ok, false);
  tab.url = trustedUrl;
  assert.equal((await api.ready(ready, sender)).ok, true);
  assert.equal((await api.status()).connected, true);
  await assert.rejects(api.request('upload', {}, 'bob@example.test'), /Tài khoản/);
  assert.equal(sent.length, 0);
  await api.request('upload', { folderId: 'alice_folder', account: 'attacker@example.test' }, 'alice@example.test');
  assert.equal(sent[0].options.frameId, 9); assert.equal(sent[0].message.payload.account, 'alice@example.test');
  assert.ok(!JSON.stringify(stored).includes('dataUrl')); assert.ok(!JSON.stringify(stored).includes('token'));
  // A new service worker restores the binding, but a navigated tab is rejected.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-drive-service.js'), 'utf8'), context);
  assert.equal((await context.MAC_GOOGLE_DRIVE.status()).connected, true);
  tab.url = 'https://script.google.com/home';
  await assert.rejects(context.MAC_GOOGLE_DRIVE.request('upload', {}), /đăng nhập/);
  const background = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  const uploads = [];
  const uploadContext = { URL, uploadQueue: Promise.resolve(), MAC_DRIVE_PACKAGE: { googleExecUrl: endpoint },
    MAC_GOOGLE_DRIVE: { request: async (...args) => { uploads.push(args); return { viewerLink: endpoint + '?view=image&sig=signature' }; } },
    fetch: async () => { throw new Error('Google mode must never send the private webhook token'); } };
  vm.createContext(uploadContext);
  vm.runInContext(background.slice(background.indexOf('function normalizedWebhookUrl('), background.indexOf('function formatLine(')), uploadContext);
  const link = await uploadContext.uploadThroughWebhook('image-bytes', 'test.png', { driveAuthMode: 'google', googleDriveAccount: 'alice@example.test', webhookToken: 'private-owner-token' });
  assert.match(link, /view=image/); assert.ok(!JSON.stringify(uploads).includes('private-owner-token'));
  uploadContext.MAC_GOOGLE_DRIVE.request = async () => ({ viewerLink: 'https://evil.example.test/image' });
  await assert.rejects(uploadContext.uploadThroughWebhook('image-bytes', 'test.png', { driveAuthMode: 'google' }), /deployment/);
  console.log('PASS nonce/tab/frame/deployment binding, account pinning, worker restart and navigation rejection without stored OAuth/upload secrets');
})().catch((error) => { console.error(error); process.exitCode = 1; });
