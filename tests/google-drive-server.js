const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let user = 'alice@example.test', writes = [], shared = 0, runAsOwner = false;
const context = {
  Session: { getActiveUser: () => ({ getEmail: () => user }) },
  DriveApp: {
    getRootFolder: () => ({ getOwner: () => ({ getEmail: () => runAsOwner ? 'owner@example.test' : user }), createFile: () => file('root') }),
    getFolderById: (id) => { if (id !== 'alice_folder_123' || user !== 'alice@example.test') throw new Error('Access denied'); return { createFile: () => file(id) }; },
    Access: { ANYONE_WITH_LINK: 'public' }, Permission: { VIEW: 'view' }
  },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/user-deployment/exec' }) },
  Utilities: { base64Decode: (data) => [...Buffer.from(data, 'base64')], newBlob: (bytes, type) => ({ getBytes: () => bytes, getContentType: () => type }) }
};
function file(folder) { writes.push({ user, folder }); return { setName() { return this; }, getId: () => 'image_id_123456', getName: () => 'test.png', getUrl: () => 'https://drive.google.com/file/d/image_id_123456/view', setSharing() { shared++; } }; }
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8') + '\nviewerSignature_ = () => "server-only-signature";', context);
const png = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');
assert.equal(context.browserDriveRequest('status', {}).account, user);
let result = context.browserDriveRequest('upload', { folderId: 'alice_folder_123', filename: 'test.png', dataUrl: png });
assert.equal(result.ok, true); assert.match(result.viewerLink, /user-deployment\/exec\?view=/); assert.equal(shared, 0);
user = 'bob@example.test';
assert.equal(context.browserDriveRequest('upload', { folderId: 'alice_folder_123', filename: 'test.png', dataUrl: png }).ok, false);
assert.equal(writes.length, 1);
assert.equal(context.browserDriveRequest('upload', { filename: 'test.png', dataUrl: png, makePublic: true }).ok, true);
assert.equal(writes.at(-1).user, user); assert.equal(writes.at(-1).folder, 'root'); assert.equal(shared, 1);
const count = writes.length;
assert.equal(context.browserDriveRequest('upload', { dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }).ok, false);
assert.equal(context.browserDriveRequest('upload', { dataUrl: 'data:image/png;base64,PHNjcmlwdD4=' }).ok, false);
assert.equal(context.browserDriveRequest('delete', {}).ok, false); assert.equal(writes.length, count);
assert.equal(context.browserDriveRequest('upload', { dataUrl: png, account: 'alice@example.test' }).ok, false);
runAsOwner = true;
assert.equal(context.browserDriveRequest('status', {}).ok, false, 'A deploy running as its owner must not impersonate another user');
assert.equal(writes.length, count);
console.log('PASS Google Drive server uses the signed-in user, rejects foreign folders/invalid images and shares only on explicit request');
