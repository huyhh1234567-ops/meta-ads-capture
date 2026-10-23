const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let fileReads = 0;
const context = {
  DriveApp: { getFileById() { fileReads++; return {
    getName: () => 'Test <image>.png', getMimeType: () => 'image/png',
    getBlob: () => ({ getBytes: () => [1, 2, 3] }),
    getUrl: () => 'https://drive.google.com/file/d/test/view'
  }; } },
  Utilities: { base64Encode: (bytes) => Buffer.from(bytes).toString('base64') },
  HtmlService: { createHtmlOutput: (html) => ({ html, setTitle() { return this; }, addMetaTag() { return this; } }) }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8') +
  '\nviewerSignature_ = () => "valid-signature";', context);
const html = context.imageViewer_('test_file_id_12345', 'valid-signature').html;
assert.match(html, /id="fit"/); assert.match(html, /id="original"/);
assert.match(html, /src="data:image\/png;base64,AQID"/);
assert.match(html, /Test &lt;image&gt;\.png/);
assert.doesNotMatch(html, /Mở trong Drive|drive\.google\.com|<a\b/i);
const before = fileReads;
assert.match(context.imageViewer_('test_file_id_12345', 'wrong-signature').html, /chữ ký/);
assert.equal(fileReads, before, 'Invalid signatures must not read Drive files');
console.log('PASS signed image viewer keeps fit/original controls, removes Drive button, and rejects invalid signatures');
