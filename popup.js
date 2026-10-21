const ids = [
  'filenamePrefix','folderId','webhookUrl','webhookToken','makePublic','rowSelector','nameSelector',
  'scrollSelector','previewSelector','currentNameSelector','adPattern','settleMs','maxLoadWaitMs','overlapRatio',
  'maxShots','highlightAdvantage','highlightTA','highlightBudget','hideChrome','exportJson','backgroundMode','autoHidePanel','compactLinks','platform','googlePages','googleLevel','captureMode','capturePace'
];
const $ = (id) => document.getElementById(id);
let timer = null;
let captureTree = [];
let importedTree = [];
let draggedNodeId = null;
const SESSION_IDS = ['session1'];
let activeSessionId = 'session1';
let captureSessions = {};

function emptySession(index) {
  return {
    tabId: '',
    targetCampaigns: '', targetAdsets: '', targetAds: '',
    includeCampaign: true, includeAdset: true,
    captureAdImage: true, captureAdPreview: true,
    captureTree: [], importedTree: [],
    label: 'Tab Meta'
  };
}

function activeSession() {
  return captureSessions[activeSessionId];
}

function syncFormToSession() {
  const session = activeSession();
  if (!session) return;
  session.targetCampaigns = $('targetCampaigns').value;
  session.targetAdsets = $('targetAdsets').value;
  session.targetAds = $('targetAds').value;
  session.includeCampaign = $('includeCampaign').checked;
  session.includeAdset = $('includeAdset').checked;
  session.captureAdImage = $('captureAdImage').checked;
  session.captureAdPreview = $('captureAdPreview').checked;
  session.captureTree = structuredClone(captureTree);
  session.importedTree = structuredClone(importedTree);
}

function syncSessionToForm() {
  const session = activeSession();
  if (!session) return;
  captureTree = structuredClone(session.captureTree || []);
  importedTree = structuredClone(session.importedTree || []);
  $('targetCampaigns').value = session.targetCampaigns || '';
  $('targetAdsets').value = session.targetAdsets || '';
  $('targetAds').value = session.targetAds || '';
  $('includeCampaign').checked = session.includeCampaign !== false;
  $('includeAdset').checked = session.includeAdset !== false;
  $('captureAdImage').checked = session.captureAdImage !== false;
  $('captureAdPreview').checked = session.captureAdPreview !== false;
  $('targetCampaigns').disabled = !$('includeCampaign').checked;
  $('targetAdsets').disabled = !$('includeAdset').checked;
  $('targetAds').disabled = !$('captureAdImage').checked && !$('captureAdPreview').checked;
  $('sessionHint').textContent = 'Tool sẽ dùng tab Ads Manager đang active khi bạn bấm bắt đầu.';
  document.querySelectorAll('.session-tab').forEach((button) => button.classList.toggle('active', button.dataset.session === activeSessionId));
  renderCaptureTree();
  if (captureTree.length) {
    const counts = treeCounts(captureTree);
    $('importStatus').textContent = `${session.label}: ${counts.campaign} Campaign, ${counts.adset} Ad Set, ${counts.ad} Ad.`;
  } else {
    $('importStatus').textContent = `${session.label}: chưa import file; tool sẽ dùng các ô nhập thủ công.`;
  }
}

async function saveSessions() {
  syncFormToSession();
  await chrome.storage.local.set({ captureSessions });
}

function destination() {
  return document.querySelector('input[name="destination"]:checked').value;
}

function renderPlatform() {
  const regular = $('captureMode').value === 'regular';
  const google = $('platform').value === 'google';
  $('platformChoice').classList.toggle('hidden', regular);
  $('googlePanel').classList.toggle('hidden', regular || !google);
  $('metaPanel').classList.toggle('hidden', regular || google);
  $('capture').querySelector('strong').textContent = regular ? 'Chụp trang hiện tại' : 'Bắt đầu xử lý';
  $('platformNotice').textContent = regular
    ? 'Chụp nội dung trang hiện tại thành một ảnh dài. Với Meta, lấy vùng thiết lập đang cuộn, bỏ menu và chân trang cố định để tránh mảng trắng. Kết quả là một link khi chọn Drive.'
    : google
    ? 'Mở trang Google Ads cần chụp. Mỗi màn thiết lập sẽ có một ảnh và link riêng.'
    : 'Mở Meta Ads Manager ở màn hình Edit và giữ cây Campaign / Ad set / Ad bên trái.';
}

function driveFolderId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  try {
    const id = new URL(raw).searchParams.get('id');
    if (id) return id;
  } catch {}
  return /^[a-zA-Z0-9_-]{10,}$/.test(raw) ? raw : null;
}

function normalizedWebhookUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com') return null;
    // Google Workspace đôi khi copy URL có thêm /a/ten-mien/. URL này có thể
    // trả trang đăng nhập hoặc 404 khi extension gọi, dù deployment vẫn sống.
    // Chỉ Deployment ID là cần thiết, nên luôn đưa về URL Web App công khai chuẩn.
    const deployment = url.pathname.match(/\/macros\/s\/([^/]+)\/exec\/?$/)
      || url.pathname.match(/\/a\/macros\/[^/]+\/s\/([^/]+)\/exec\/?$/);
    if (!deployment) return null;
    return `https://script.google.com/macros/s/${deployment[1]}/exec`;
  } catch {
    return null;
  }
}

function appsScriptNonJsonMessage(response, text) {
  const source = String(text || '');
  const finalUrl = String(response?.url || '');
  if (response?.status === 404 || /page not found|requested url was not found/i.test(source)) {
    return 'Không tìm thấy deployment Apps Script. Hãy dùng URL kết thúc bằng /exec; tool đã tự bỏ phần /a/tên-miền nếu có.';
  }
  if (/accounts\.google\.com|servicelogin|sign in with google|đăng nhập/i.test(`${finalUrl}\n${source}`)) {
    return 'Web App đang yêu cầu đăng nhập Google. Hãy Deploy Web app với Execute as: Me và Who has access: Anyone.';
  }
  if (response?.status === 413 || /request entity too large|payload too large/i.test(source)) {
    return 'Google từ chối vì dữ liệu gửi lên quá lớn. Hãy giảm số phần ảnh tối đa hoặc chụp lại mục này.';
  }
  const status = response?.status ? ` (HTTP ${response.status})` : '';
  return `Apps Script trả về trang web thay vì JSON${status}. Hãy mở Deploy > Manage deployments, chọn Web app, tạo New version và đặt quyền truy cập là Anyone.`;
}

const cleanHeader = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const cleanKey = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

function parseDelimited(text) {
  const firstLine = String(text || '').split(/\r?\n/, 1)[0] || '';
  const delimiter = ['\t', ',', ';'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function rowsFromFile(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const sheets = await globalThis.MetaAdsXlsx.parse(file);
    const useful = sheets.find((sheet) => (sheet.rows[0] || []).some((header) => cleanHeader(header) === 'campaign id')) || sheets[0];
    return useful?.rows || [];
  }
  return parseDelimited(await file.text());
}

function buildCaptureTree(rows) {
  const headers = (rows[0] || []).map(cleanHeader);
  const exactColumn = (...names) => headers.findIndex((header) => names.includes(header));
  const columns = {
    campaignId: exactColumn('campaign id', 'id chien dich'),
    campaignName: exactColumn('campaign name', 'ten chien dich'),
    adsetId: exactColumn('ad set id', 'adset id', 'id nhom quang cao'),
    adsetName: exactColumn('ad set name', 'adset name', 'ten nhom quang cao'),
    adId: exactColumn('ad id', 'id quang cao'),
    adName: exactColumn('ad name', 'ten quang cao')
  };
  if (columns.campaignName < 0 && columns.adsetName < 0 && columns.adName < 0) {
    throw new Error('Không tìm thấy cột Campaign Name / Ad Set Name / Ad Name.');
  }
  const value = (row, index) => index < 0 ? '' : String(row[index] || '').trim();
  const tree = [];
  const campaignMap = new Map();
  for (const row of rows.slice(1)) {
    const campaignName = value(row, columns.campaignName);
    const adsetName = value(row, columns.adsetName);
    const adName = value(row, columns.adName);
    if (!campaignName && !adsetName && !adName) continue;
    const campaignId = value(row, columns.campaignId);
    const campaignKey = campaignId || `name:${cleanKey(campaignName || 'Campaign hiện tại')}`;
    let campaign = campaignMap.get(campaignKey);
    if (!campaign) {
      campaign = { uid: `campaign:${campaignKey}`, id: campaignId, level: 'campaign', name: campaignName || 'Campaign hiện tại', children: [] };
      campaignMap.set(campaignKey, campaign);
      tree.push(campaign);
    }
    if (!adsetName && !adName) continue;
    const adsetId = value(row, columns.adsetId);
    const adsetKey = adsetId || `name:${cleanKey(adsetName || 'Ad set hiện tại')}`;
    let adset = campaign.children.find((node) => node.id ? node.id === adsetId : node.uid === `adset:${campaignKey}:${adsetKey}`);
    if (!adset) {
      adset = { uid: `adset:${campaignKey}:${adsetKey}`, id: adsetId, level: 'adset', name: adsetName || 'Ad set hiện tại', children: [] };
      campaign.children.push(adset);
    }
    if (!adName) continue;
    const adId = value(row, columns.adId);
    const adKey = adId || `name:${cleanKey(adName)}`;
    if (!adset.children.some((node) => node.id ? node.id === adId : node.uid === `ad:${adsetKey}:${adKey}`)) {
      adset.children.push({ uid: `ad:${adsetKey}:${adKey}`, id: adId, level: 'ad', name: adName, children: [] });
    }
  }
  return tree;
}

function walkTree(nodes, uid, parent = null) {
  for (const node of nodes) {
    if (node.uid === uid) return { node, siblings: nodes, parent };
    const found = walkTree(node.children || [], uid, node);
    if (found) return found;
  }
  return null;
}

function treeCounts(nodes, result = { campaign: 0, adset: 0, ad: 0 }) {
  for (const node of nodes) {
    result[node.level] = (result[node.level] || 0) + 1;
    treeCounts(node.children || [], result);
  }
  return result;
}

function updateManualListsFromTree() {
  const names = { campaign: [], adset: [], ad: [] };
  const visit = (nodes) => nodes.forEach((node) => { names[node.level].push(node.name); visit(node.children || []); });
  visit(captureTree);
  $('targetCampaigns').value = names.campaign.join('\n');
  $('targetAdsets').value = names.adset.join('\n');
  $('targetAds').value = names.ad.join('\n');
}

async function saveCaptureTree() {
  const session = activeSession();
  session.captureTree = structuredClone(captureTree);
  session.importedTree = structuredClone(importedTree);
  session.targetCampaigns = $('targetCampaigns').value;
  session.targetAdsets = $('targetAdsets').value;
  session.targetAds = $('targetAds').value;
  await chrome.storage.local.set({ captureSessions });
}

function moveTreeNode(sourceUid, targetUid) {
  const source = walkTree(captureTree, sourceUid);
  const targetBefore = walkTree(captureTree, targetUid);
  if (!source || !targetBefore || source.node === targetBefore.node) return false;
  const rank = { campaign: 0, adset: 1, ad: 2 };
  const sameLevel = source.node.level === targetBefore.node.level;
  const intoParent = rank[source.node.level] === rank[targetBefore.node.level] + 1;
  if (!sameLevel && !intoParent) return false;
  const sourceIndex = source.siblings.indexOf(source.node);
  source.siblings.splice(sourceIndex, 1);
  const target = walkTree(captureTree, targetUid);
  if (!target) { source.siblings.splice(sourceIndex, 0, source.node); return false; }
  if (sameLevel) target.siblings.splice(target.siblings.indexOf(target.node), 0, source.node);
  else target.node.children.push(source.node);
  return true;
}

function renderCaptureTree() {
  const manager = $('structureManager');
  const container = $('structureTree');
  manager.classList.toggle('hidden', !captureTree.length);
  container.replaceChildren();
  const labels = { campaign: 'C', adset: 'AS', ad: 'A' };
  const renderNodes = (nodes, host) => {
    for (const node of nodes) {
      const branch = document.createElement('div');
      branch.className = 'tree-branch';
      const row = document.createElement('div');
      row.className = 'tree-row';
      row.draggable = true;
      row.dataset.uid = node.uid;
      row.dataset.level = node.level;
      const handle = document.createElement('span'); handle.className = 'drag-handle'; handle.textContent = '⋮⋮';
      const badge = document.createElement('span'); badge.className = 'tree-badge'; badge.textContent = labels[node.level];
      const name = document.createElement('span'); name.className = 'tree-name'; name.textContent = node.name; name.title = node.id ? `${node.name}\nID: ${node.id}` : node.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'tree-remove'; remove.textContent = '×'; remove.title = 'Bỏ mục này';
      row.append(handle, badge, name, remove);
      row.addEventListener('dragstart', () => { draggedNodeId = node.uid; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { draggedNodeId = null; document.querySelectorAll('.tree-row').forEach((item) => item.classList.remove('dragging', 'drop-target')); });
      row.addEventListener('dragover', (event) => {
        if (!draggedNodeId) return;
        const source = walkTree(captureTree, draggedNodeId);
        const target = walkTree(captureTree, node.uid);
        const rank = { campaign: 0, adset: 1, ad: 2 };
        if (source && target && (source.node.level === target.node.level || rank[source.node.level] === rank[target.node.level] + 1)) {
          event.preventDefault(); row.classList.add('drop-target');
        }
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
      row.addEventListener('drop', async (event) => {
        event.preventDefault(); row.classList.remove('drop-target');
        if (moveTreeNode(draggedNodeId, node.uid)) { updateManualListsFromTree(); renderCaptureTree(); await saveCaptureTree(); }
      });
      remove.addEventListener('click', async () => {
        const found = walkTree(captureTree, node.uid);
        if (found) found.siblings.splice(found.siblings.indexOf(found.node), 1);
        updateManualListsFromTree(); renderCaptureTree(); await saveCaptureTree();
      });
      branch.append(row);
      if (node.children?.length) {
        const children = document.createElement('div'); children.className = 'tree-children';
        renderNodes(node.children, children); branch.append(children);
      }
      host.append(branch);
    }
  };
  renderNodes(captureTree, container);
  const counts = treeCounts(captureTree);
  $('treeSummary').textContent = `${counts.campaign} Campaign · ${counts.adset} Ad set · ${counts.ad} Ad`;
}

function showError(message) {
  $('status').classList.remove('hidden');
  const card = document.querySelector(`[data-status-session="${activeSessionId}"]`);
  card?.classList.remove('inactive');
  const text = card?.querySelector('.session-status-text');
  if (text) text.textContent = message;
  $('badge').textContent = 'Có lỗi';
  $('capture').disabled = false;
}

function renderDestination() {
  const isDrive = destination() === 'drive';
  $('localChoice').classList.toggle('selected', !isDrive);
  $('driveChoice').classList.toggle('selected', isDrive);
  $('drivePanel').classList.toggle('hidden', !isDrive);
}

function displayedResult(result) {
  if (!result) return '';
  return $('compactLinks').checked
    ? (result.compactReport || result.report || '')
    : (result.report || result.copyText || '');
}

function refreshResultDisplays() {
  document.querySelectorAll('.session-result').forEach((card) => {
    if (!card._copyPayload) return;
    renderResultCard(card, card._copyPayload);
  });
}

function renderResultCard(card, result) {
  const textarea = card.querySelector('.session-result-text');
  const rich = card.querySelector('.session-result-rich');
  const showRich = $('compactLinks').checked && Boolean(result?.copyHtml);
  textarea.value = displayedResult(result);
  textarea.classList.toggle('hidden', showRich);
  rich.classList.toggle('hidden', !showRich);
  if (showRich) rich.innerHTML = result.copyHtml;
  else rich.replaceChildren();
}

async function load() {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get(['webhookToken', 'captureTree', 'importedTree', 'captureSessions', 'googlePages'])
  ]);
  const saved = { ...(synced.settings || {}), webhookToken: local.webhookToken || '', googlePages: local.googlePages ?? synced.settings?.googlePages ?? '' };
  const storedSession = local.captureSessions?.session1 || {};
  const fallbackSession = {
    targetCampaigns: Array.isArray(saved.targetCampaigns) ? saved.targetCampaigns.join('\n') : String(saved.targetCampaigns || ''),
    targetAdsets: Array.isArray(saved.targetAdsets) ? saved.targetAdsets.join('\n') : String(saved.targetAdsets || ''),
    targetAds: Array.isArray(saved.targetAds) ? saved.targetAds.join('\n') : String(saved.targetAds || ''),
    captureTree: Array.isArray(local.captureTree) ? local.captureTree : [],
    importedTree: Array.isArray(local.importedTree) ? local.importedTree : []
  };
  const migrated = { ...emptySession(1), ...fallbackSession, ...storedSession };
  migrated.label = 'Tab Meta';
  if (!Object.prototype.hasOwnProperty.call(storedSession, 'captureAdImage')) {
    migrated.captureAdImage = storedSession.includeAd !== false && storedSession.adPreviewOnly !== true;
  }
  if (!Object.prototype.hasOwnProperty.call(storedSession, 'captureAdPreview')) {
    migrated.captureAdPreview = storedSession.includeAd !== false && (storedSession.adPreviewOnly === true || saved.capturePreviewLinks !== false);
  }
  captureSessions = { session1: migrated };
  for (const id of ids) {
    if (saved[id] === undefined) continue;
    const el = $(id);
    el.type === 'checkbox'
      ? el.checked = saved[id]
      : el.value = Array.isArray(saved[id]) ? saved[id].join('\n') : saved[id];
  }
  if (Number($('maxLoadWaitMs').value) < 30000) $('maxLoadWaitMs').value = '30000';
  document.querySelector(`input[name="destination"][value="${saved.uploadDrive ? 'drive' : 'local'}"]`).checked = true;
  renderDestination();
  renderPlatform();
  syncSessionToForm();
  await poll();
}

function baseSettings() {
  const data = {};
  for (const id of ids) {
    const el = $(id);
    data[id] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value.trim();
  }
  data.uploadDrive = destination() === 'drive';
  data.folderId = driveFolderId(data.folderId);
  data.webhookUrl = normalizedWebhookUrl(data.webhookUrl);
  return data;
}

function navigationTree(nodes, enabled) {
  const result = [];
  for (const node of nodes || []) {
    const children = navigationTree(node.children || [], enabled);
    const captureEnabled = enabled[node.level] === true;
    if (captureEnabled || children.length) result.push({ ...node, captureEnabled, children });
  }
  return result;
}

function sessionSettings(base, id, index) {
  const session = captureSessions[id];
  const captureAdImage = session.captureAdImage !== false;
  const captureAdPreview = session.captureAdPreview !== false;
  const enabled = { campaign: session.includeCampaign !== false, adset: session.includeAdset !== false, ad: captureAdImage || captureAdPreview };
  const lines = (value) => String(value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return {
    ...base,
    sessionId: id,
    filenamePrefix: base.filenamePrefix,
    captureLevels: enabled,
    captureAdImage,
    captureAdPreview,
    captureTree: navigationTree(session.captureTree || [], enabled),
    targetCampaigns: enabled.campaign ? lines(session.targetCampaigns) : [],
    targetAdsets: enabled.adset ? lines(session.targetAdsets) : [],
    targetAds: enabled.ad ? lines(session.targetAds) : []
  };
}

function setDriveConnected(connected) {
  $('driveDot').classList.toggle('connected', connected);
  $('driveStatus').textContent = connected ? 'Webhook đã sẵn sàng' : 'Webhook chưa được kiểm tra';
  $('connect').textContent = connected ? 'Kiểm tra lại' : 'Kiểm tra';
}

async function testWebhook(showFailure = true) {
  const url = normalizedWebhookUrl($('webhookUrl').value);
  const token = $('webhookToken').value.trim();
  if (!url) {
    const message = 'Hãy dán URL Apps Script kết thúc bằng /exec.';
    setDriveConnected(false);
    $('driveStatus').textContent = message;
    if (showFailure) showError(message);
    return false;
  }
  if (!token) {
    const message = 'Hãy nhập mã bảo vệ giống UPLOAD_TOKEN trong Code.gs.';
    setDriveConnected(false);
    $('driveStatus').textContent = message;
    if (showFailure) showError(message);
    return false;
  }
  try {
    // Hiển thị và lưu lại URL chuẩn nếu người dùng dán link theo miền Workspace.
    $('webhookUrl').value = url;
    $('connect').textContent = 'Đang kiểm tra…';
    // Chỉ kiểm tra trạng thái bằng GET. ContentService của Apps Script trả POST
    // qua một URL googleusercontent dùng một lần; URL tạm này đôi lúc trả 404
    // dù Web App vẫn hoạt động và khiến cả phiên chụp bị chặn oan.
    const checkUrl = new URL(url);
    checkUrl.searchParams.set('check', String(Date.now()));
    const response = await fetch(checkUrl.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error(appsScriptNonJsonMessage(response, text)); }
    if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    if (payload.viewer !== true) throw new Error('Web App đang dùng Code.gs cũ. Hãy cập nhật Code.gs và Deploy phiên bản mới để link ảnh mở đúng trang xem.');
    if (payload.signedViewer !== true) throw new Error('Web App đang dùng Code.gs cũ. Hãy Deploy bản 5.4.0 để link ảnh có chữ ký bảo mật.');
    setDriveConnected(true);
    return true;
  } catch (error) {
    setDriveConnected(false);
    const message = `Không thể dùng webhook: ${error.message}`;
    $('driveStatus').textContent = message;
    if (showFailure) showError(message);
    return false;
  }
}

async function closeToolPanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof chrome.sidePanel?.close === 'function' && tab?.windowId) {
      await chrome.sidePanel.close({ windowId: tab.windowId });
      return;
    }
  } catch {}
  try { window.close(); } catch {}
}

async function capture(resumeCapture = false) {
  try {
    syncFormToSession();
    const base = baseSettings();
    if (base.uploadDrive && base.folderId === null) {
      $('driveStatus').textContent = 'Link thư mục Drive không hợp lệ.';
      $('folderId').focus();
      showError('Link thư mục Google Drive không hợp lệ.');
      return;
    }
    if (base.uploadDrive && base.webhookUrl === null) {
      $('webhookUrl').focus();
      showError('URL Apps Script Web App không hợp lệ. URL phải kết thúc bằng /exec.');
      return;
    }
    const settings = sessionSettings(base, 'session1', 0);
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeUrl = activeTab?.url || '';
    const isAdsManager = /^https:\/\/adsmanager\.facebook\.com\//i.test(activeUrl)
      || (/^https:\/\/(?:www|business)\.facebook\.com\//i.test(activeUrl)
        && /(?:adsmanager|ads\/manager)/i.test(activeUrl));
    const google = base.platform === 'google';
    const regular = base.captureMode === 'regular';
    if (!activeTab?.id || (regular ? !/^https?:\/\//i.test(activeUrl) : google ? !/^https:\/\/ads\.google\.com\//i.test(activeUrl) : !isAdsManager)) {
      if (regular) throw new Error('Hãy mở trang web cần chụp. Chrome không cho chụp trang nội bộ như chrome://.');
      throw new Error(`Hãy mở tab ${google ? 'Google Ads' : 'Meta Ads Manager'} trước mặt rồi bấm bắt đầu.`);
    }
    if (regular) {
      const pageUrl = new URL(activeUrl);
      const origins = [`${pageUrl.protocol}//${pageUrl.hostname}/*`];
      if (!(await chrome.permissions.contains({ origins })) && !(await chrome.permissions.request({ origins }))) {
        throw new Error('Chưa có quyền chụp trang này. Bấm chụp lại và cho phép truy cập trang.');
      }
    }
    activeSession().label = regular ? 'Trang hiện tại' : google ? 'Google Ads' : 'Tab Meta';
    if (google || regular) {
      settings.captureTree = [];
      settings.targetCampaigns = []; settings.targetAdsets = []; settings.targetAds = [];
      settings.captureLevels = { campaign: true, adset: true, ad: true };
      settings.captureAdImage = true; settings.captureAdPreview = false;
    }
    settings.tabId = activeTab.id;
    settings.resumeCapture = resumeCapture === true;
    if (!Object.values(settings.captureLevels).some(Boolean)) throw new Error('Hãy bật ít nhất một cấp Campaign, Ad set hoặc Ad.');
    const persisted = { ...base, webhookToken: '', googlePages: '' };
    await Promise.all([
      chrome.storage.sync.set({ settings: persisted }),
      chrome.storage.local.set({ webhookToken: base.webhookToken, googlePages: base.googlePages, captureSessions, quickCaptureSettings: { ...settings, resumeCapture: false } })
    ]);
    if (base.uploadDrive && !(await testWebhook())) return;

    $('capture').disabled = true;
    $('stop').classList.remove('hidden');
    $('stop').disabled = false;
    $('stop').textContent = 'Dừng tool';
    $('resume').classList.add('hidden');
    if (!resumeCapture) {
      $('resultPanel').classList.add('hidden');
      document.querySelectorAll('.session-result').forEach((card) => card.classList.add('inactive'));
    }
    $('status').classList.remove('hidden');
    for (const id of SESSION_IDS) {
      const card = document.querySelector(`[data-status-session="${id}"]`);
      card.classList.remove('inactive');
      card.querySelector('.session-status-text').textContent = 'Đang gửi yêu cầu…';
      card.querySelector('.session-percent').textContent = '0%';
      card.querySelector('progress').value = 0;
    }
    $('badge').textContent = 'Đang chạy';

    const response = await chrome.runtime.sendMessage({ type: 'MAC_START_SINGLE', settings });
    if (!response?.ok) {
      showError(response?.error || 'Không thể bắt đầu. Hãy reload extension và thử lại.');
      return;
    }
    if (base.autoHidePanel) await closeToolPanel();
    else await poll();
  } catch (error) {
    showError(`Không thể chạy: ${error.message}`);
  }
}

async function poll() {
  const statuses = await chrome.runtime.sendMessage({ type: 'MAC_GET_STATUSES' }) || {};
  const relevant = SESSION_IDS.map((id) => ({ id, status: statuses[id] })).filter((item) => item.status?.state && item.status.state !== 'idle');
  if (!relevant.length) return;
  $('status').classList.remove('hidden');
  let running = false;
  let stopping = false;
  let hasResult = false;
  let hasError = false;
  const cleaning = relevant.some(({ status }) => status.cleanupPending === true);
  for (const id of SESSION_IDS) {
    const status = statuses[id];
    const card = document.querySelector(`[data-status-session="${id}"]`);
    if (!status?.state || status.state === 'idle') { card.classList.add('inactive'); continue; }
    card.classList.remove('inactive');
    card.querySelector('.session-status-text').textContent = status.message || `${captureSessions[id]?.label || id}: đang xử lý…`;
    card.querySelector('.session-percent').textContent = `${status.progress || 0}%`;
    card.querySelector('progress').value = status.progress || 0;
    const stopButton = card.querySelector('.session-stop');
    stopButton.disabled = status.state !== 'running';
    stopButton.textContent = status.state === 'stopping' ? 'Đang dừng…' : `Dừng ${captureSessions[id]?.label || id}`;
    running ||= status.state === 'running';
    stopping ||= status.state === 'stopping';
    hasError ||= status.state === 'error';
    if (status.result) {
      hasResult = true;
      const resultCard = document.querySelector(`[data-result-session="${id}"]`);
      resultCard.classList.remove('inactive');
      resultCard._copyPayload = status.result;
      renderResultCard(resultCard, status.result);
      const previewCount = (status.result.mappings || []).filter((item) => item.previewLink).length;
      resultCard.querySelector('.session-result-summary').textContent = `${status.result.screenshots.length} ảnh · ${previewCount} preview · sẵn sàng Copy`;
    }
  }
  $('capture').disabled = running || stopping || cleaning;
  $('resume').classList.toggle('hidden', running || stopping || !relevant.some(({ status }) => status.resumeAvailable));
  $('resume').disabled = running || stopping || cleaning;
  $('stop').classList.toggle('hidden', !running && !stopping);
  $('stop').disabled = stopping && !running;
  $('stop').textContent = stopping && !running ? 'Đang dừng…' : 'Dừng tool';
  $('resultPanel').classList.toggle('hidden', !hasResult);
  $('badge').textContent = running ? 'Đang chạy' : stopping ? 'Đang dừng' : hasError ? 'Có lỗi' : 'Hoàn tất';
  if ((running || stopping || cleaning) && !timer) timer = setInterval(() => poll().catch((error) => showError(error.message)), 900);
  if (!running && !stopping && !cleaning) { clearInterval(timer); timer = null; }
}

for (const radio of document.querySelectorAll('input[name="destination"]')) {
  radio.addEventListener('change', renderDestination);
}
$('connect').addEventListener('click', () => testWebhook());
$('platform').addEventListener('change', renderPlatform);
$('captureMode').addEventListener('change', renderPlatform);
$('capture').addEventListener('click', () => capture());
$('resume').addEventListener('click', () => capture(true));
$('stop').addEventListener('click', async () => {
  $('stop').disabled = true;
  $('stop').textContent = 'Đang dừng…';
  const response = await chrome.runtime.sendMessage({ type: 'MAC_STOP_SESSION', sessionId: 'session1' });
  if (!response?.ok) showError(response?.error || 'Không thể gửi lệnh dừng.');
  else await poll();
});
for (const id of ['includeCampaign', 'includeAdset']) {
  $(id).addEventListener('change', () => {
    const map = { includeCampaign: 'targetCampaigns', includeAdset: 'targetAdsets' };
    $(map[id]).disabled = !$(id).checked;
    syncFormToSession();
  });
}
$('captureAdImage').addEventListener('change', () => {
  $('targetAds').disabled = !$('captureAdImage').checked && !$('captureAdPreview').checked;
  syncFormToSession();
});
$('captureAdPreview').addEventListener('change', () => {
  $('targetAds').disabled = !$('captureAdImage').checked && !$('captureAdPreview').checked;
  syncFormToSession();
});
document.querySelectorAll('[data-stop-session]').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true;
  button.textContent = 'Đang dừng…';
  const response = await chrome.runtime.sendMessage({ type: 'MAC_STOP_SESSION', sessionId: button.dataset.stopSession });
  if (!response?.ok) showError(response?.error || 'Không thể dừng phiên này.');
  else await poll();
}));
document.querySelectorAll('[data-copy-session]').forEach((button) => button.addEventListener('click', async () => {
  const card = button.closest('.session-result');
  const result = card._copyPayload;
  try {
    if (!($('compactLinks').checked && result?.copyHtml && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write)) throw new Error('plain-copy');
    const item = new ClipboardItem({
      'text/plain': new Blob([result.report || ''], { type: 'text/plain' }),
      'text/html': new Blob([result.copyHtml], { type: 'text/html' })
    });
    await navigator.clipboard.write([item]);
  } catch {
    await navigator.clipboard.writeText(result?.report || card.querySelector('.session-result-text').value);
  }
  button.textContent = 'Đã copy ✓';
  setTimeout(() => button.textContent = 'Copy', 1600);
}));
$('compactLinks').addEventListener('change', async () => {
  refreshResultDisplays();
  const stored = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...(stored.settings || {}), compactLinks: $('compactLinks').checked } });
});
$('clearTree').addEventListener('click', async () => {
  captureTree = [];
  renderCaptureTree();
  await saveCaptureTree();
  $('importStatus').textContent = 'Đã xóa cây. Tool sẽ dùng ba ô tên nhập thủ công.';
});
$('resetTree').addEventListener('click', async () => {
  captureTree = structuredClone(importedTree);
  updateManualListsFromTree();
  renderCaptureTree();
  await saveCaptureTree();
  $('importStatus').textContent = 'Đã khôi phục thứ tự và quan hệ theo file import.';
});
$('importFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    $('importStatus').textContent = `Đang đọc ${file.name}…`;
    const rows = await rowsFromFile(file);
    captureTree = buildCaptureTree(rows);
    importedTree = structuredClone(captureTree);
    if (!captureTree.length) throw new Error('File không có Campaign / Ad set / Ad để chụp.');
    updateManualListsFromTree();
    renderCaptureTree();
    await saveCaptureTree();
    const counts = treeCounts(captureTree);
    $('importStatus').textContent = `Đã dựng cây: ${counts.campaign} Campaign, ${counts.adset} Ad Set, ${counts.ad} Ad.`;
  } catch (error) {
    $('importStatus').textContent = `Không đọc được file: ${error.message}`;
    showError(`Import thất bại: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

load().catch((error) => showError(error.message));
