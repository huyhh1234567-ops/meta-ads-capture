/**
 * Meta Ads Capture - Google Drive upload webhook.
 *
 * SETUP DUY NHẤT CẦN SỬA:
 * 1. Đổi chuỗi UPLOAD_TOKEN bên dưới thành một mã riêng khó đoán.
 * 2. Deploy > New deployment > Web app.
 * 3. Execute as: Me. Who has access: Anyone.
 * 4. Dán URL /exec và UPLOAD_TOKEN vào extension.
 */
const UPLOAD_TOKEN = 'DOI-THANH-MA-RIENG-CUA-BAN';

function doGet(e) {
  const params = (e && e.parameter) || {};
  const fileId = String(params.view || '').trim();
  const signature = String(params.sig || '').trim();
  if (fileId) return imageViewer_(fileId, signature);
  return json_({
    ok: true,
    version: '5.4.0',
    viewer: true,
    signedViewer: true,
    service: 'Meta Ads Capture Drive Webhook',
    message: 'Webhook đang hoạt động.'
  });
}

function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    if (!UPLOAD_TOKEN || UPLOAD_TOKEN === 'DOI-THANH-MA-RIENG-CUA-BAN') {
      throw new Error('Bạn chưa đổi UPLOAD_TOKEN trong Code.gs.');
    }
    if (String(params.token || '') !== UPLOAD_TOKEN) {
      throw new Error('Mã bảo vệ upload không đúng.');
    }
    if (params.action === 'ping') {
      return json_({ ok: true, version: '5.4.0', viewer: true, signedViewer: true, message: 'Webhook, mã bảo vệ và link ảnh có chữ ký hợp lệ.' });
    }
    if (params.action !== 'upload') {
      throw new Error('Action không hợp lệ.');
    }

    const filename = safeFilename_(params.filename || 'MetaAdsCapture.png');
    const blob = dataUrlToBlob_(params.dataUrl, filename);
    const folderId = extractFolderId_(params.folderId || '');
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    const file = folder.createFile(blob).setName(filename);

    let isPublic = false;
    let warning = '';
    if (params.makePublic === '1') {
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        isPublic = true;
      } catch (sharingError) {
        warning = 'Đã upload nhưng tài khoản hoặc quản trị viên không cho phép chia sẻ công khai: ' + sharingError.message;
      }
    }

    const id = file.getId();
    const driveLink = file.getUrl();
    const isImage = /^image\//i.test(blob.getContentType());
    const directLink = isImage
      ? 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(id)
      : driveLink;
    const serviceUrl = ScriptApp.getService().getUrl();
    const viewerLink = isImage && serviceUrl
      ? serviceUrl + '?view=' + encodeURIComponent(id) + '&sig=' + encodeURIComponent(viewerSignature_(id))
      : driveLink;

    return json_({
      ok: true,
      id: id,
      name: file.getName(),
      link: viewerLink,
      viewerLink: viewerLink,
      directLink: directLink,
      driveLink: driveLink,
      public: isPublic,
      warning: warning
    });
  } catch (error) {
    return json_({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function imageViewer_(fileId, signature) {
  try {
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) throw new Error('ID ảnh không hợp lệ.');
    if (!signature || !safeEqual_(signature, viewerSignature_(fileId))) {
      throw new Error('Link ảnh thiếu hoặc sai chữ ký bảo mật.');
    }
    const file = DriveApp.getFileById(fileId);
    const name = escapeHtml_(file.getName());
    const mimeType = String(file.getMimeType() || '');
    if (!/^image\//i.test(mimeType)) throw new Error('File này không phải là ảnh.');

    // Link /uc của Drive có thể trả trang đăng nhập hoặc trang tải file, khiến
    // thẻ <img> bị vỡ dù Web App vẫn mở đúng. Nhúng dữ liệu ảnh trực tiếp để
    // người nhận link xem được mà không cần đăng nhập Drive.
    const imageUrl = 'data:' + mimeType + ';base64,' +
      Utilities.base64Encode(file.getBlob().getBytes());
    const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + name + '</title><style>' +
      'html,body{margin:0;background:#e9eef5;color:#fff;font:14px Arial,sans-serif}' +
      '.bar{position:sticky;top:0;z-index:2;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(17,19,24,.94);box-shadow:0 1px 8px #0008}' +
      '.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.actions{display:flex;gap:8px;flex:none}' +
      'a,button{color:#fff;text-decoration:none;border:1px solid #ffffff55;border-radius:8px;padding:7px 10px;background:transparent;cursor:pointer}' +
      'button.active{background:#1769e8;border-color:#1769e8}.stage{width:100%;overflow:auto;background:#e9eef5}' +
      '.image{display:block;height:auto;background:#fff;margin:0 auto}.image.fit{width:100%;max-width:none}.image.original{width:auto;max-width:none}' +
      '</style></head><body><div class="bar"><span class="name">' + name + '</span>' +
      '<span class="actions"><button id="fit" class="active">Vừa chiều ngang</button><button id="original">Kích thước gốc</button></span></div>' +
      '<div class="stage"><img id="image" class="image fit" src="' + imageUrl + '" alt="' + name + '"></div>' +
      '<script>(function(){var image=document.getElementById("image"),fit=document.getElementById("fit"),original=document.getElementById("original");' +
      'function mode(value){image.className="image "+value;fit.classList.toggle("active",value==="fit");original.classList.toggle("active",value==="original");window.scrollTo(0,0)}' +
      'fit.onclick=function(){mode("fit")};original.onclick=function(){mode("original")};})();<\/script></body></html>';
    return HtmlService.createHtmlOutput(html).setTitle(file.getName()).addMetaTag('viewport', 'width=device-width,initial-scale=1');
  } catch (error) {
    return HtmlService.createHtmlOutput('<p style="font:16px Arial;padding:24px">Không thể mở ảnh: ' + escapeHtml_(error.message || String(error)) + '</p>');
  }
}

function viewerSignature_(fileId) {
  if (!UPLOAD_TOKEN || UPLOAD_TOKEN === 'DOI-THANH-MA-RIENG-CUA-BAN') {
    throw new Error('Bạn chưa đổi UPLOAD_TOKEN trong Code.gs.');
  }
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(String(fileId), UPLOAD_TOKEN)
  ).replace(/=+$/g, '');
}

function safeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    difference |= (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^
      (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  }
  return difference === 0;
}

function dataUrlToBlob_(dataUrl, filename) {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;,]+)((?:;[^,]*)?),(.*)$/s);
  if (!match) throw new Error('Dữ liệu file không hợp lệ.');
  const mimeType = match[1] || 'application/octet-stream';
  const options = match[2] || '';
  const payload = match[3] || '';
  if (/;base64/i.test(options)) {
    return Utilities.newBlob(Utilities.base64Decode(payload), mimeType, filename);
  }
  return Utilities.newBlob(decodeURIComponent(payload), mimeType, filename);
}

function extractFolderId_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  throw new Error('Link thư mục Google Drive không hợp lệ.');
}

function safeFilename_(value) {
  return String(value || 'MetaAdsCapture')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 180);
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
