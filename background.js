const DEFAULTS = {
  outputFormat: 'post',
  uploadDrive: false,
  makePublic: false,
  folderId: '',
  webhookUrl: '',
  webhookToken: '',
  filenamePrefix: 'MetaAds',
  settleMs: 1800,
  capturePace: 'fast',
  highResolution: true,
  maxLoadWaitMs: 30000,
  overlapRatio: 0.25,
  maxShots: 100,
  captureAdImage: true,
  captureAdPreview: true,
  compactLinks: false,
  highlightAdvantage: false,
  highlightTA: false,
  highlightBudget: false,
  exportJson: false,
  backgroundMode: true,
  autoHidePanel: true,
  captureMode: 'auto',
  platform: 'meta',
  googleLevel: 'campaign',
  googlePages: '',
  hideChrome: false,
  rowSelector: '',
  nameSelector: '',
  scrollSelector: ''
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (value) => String(value || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 100);
const isMetaAdsUrl = (value) => /^https:\/\/(business|adsmanager|www)\.facebook\.com\//.test(value || '') && (/adsmanager|ads\/manager/i.test(value || '') || /^https:\/\/adsmanager\.facebook\.com\//i.test(value || ''));
const isGoogleAdsUrl = (value) => /^https:\/\/ads\.google\.com\//i.test(value || '');
const isAdsUrl = (value) => isMetaAdsUrl(value) || isGoogleAdsUrl(value);
const isCaptureUrl = (value, settings) => settings?.captureMode === 'regular' ? /^https?:\/\//i.test(value || '') : isAdsUrl(value);
const activeCaptureTabs = new Set();
const regularCaptureTabs = new Set();
const stopRequestedTabs = new Set();
const SESSION_IDS_FOR_BACKGROUND = ['session1'];
const activeSessions = new Map();
const statusCache = new Map();
let statusWriteQueue = Promise.resolve();
let offscreenReady = null;
let uploadQueue = Promise.resolve();
const lastKeepAlive = new Map();
const notificationTargets = new Map();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}));

async function openProgressWindow() {
  const url = chrome.runtime.getURL('progress.html');
  // Query only our extension contexts; no broad permission to read other tabs.
  const [existing] = await chrome.runtime.getContexts({ documentUrls: [url] });
  if (Number.isInteger(existing?.windowId) && existing.windowId >= 0) {
    // Preserve the user's position and size, and never steal the Ads tab's focus.
    try {
      await chrome.windows.update(existing.windowId, { state: 'normal', focused: false });
      return;
    } catch { /* The user may close the old window between lookup and update. */ }
  }
  await chrome.windows.create({ url, type: 'popup', width: 360, height: 330, focused: false });
}

async function notifyCaptureComplete(tab, capturedCount, screenshotCount) {
  const notificationId = `meta-ads-capture-${Date.now()}`;
  const target = { tabId: tab.id, windowId: tab.windowId };
  notificationTargets.set(notificationId, target);
  await chrome.storage.local.set({ lastCaptureNotificationTarget: target });
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
    title: 'Meta Ads Capture đã hoàn tất',
    message: `Đã xử lý ${capturedCount} mục và tạo ${screenshotCount} ảnh.`,
    contextMessage: 'Bấm vào đây để mở kết quả và Copy.',
    priority: 1
  });
}

chrome.notifications.onClicked.addListener((notificationId) => {
  (async () => {
    const stored = await chrome.storage.local.get('lastCaptureNotificationTarget');
    const target = notificationTargets.get(notificationId) || stored.lastCaptureNotificationTarget;
    if (target?.windowId) await chrome.windows.update(target.windowId, { focused: true }).catch(() => {});
    if (target?.tabId) await chrome.tabs.update(target.tabId, { active: true }).catch(() => {});
    if (target?.windowId) await chrome.sidePanel.open({ windowId: target.windowId }).catch(() => {});
    notificationTargets.delete(notificationId);
    await chrome.notifications.clear(notificationId).catch(() => {});
  })();
});

chrome.notifications.onClosed.addListener((notificationId) => notificationTargets.delete(notificationId));

async function setStatus(patch, sessionId = 'session1') {
  const current = statusCache.get(sessionId) || {};
  const next = { ...current, ...patch, sessionId, updatedAt: Date.now() };
  if (['done', 'error', 'stopped', 'stopping'].includes(next.state)) next.retrying = false;
  statusCache.set(sessionId, next);
  const snapshot = Object.fromEntries(statusCache);
  statusWriteQueue = statusWriteQueue.then(() => chrome.storage.local.set({
    captureStatuses: snapshot,
    ...(sessionId === 'session1' ? { captureStatus: next } : {})
  }));
  await statusWriteQueue;
}

async function shouldStop(tabId, sessionId = 'session1') {
  if (stopRequestedTabs.has(tabId)) return true;
  const stored = (await chrome.storage.local.get('captureStatuses')).captureStatuses || {};
  const status = statusCache.get(sessionId) || stored[sessionId] || {};
  return status.stopRequested === true && status.targetTabId === tabId;
}

async function send(tabId, message) {
  const regular = regularCaptureTabs.has(tabId);
  const request = regular ? { ...message, type: message.type.replace(/^MAC_/, 'MAC_PAGE_') } : message;
  try {
    const response = await chrome.tabs.sendMessage(tabId, request);
    if (response != null) return response;
  } catch {}
  // An installed listener for the other mode may simply decline the message.
  // Chrome can return undefined in that case instead of rejecting the call.
  const tab = await chrome.tabs.get(tabId);
  await chrome.scripting.executeScript({ target: { tabId }, files: ['capture-scroll.js', regular ? 'page-content.js' : isGoogleAdsUrl(tab.url) ? 'google-content.js' : 'content.js'] });
  await wait(150);
  return chrome.tabs.sendMessage(tabId, request);
}

async function keepBackgroundTabActive(tabId, force = false) {
  if (!activeCaptureTabs.has(tabId)) return;
  const now = Date.now();
  if (!force && now - (lastKeepAlive.get(tabId) || 0) < 1500) return;
  lastKeepAlive.set(tabId, now);
  await Promise.allSettled([
    chrome.debugger.sendCommand({ tabId }, 'Page.setWebLifecycleState', { state: 'active' }),
    chrome.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', { enabled: true }),
    chrome.debugger.sendCommand({ tabId }, 'Emulation.setIdleOverride', { isUserActive: true, isScreenUnlocked: true })
  ]);
}

async function installBackgroundRenderShim(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      if (window.__macBackgroundRenderShim) return;
      window.__macBackgroundRenderShim = true;
      try { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); } catch {}
      try { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); } catch {}
      try { Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true }); } catch {}
      try { document.dispatchEvent(new Event('visibilitychange')); } catch {}
      try { window.dispatchEvent(new Event('focus')); } catch {}
      try { window.dispatchEvent(new Event('resize')); } catch {}
    }
  });
}

async function removeBackgroundRenderShim(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      if (!window.__macBackgroundRenderShim) return;
      try { delete document.hidden; } catch {}
      try { delete document.visibilityState; } catch {}
      try { delete document.hasFocus; } catch {}
      delete window.__macBackgroundRenderShim;
      try { document.dispatchEvent(new Event('visibilitychange')); } catch {}
    }
  });
}

async function installClipboardTap(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      document.documentElement.removeAttribute('data-mac-preview-link');
      const clipboard = navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function' || window.__macClipboardOriginal) return;
      const original = clipboard.writeText.bind(clipboard);
      const wrapper = (value) => {
        document.documentElement.setAttribute('data-mac-preview-link', String(value || ''));
        try { return Promise.resolve(original(value)).catch(() => undefined); }
        catch { return Promise.resolve(); }
      };
      window.__macClipboardOriginal = original;
      try {
        Object.defineProperty(clipboard, 'writeText', { configurable: true, writable: true, value: wrapper });
        window.__macClipboardPatched = true;
      } catch {
        try { clipboard.writeText = wrapper; window.__macClipboardPatched = true; } catch {}
      }
    }
  });
}

async function removeClipboardTap(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const clipboard = navigator.clipboard;
      if (clipboard && window.__macClipboardOriginal && window.__macClipboardPatched) {
        try { Object.defineProperty(clipboard, 'writeText', { configurable: true, writable: true, value: window.__macClipboardOriginal }); }
        catch { try { clipboard.writeText = window.__macClipboardOriginal; } catch {} }
      }
      delete window.__macClipboardOriginal;
      delete window.__macClipboardPatched;
      document.documentElement.removeAttribute('data-mac-preview-link');
    }
  });
}

async function getAdPreviewLink(tab, settings, level = 'ad') {
  await keepBackgroundTabActive(tab.id, true);
  try { await installClipboardTap(tab.id); } catch {}
  try {
    const result = await send(tab.id, { type: 'MAC_GET_PREVIEW_LINK', level, maxWaitMs: settings.maxLoadWaitMs });
    if (!result?.ok || !result.link) throw new Error(result?.error || 'Không đọc được link preview.');
    return result.link;
  } finally {
    try { await removeClipboardTap(tab.id); } catch {}
  }
}

function normalizedWebhookUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com') return '';
    const deployment = url.pathname.match(/\/macros\/s\/([^/]+)\/exec\/?$/)
      || url.pathname.match(/\/a\/macros\/[^/]+\/s\/([^/]+)\/exec\/?$/);
    return deployment ? `https://script.google.com/macros/s/${deployment[1]}/exec` : '';
  } catch {
    return '';
  }
}

function appsScriptNonJsonMessage(response, text) {
  const source = String(text || '');
  const finalUrl = String(response?.url || '');
  if (response?.status === 404 || /page not found|requested url was not found/i.test(source)) {
    return 'Không tìm thấy deployment Apps Script. Dùng URL /exec; không dùng phần /a/tên-miền trong link.';
  }
  if (/accounts\.google\.com|servicelogin|sign in with google|đăng nhập/i.test(`${finalUrl}\n${source}`)) {
    return 'Apps Script đang yêu cầu đăng nhập. Deploy Web app với Execute as: Me và Who has access: Anyone.';
  }
  if (response?.status === 413 || /request entity too large|payload too large/i.test(source)) {
    return 'Ảnh quá lớn nên Apps Script từ chối upload. Hãy giảm số phần ảnh tối đa hoặc chụp lại mục này.';
  }
  const status = response?.status ? ` (HTTP ${response.status})` : '';
  return `Apps Script trả trang web thay vì JSON${status}. Hãy tạo New version trong Manage deployments và đặt quyền truy cập là Anyone.`;
}

async function uploadThroughWebhook(dataUrl, filename, settings) {
  const task = async () => {
    const webhookUrl = normalizedWebhookUrl(settings.webhookUrl);
    if (!webhookUrl || !settings.webhookToken) throw new Error('Thiếu URL /exec hợp lệ hoặc mã bảo vệ Apps Script webhook.');
    const body = new URLSearchParams({
      action: 'upload', token: settings.webhookToken, folderId: settings.folderId || '', filename, dataUrl,
      makePublic: settings.makePublic ? '1' : '0'
    });
    const response = await fetch(webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body, redirect: 'follow', cache: 'no-store'
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error(appsScriptNonJsonMessage(response, text)); }
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Apps Script HTTP ${response.status}`);
    const isImage = /\.(?:png|jpe?g|webp)$/i.test(filename || '');
    if (isImage && payload.id) {
      if (/[?&]view=/.test(payload.viewerLink || '') && /[?&]sig=/.test(payload.viewerLink || '')) return payload.viewerLink;
      throw new Error('Apps Script chưa trả link ảnh có chữ ký. Hãy cập nhật và Deploy Code.gs bản 5.4.0.');
    }
    return payload.link || payload.driveLink || `https://drive.google.com/file/d/${payload.id}/view`;
  };
  const result = uploadQueue.then(task, task);
  uploadQueue = result.catch(() => undefined);
  return result;
}

function formatLine(name, link, format) {
  if (format === 'plain') return `${name}\n${link}`;
  if (format === 'report') return `Ad: ${name}\nScreenshot: ${link}`;
  return `${name}: ${link}`;
}

function uniqueAds(ads) {
  const seen = new Set();
  return ads.filter((ad) => {
    const key = ad.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function flattenCaptureTree(nodes, depth = 0, parentUid = '', parentNames = {}, parentIds = {}) {
  const jobs = [];
  const labels = { campaign: 'Campaign', adset: 'Ad set', ad: 'Ad' };
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node?.level || !node?.name) continue;
    const uid = node.uid || `${parentUid}/${node.level}:${node.id || node.name}`;
    jobs.push({ id: node.id || '', level: node.level, label: labels[node.level] || node.level, name: node.name, uid, parentUid, parentNames: { ...parentNames }, parentIds: { ...parentIds }, depth, captureEnabled: node.captureEnabled !== false });
    jobs.push(...flattenCaptureTree(node.children || [], depth + 1, uid, { ...parentNames, [node.level]: node.name }, { ...parentIds, [node.level]: node.id || '' }));
  }
  return jobs;
}

function hierarchicalReport(tree, mappings) {
  const byUid = new Map(mappings.map((item) => [item.uid, item]));
  const labels = { campaign: 'Campaign', adset: 'Ad set', ad: 'Ad' };
  const blocks = [];
  const nodeUid = (node, parentUid) => node.uid || `${parentUid}/${node.level}:${node.id || node.name}`;
  const hasMappedDescendant = (node, uid) => (node.children || []).some((child) => {
    const childUid = nodeUid(child, uid);
    return byUid.has(childUid) || hasMappedDescendant(child, childUid);
  });
  const visit = (nodes, depth = 0, parentUid = '') => {
    for (const node of nodes || []) {
      const uid = nodeUid(node, parentUid);
      const mapped = byUid.get(uid);
      if (mapped) {
        const lines = [];
        if (mapped.previewOnly) {
          const value = mapped.previewLink || `Không lấy được link preview (${mapped.previewError || 'không rõ lỗi'})`;
          lines.push(`${labels[node.level] || node.level} ${node.name}:`);
          lines.push(`Preview: ${value}`);
        } else {
          lines.push(`${labels[node.level] || node.level} ${node.name}: ${mapped.screenshot}`);
          if (mapped.previewLink) lines.push(`Preview: ${mapped.previewLink}`);
          else if (mapped.previewRequested) lines.push(`Preview: Không lấy được tự động (${mapped.previewError || 'không rõ lỗi'})`);
        }
        blocks.push(lines.join('\n'));
      } else if (hasMappedDescendant(node, uid)) {
        blocks.push(`${labels[node.level] || node.level} ${node.name}:`);
      }
      visit(node.children || [], depth + 1, uid);
    }
  };
  visit(tree);
  return blocks.join('\n\n');
}

function flatReport(mappings) {
  const blocks = [];
  for (const mapped of mappings) {
    const lines = [];
    if (mapped.previewOnly) {
      const value = mapped.previewLink || `Không lấy được link preview (${mapped.previewError || 'không rõ lỗi'})`;
      lines.push(`${mapped.label} ${mapped.name}:`);
      lines.push(`Preview: ${value}`);
    } else {
      lines.push(`${mapped.label} ${mapped.name}: ${mapped.screenshot}`);
      if (mapped.previewLink) lines.push(`Preview: ${mapped.previewLink}`);
      else if (mapped.previewRequested) lines.push(`Preview: Không lấy được tự động (${mapped.previewError || 'không rõ lỗi'})`);
    }
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

function compactReportLinks(report) {
  return String(report || '').split('\n').map((line) =>
    /^\s*Preview\s*:/i.test(line) ? line : line.replace(/https?:\/\/[^\s]+/g, 'Link')
  ).join('\n');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function richReportHtml(report) {
  const linkify = (line) => {
    const matches = [...String(line || '').matchAll(/https?:\/\/[^\s]+/g)];
    if (!matches.length) return escapeHtml(line);
    const keepFullUrl = /^\s*Preview\s*:/i.test(line);
    let html = '';
    let cursor = 0;
    for (const match of matches) {
      html += escapeHtml(line.slice(cursor, match.index));
      html += `<a href="${escapeHtml(match[0])}" target="_blank" rel="noopener noreferrer">${keepFullUrl ? escapeHtml(match[0]) : 'Link'}</a>`;
      cursor = match.index + match[0].length;
    }
    return html + escapeHtml(line.slice(cursor));
  };
  const paragraphs = String(report || '').split(/\n\n+/).filter(Boolean).map((block) =>
    `<p style="margin:0 0 12px 0;white-space:pre-wrap">${block.split('\n').map(linkify).join('<br>')}</p>`
  );
  return `<div>${paragraphs.join('')}</div>`;
}

async function downloadData(dataUrl, filename) {
  return chrome.downloads.download({ url: dataUrl, filename: `MetaAdsCapture/${filename}`, saveAs: false });
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Crop and stitch the Ad preview screenshots into one long image.' })
      .catch(async (error) => { if (!(await chrome.offscreen.hasDocument())) throw error; })
      .finally(() => { offscreenReady = null; });
  }
  await offscreenReady;
}

async function captureViewport(tab, settings) {
  if (settings.backgroundMode) {
    await keepBackgroundTabActive(tab.id, true);
    const result = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    return `data:image/png;base64,${result.data}`;
  }
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== tab.id) throw new Error('Chạy nền đang tắt. Hãy giữ tab cần chụp ở phía trước.');
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}

async function captureOneAd(tab, settings, ordinal, initialSnapshot, itemLabel = 'Mục', sessionId = 'session1') {
  const frames = [];
  let snap = initialSnapshot;
  let advantageHighlight = initialSnapshot.advantageHighlight || null;
  const regionHighlights = new Map();
  const collectHighlights = (snapshot) => {
    const marks = snapshot.regionHighlights || (snapshot.advantageHighlight ? [{ ...snapshot.advantageHighlight, kind: 'advantage' }] : []);
    for (const mark of marks) {
      const first = regionHighlights.get(mark.kind);
      if (!first || mark.y < first.y) regionHighlights.set(mark.kind, mark);
    }
  };
  collectHighlights(initialSnapshot);
  let reachedBottom = false;
  for (let part = 0; part < settings.maxShots; part++) {
    if (await shouldStop(tab.id, sessionId)) throw new Error('__MAC_STOPPED__');
    await setStatus({ message: `${itemLabel} ${ordinal}: đang chụp đoạn ${part + 1}…` }, sessionId);
    const before = await send(tab.id, { type: 'MAC_PREVIEW_SNAPSHOT' });
    if (!before?.ok) throw new Error(before?.error || 'Không đọc được vị trí trước khi chụp.');
    const changedPosition = (fresh) => Math.abs(fresh.scrollTop - snap.scrollTop) > 2
      || fresh.viewportWidth !== initialSnapshot.viewportWidth || fresh.viewportHeight !== initialSnapshot.viewportHeight
      || Math.abs(fresh.rect.left - initialSnapshot.rect.left) > 2
      || Math.abs(fresh.rect.top - initialSnapshot.rect.top) > 2
      || Math.abs(fresh.rect.width - initialSnapshot.rect.width) > 2
      || Math.abs(fresh.rect.height - initialSnapshot.rect.height) > 2
      || fresh.clientHeight !== snap.clientHeight
      || fresh.scrollHeight !== snap.scrollHeight;
    if (changedPosition(before.snapshot)) throw new Error('Vị trí cuộn hoặc kích thước tab đã thay đổi.');
    const dataUrl = await captureViewport(tab, settings);
    const after = await send(tab.id, { type: 'MAC_PREVIEW_SNAPSHOT' });
    if (!after?.ok || changedPosition(after.snapshot)) throw new Error('Trang đã bị cuộn trong lúc chụp.');
    frames.push({ scrollTop: snap.scrollTop, stickyCutoffX: snap.stickyCutoffX, dataUrl });
    if (!advantageHighlight && snap.advantageHighlight) advantageHighlight = snap.advantageHighlight;
    collectHighlights(snap);
    // The last viewport has already passed the adapter's readiness checks.
    // Don't scroll/wait again when its height stayed unchanged during capture.
    // Adapters allow 5 px when detecting the bottom. Stitching needs the
    // actual last pixels, so don't stop while that tolerance hides a gap.
    const remainingPixels = snap.scrollHeight - snap.scrollTop - snap.rect.height;
    if (after.snapshot.atBottom && remainingPixels <= 2) {
      reachedBottom = true;
      break;
    }
    const moved = await send(tab.id, {
      type: 'MAC_PREVIEW_SCROLL',
      settleMs: settings.settleMs,
      maxLoadWaitMs: settings.maxLoadWaitMs,
      overlapRatio: settings.overlapRatio,
      toBottom: after.snapshot.atBottom === true
    });
    if (!moved?.ok) throw new Error(moved?.error || 'Meta không tải xong đoạn tiếp theo.');
    if (moved.snapshot?.scrollHeight < snap.scrollHeight) {
      throw new Error('Chiều cao nội dung giảm giữa các đoạn. Tool sẽ bỏ ảnh tạm và chụp lại mục này từ đầu.');
    }
    if (!moved.snapshot || Math.abs(moved.snapshot.scrollTop - snap.scrollTop) < .5) {
      // A response saying "atBottom" is not a screenshot of that bottom.
      // Never mark an uncaptured final viewport as successfully completed.
      throw new Error(`Scrollbar chưa tới cuối vùng chụp hoặc bị che. Còn thiếu ${Math.max(0, Math.ceil(remainingPixels))} px (nội dung ${snap.scrollHeight} px; khung cuộn ${snap.clientHeight} px; vùng chụp ${snap.rect.height} px). Tool sẽ chụp lại từ đầu.`);
    }
    snap = moved.snapshot;
  }
  if (!frames.length) throw new Error('Không chụp được khung Ad preview.');
  if (!reachedBottom) throw new Error('Chưa chụp hết nội dung; hãy tăng số đoạn tối đa.');
  await ensureOffscreen();
  const stitched = await chrome.runtime.sendMessage({
    type: 'MAC_STITCH', frames,
    geometry: { rect: initialSnapshot.rect, scrollHeight: snap.scrollHeight, clientHeight: snap.clientHeight, viewportWidth: initialSnapshot.viewportWidth, viewportHeight: initialSnapshot.viewportHeight, wholePage: initialSnapshot.wholePage === true, stickyCutoffX: initialSnapshot.stickyCutoffX, backgroundColor: initialSnapshot.backgroundColor, advantageHighlight, regionHighlights: [...regionHighlights.values()] }
  });
  if (!stitched?.ok) throw new Error(stitched?.error || 'Không thể ghép ảnh dài.');
  if (stitched.truncated) throw new Error('Ảnh dài vượt giới hạn ghép. Hãy chia màn thiết lập thành nhiều phần.');
  if (await shouldStop(tab.id, sessionId)) throw new Error('__MAC_STOPPED__');
  return { name: initialSnapshot.name, dataUrl: stitched.dataUrl, parts: frames.length, width: stitched.width, height: stitched.height, truncated: stitched.truncated };
}

async function captureEntityWithRetry(tab, settings, ordinal, initialSnapshot, job, sessionId = 'session1') {
  const maxAttempts = 3;
  let snapshot = initialSnapshot;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        await setStatus({ retrying: true, message: `${job.label} ${ordinal}: cuộn lỗi, đang bỏ ảnh tạm và chụp lại từ đầu (${attempt}/${maxAttempts})…` }, sessionId);
        const reset = await send(tab.id, { type: 'MAC_ENTITY_PREPARE', level: job.level, name: settings.platform === 'google' ? job.name : '', settings });
        if (!reset?.ok || !reset.snapshot) throw new Error(reset?.error || `Không thể đưa ${job.label} về đầu để chụp lại.`);
        snapshot = reset.snapshot;
        if (snapshot.scrollTop > 2) throw new Error(`Scrollbar của ${job.label} chưa về đầu khi thử chụp lại.`);
      }
      return await captureOneAd(tab, settings, ordinal, snapshot, job.label, sessionId);
    } catch (error) {
      if (error.message === '__MAC_STOPPED__') throw error;
      lastError = error;
      if (attempt === maxAttempts) break;
    }
  }
  throw new Error(`${job.label} ${job.name || ''} vẫn lỗi sau ${maxAttempts} lần chụp lại từ đầu: ${lastError?.message || 'không rõ lỗi'}`);
}

function googleCaptureJobs(value, defaultLevel = 'campaign') {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const parts = line.split('|');
    const url = parts.pop().trim();
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'ads.google.com') throw new Error(`Dòng ${index + 1}: hãy dùng link trực tiếp https://ads.google.com/...`);
    const title = parts.join('|').trim();
    const level = /^ad\s*group\b/i.test(title) ? 'adset' : /^ad\b/i.test(title) ? 'ad' : /^campaign\b/i.test(title) ? 'campaign' : defaultLevel;
    const label = { campaign: 'Campaign', adset: 'Ad group', ad: 'Ad' }[level];
    const name = title.replace(/^(?:campaign|ad\s*group|ad)\s*:?\s*/i, '').trim() || `${label} ${index + 1}`;
    return { level, label, name, url: parsed.toString(), depth: 0 };
  });
}

async function openGoogleCapturePage(tabId, url, settings, sessionId) {
  await chrome.tabs.update(tabId, { url });
  const deadline = Date.now() + Math.max(30000, Number(settings.maxLoadWaitMs) || 30000);
  while (Date.now() < deadline) {
    if (await shouldStop(tabId, sessionId)) throw new Error('__MAC_STOPPED__');
    const tab = await chrome.tabs.get(tabId);
    if (!isGoogleAdsUrl(tab.url)) throw new Error('Google chuyển sang trang đăng nhập. Hãy đăng nhập Google Ads rồi chạy lại.');
    if (tab.status === 'complete') {
      await send(tabId, { type: 'MAC_CAPTURE_INIT', settings });
      return;
    }
    await wait(500);
  }
  throw new Error('Google Ads chưa mở xong màn cần chụp.');
}

async function captureFingerprint(settings, page) {
  const url = new URL(page);
  const named = settings.captureTree?.length || settings.targetCampaigns?.length || settings.targetAdsets?.length || settings.targetAds?.length;
  const scope = settings.captureMode !== 'regular' && settings.platform === 'meta' && named
    ? [url.origin, url.searchParams.get('act') || '', url.searchParams.get('business_id') || ''] : [url.href];
  // Transient tab IDs and timing do not invalidate resume. Secrets only enter
  // the SHA-256 input, never the stored checkpoint or a diagnostic message.
  const keys = ['captureMode', 'platform', 'captureTree', 'targetCampaigns', 'targetAdsets', 'targetAds', 'captureLevels', 'captureAdImage', 'captureAdPreview', 'uploadDrive', 'folderId', 'webhookUrl', 'webhookToken', 'makePublic', 'filenamePrefix', 'highlightAdvantage', 'highlightTA', 'highlightBudget', 'googlePages', 'googleLevel'];
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const input = JSON.stringify(stable({ scope, settings: Object.fromEntries(keys.map((key) => [key, settings[key] ?? null])) }));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function capturePayload(tab, settings, captured) {
  const mappings = captured.map((shot) => ({ uid: shot.uid, parentUid: shot.parentUid, depth: shot.depth, level: shot.level, label: shot.label, name: shot.name, screenshot: shot.link, filename: shot.filename, parts: shot.parts, previewOnly: shot.previewOnly, previewRequested: shot.previewRequested, previewLink: shot.previewLink, previewError: shot.previewError }));
  const report = settings.captureMode === 'regular' ? captured[0]?.link || ''
    : settings.captureTree?.length ? hierarchicalReport(settings.captureTree, mappings) : flatReport(mappings);
  return { capturedAt: new Date().toISOString(), page: tab.url, screenshots: captured.filter((item) => item.screenshotCaptured), processed: captured, mappings, report, compactReport: compactReportLinks(report), copyHtml: richReportHtml(report), copyText: report };
}

async function prepareCaptureJob(tab, settings, job, sessionId) {
  let prep;
  if (settings.captureMode === 'regular') {
    prep = await send(tab.id, { type: 'MAC_ENTITY_PREPARE', settings });
  } else if (settings.platform === 'google') {
    if (job.url) {
      await openGoogleCapturePage(tab.id, job.url, settings, sessionId);
      if (settings.backgroundMode) await installBackgroundRenderShim(tab.id);
    }
    prep = await send(tab.id, { type: 'MAC_ENTITY_PREPARE', level: job.level, name: job.name || '', settings });
  } else if (job.name) {
    prep = await send(tab.id, { type: 'MAC_SELECT_TARGET_ENTITY', level: job.level, name: job.name, id: job.id || '', parentNames: job.parentNames || {} });
  } else {
    prep = await send(tab.id, { type: 'MAC_ENTITY_PREPARE', level: job.level, settings });
  }
  if (!prep?.ok || prep.done || !prep.snapshot) throw new Error(prep?.error || `Không thể chuẩn bị ${job.label}.`);
  if (prep.snapshot.scrollTop > 2) throw new Error(`${job.label} chưa về đầu. Tool sẽ bỏ ảnh tạm và thử lại từ đầu.`);
  return prep;
}

async function runCapture(tab, suppliedSettings, sessionId = suppliedSettings?.sessionId || 'session1') {
  // A monitor failure must never turn a capture into an error or change its tab.
  await openProgressWindow().catch(() => {});
  const settings = { ...DEFAULTS, ...suppliedSettings };
  const regular = settings.captureMode === 'regular';
  const google = isGoogleAdsUrl(tab.url);
  settings.platform = google ? 'google' : 'meta';
  if (google || regular) {
    settings.captureTree = [];
    settings.targetCampaigns = []; settings.targetAdsets = []; settings.targetAds = [];
    settings.captureAdImage = true; settings.captureAdPreview = false;
    settings.captureLevels = { campaign: true, adset: true, ad: true };
  }
  if (!google && !regular && !Object.prototype.hasOwnProperty.call(suppliedSettings || {}, 'captureAdImage')) {
    settings.captureAdImage = suppliedSettings?.adPreviewOnly !== true;
  }
  if (!google && !regular && !Object.prototype.hasOwnProperty.call(suppliedSettings || {}, 'captureAdPreview')) {
    settings.captureAdPreview = suppliedSettings?.adPreviewOnly === true || suppliedSettings?.capturePreviewLinks !== false;
  }
  let captured = [];
  let checkpoint = null;
  let retainedResult = null;
  let resumeCandidate = null;
  let nextIndex = 0;
  const list = (value) => Array.isArray(value) ? value.map((x) => String(x).trim()).filter(Boolean) : [];
  const treeJobs = flattenCaptureTree(settings.captureTree || []);
  let jobs = [];
  let debuggerAttached = false;
  let metricsOverridden = false;
  try {
    jobs = regular ? [{ level: 'page', label: 'Trang', name: null }] : google ? googleCaptureJobs(settings.googlePages, settings.googleLevel) : treeJobs.length ? treeJobs : [
      ...list(settings.targetCampaigns).map((name) => ({ level: 'campaign', label: 'Campaign', name, depth: 0 })),
      ...list(settings.targetAdsets).map((name) => ({ level: 'adset', label: 'Ad set', name, depth: 0 })),
      ...list(settings.targetAds).map((name) => ({ level: 'ad', label: 'Ad', name, depth: 0 }))
    ];
    const fingerprint = await captureFingerprint(settings, tab.url);
    if (suppliedSettings?.resumeCapture === true) {
      const saved = await chrome.storage.local.get(['captureCheckpoint', 'captureStatus']);
      const stored = saved.captureCheckpoint;
      resumeCandidate = stored;
      retainedResult = saved.captureStatus?.result || null;
      if (!stored || stored.version !== '6.4.0' || stored.fingerprint !== fingerprint || !Array.isArray(stored.jobs) || !Array.isArray(stored.captured)) {
        throw new Error('Không thể tiếp tục: tài khoản, danh sách hoặc cài đặt đã thay đổi. Hãy dùng Bắt đầu xử lý cho lượt mới.');
      }
      checkpoint = stored;
      jobs = stored.jobs;
      captured = stored.captured;
      nextIndex = stored.nextIndex;
      if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex > jobs.length) throw new Error('Điểm tiếp tục không hợp lệ. Hãy bắt đầu lượt mới.');
    } else {
      checkpoint = { version: '6.4.0', fingerprint, jobs, captured, nextIndex: 0 };
      await chrome.storage.local.set({ captureCheckpoint: checkpoint });
    }
    if (regular) {
      regularCaptureTabs.add(tab.id);
    } else regularCaptureTabs.delete(tab.id);
    // Initialize the chosen mode explicitly, including bulk capture after a
    // regular capture or extension reload. Installed scripts guard duplicates.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture-scroll.js', regular ? 'page-content.js' : google ? 'google-content.js' : 'content.js'] });
    if (settings.backgroundMode) {
      try { await chrome.debugger.attach({ tabId: tab.id }, '1.3'); }
      catch { throw new Error('Không thể bật chạy nền. Hãy đóng DevTools của tab Ads Manager rồi thử lại.'); }
      debuggerAttached = true;
      await chrome.tabs.update(tab.id, { autoDiscardable: false });
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.enable'); } catch {}
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable'); } catch {}
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.setWebLifecycleState', { state: 'active' }); } catch {}
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.setIdleOverride', { isUserActive: true, isScreenUnlocked: true }); } catch {}
      try { await installBackgroundRenderShim(tab.id); } catch {}
      // Hold the viewport steady when the Side Panel closes or another tab opens.
      const size = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.evaluate', { expression: '({width:innerWidth,height:innerHeight,scale:devicePixelRatio})', returnByValue: true });
      const viewport = size.result?.value;
      if (viewport?.width > 0 && viewport?.height > 0) {
        const imageScale = viewport.scale || 1;
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: imageScale, mobile: false });
        metricsOverridden = true;
      }
    }
    await setStatus({ state: 'running', progress: Math.round(nextIndex / Math.max(1, jobs.length) * 95), message: 'Đang chuẩn bị trang…', result: capturePayload(tab, settings, captured), error: null, targetTabId: tab.id, stopRequested: false, resumeAvailable: false, cleanupPending: true }, sessionId);
    const initialized = await send(tab.id, { type: 'MAC_CAPTURE_INIT', settings });
    if (!initialized?.ok) throw new Error(initialized?.error || 'Tab không phản hồi khi khởi tạo. Hãy F5 tab cần chụp rồi bấm Bắt đầu lại.');
    if (initialized.version !== '6.6.2') throw new Error('Tab còn dùng mã chụp cũ. Hãy F5 tab một lần sau khi tải lại extension.');
    if (!jobs.length) {
      const detected = await send(tab.id, { type: 'MAC_DETECT_LEVEL' });
      if (!detected?.level) throw new Error('Không xác định được cấp Campaign, Ad set hay Ad hiện tại.');
      if (settings.captureLevels && settings.captureLevels[detected.level] === false) throw new Error(`Cấp ${detected.level} hiện tại đang bị bỏ tick trong phiên này.`);
      const labels = { campaign: 'Campaign', adset: google ? 'Ad group' : 'Ad set', ad: 'Ad' };
      jobs.push({ level: detected.level, label: labels[detected.level], name: null });
    }
    checkpoint.jobs = jobs;
    await chrome.storage.local.set({ captureCheckpoint: checkpoint });
    for (let index = nextIndex; index < jobs.length; index++) {
      if (await shouldStop(tab.id, sessionId)) throw new Error('__MAC_STOPPED__');
      await keepBackgroundTabActive(tab.id, true);
      const job = jobs[index];
      const captureEnabled = job.captureEnabled !== false;
      const captureImage = captureEnabled && (job.level !== 'ad' || settings.captureAdImage !== false);
      const previewRequested = captureEnabled && job.level === 'ad' && settings.captureAdPreview === true;
      const previewOnly = job.level === 'ad' && !captureImage && previewRequested;
      let record = captured.find((item) => item.index === index + 1);
      let completed = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (await shouldStop(tab.id, sessionId)) throw new Error('__MAC_STOPPED__');
          await setStatus({ state: 'running', retrying: attempt > 1, message: `${job.label} ${index + 1}/${jobs.length}: ${attempt > 1 ? `thử lại ${attempt}/3…` : 'đang chuẩn bị…'}`, progress: Math.round(index / jobs.length * 95), error: null }, sessionId);
          if (captureEnabled && (captureImage || previewRequested)) {
            const prep = await prepareCaptureJob(tab, settings, job, sessionId);
            if (!record) {
              let image = null, filename = '', link = '';
              if (captureImage) {
                // One outer retry budget covers preparation, capture, upload and preview.
                image = await captureOneAd(tab, settings, captured.length + 1, prep.snapshot, job.label, sessionId);
                filename = `${safe(settings.filenamePrefix)}_${String(index + 1).padStart(3, '0')}_${safe(job.label)}_${safe(image.name)}.png`;
                if (await shouldStop(tab.id, sessionId)) throw new Error('__MAC_STOPPED__');
                if (settings.uploadDrive) link = await uploadThroughWebhook(image.dataUrl, filename, settings);
                else { await downloadData(image.dataUrl, filename); link = `MetaAdsCapture/${filename}`; }
              }
              const detectedName = image?.name || prep.snapshot.name || '';
              record = { index: index + 1, uid: job.uid || '', parentUid: job.parentUid || '', depth: job.depth || 0, level: job.level, label: job.label, filename, link, name: job.name || detectedName, detectedName, parts: image?.parts || 0, width: image?.width || 0, height: image?.height || 0, truncated: false, screenshotCaptured: captureImage, previewOnly, previewRequested, previewLink: '', previewError: '' };
              captured.push(record);
              checkpoint.captured = captured;
              await chrome.storage.local.set({ captureCheckpoint: checkpoint });
              await setStatus({ result: capturePayload(tab, settings, captured) }, sessionId);
            }
            if (previewRequested && !record.previewLink) {
              try {
                record.previewLink = await getAdPreviewLink(tab, settings, job.level);
                record.previewError = '';
              } catch (error) {
                if (error.message !== '__MAC_STOPPED__') record.previewError = error.message;
                throw error;
              }
            }
          }
          if (await shouldStop(tab.id, sessionId)) throw new Error('__MAC_STOPPED__');
          completed = true;
          break;
        } catch (error) {
          checkpoint.captured = captured;
          await chrome.storage.local.set({ captureCheckpoint: checkpoint });
          if (error.message === '__MAC_STOPPED__') throw error;
          await setStatus({ retrying: attempt < 3, result: capturePayload(tab, settings, captured), message: `${job.label}: ${error.message}${attempt < 3 ? ` — đang thử lại (${attempt}/3).` : ''}` }, sessionId);
          if (attempt === 3) throw new Error(`${job.label} ${job.name || ''} vẫn lỗi sau 3 lần thử: ${error.message}`);
        }
      }
      if (completed) {
        checkpoint.nextIndex = index + 1;
        checkpoint.captured = captured;
        await chrome.storage.local.set({ captureCheckpoint: checkpoint });
        await setStatus({ retrying: false, result: capturePayload(tab, settings, captured) }, sessionId);
      }
    }
    const payload = capturePayload(tab, settings, captured);
    const screenshots = payload.screenshots;
    if (settings.exportJson) {
      const jsonUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
      await downloadData(jsonUrl, `${safe(settings.filenamePrefix)}_result.json`);
    }
    await setStatus({ state: 'done', progress: 100, message: `Hoàn tất ${captured.length} mục (${screenshots.length} ảnh). Mở kết quả để Copy.`, result: payload, resumeAvailable: false }, sessionId);
    try { await notifyCaptureComplete(tab, captured.length, screenshots.length); } catch {}
  } catch (error) {
    const result = !checkpoint && retainedResult ? retainedResult : capturePayload(tab, settings, captured);
    const resumePoint = checkpoint || resumeCandidate;
    const resumeAvailable = resumePoint?.version === '6.4.0' && Number.isInteger(resumePoint.nextIndex) && resumePoint.nextIndex < resumePoint.jobs?.length;
    if (error.message === '__MAC_STOPPED__') await setStatus({ state: 'stopped', message: 'Đã dừng. Kết quả hiện có nằm trong Copy.', error: null, result, resumeAvailable }, sessionId);
    else await setStatus({ state: 'error', message: `${error.message} Kết quả hiện có nằm trong Copy.`, error: error.message, result, resumeAvailable }, sessionId);
  } finally {
    try { await send(tab.id, { type: 'MAC_RESTORE' }); } catch {}
    if (debuggerAttached) {
      if (metricsOverridden) try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.clearDeviceMetricsOverride'); } catch {}
      try { await removeBackgroundRenderShim(tab.id); } catch {}
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.setFocusEmulationEnabled', { enabled: false }); } catch {}
      try { await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.clearIdleOverride'); } catch {}
      try { await chrome.debugger.detach({ tabId: tab.id }); } catch {}
    }
    try { await chrome.tabs.update(tab.id, { autoDiscardable: tab.autoDiscardable !== false }); } catch {}
    activeCaptureTabs.delete(tab.id);
    regularCaptureTabs.delete(tab.id);
    stopRequestedTabs.delete(tab.id);
    activeSessions.delete(sessionId);
    lastKeepAlive.delete(tab.id);
    try { await setStatus({ cleanupPending: false }, sessionId); } catch {}
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'MAC_CONTENT_WAIT') {
    const duration = Math.max(0, Math.min(60000, Number(message.ms) || 0));
    (async () => {
      if (sender.tab?.id) await keepBackgroundTabActive(sender.tab.id);
      await wait(duration);
      if (sender.tab?.id) await keepBackgroundTabActive(sender.tab.id);
      respond({ ok: true });
    })();
    return true;
  }
  if (message.type === 'MAC_START_SINGLE') {
    (async () => {
      if (activeSessions.size) throw new Error('Đang có phiên chụp khác chạy. Hãy chờ hoàn tất hoặc dừng trước.');
      const settings = message.settings || {};
      let tab;
      try { tab = await chrome.tabs.get(Number(settings.tabId)); }
      catch { throw new Error('Tab đã chọn đã đóng. Bấm Làm mới và chọn lại tab Ads Manager.'); }
      if (!tab?.id || !isCaptureUrl(tab.url, settings)) throw new Error(settings.captureMode === 'regular' ? 'Chụp thường dùng cho trang web HTTP/HTTPS; Chrome không cho chụp trang nội bộ.' : 'Hãy mở Meta Ads Manager hoặc Google Ads trên tab hiện tại.');
      const previous = settings.resumeCapture === true ? (await chrome.storage.local.get('captureStatus')).captureStatus : null;
      statusCache.clear();
      await chrome.storage.local.set({ captureStatuses: {} });
      activeCaptureTabs.add(tab.id);
      activeSessions.set('session1', tab.id);
      stopRequestedTabs.delete(tab.id);
      await setStatus({ state: 'running', progress: 0, message: 'Đang khởi tạo…', result: previous?.result || null, error: null, targetTabId: tab.id, stopRequested: false, resumeAvailable: false, cleanupPending: true }, 'session1');
      runCapture(tab, { ...settings, sessionId: 'session1' }, 'session1');
      return { ok: true, tabId: tab.id };
    })().then(respond).catch((error) => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'MAC_START') {
    (async () => {
      if (activeSessions.size) throw new Error('Tool chỉ chạy một tab. Hãy dừng phiên hiện tại trước.');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !isCaptureUrl(tab.url, message.settings)) {
        throw new Error('Hãy mở Meta Ads Manager hoặc Google Ads trong tab hiện tại.');
      }
      if (activeCaptureTabs.has(tab.id)) throw new Error('Một phiên capture đang chạy trên tab này.');
      activeCaptureTabs.add(tab.id);
      activeSessions.set('session1', tab.id);
      stopRequestedTabs.delete(tab.id);
      runCapture(tab, message.settings, 'session1');
      return { ok: true };
    })().then(respond).catch((error) => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'MAC_GET_STATUS') {
    chrome.storage.local.get('captureStatus').then((data) => respond(data.captureStatus || { state: 'idle' }));
    return true;
  }
  if (message.type === 'MAC_GET_STATUSES') {
    (async () => {
      const data = await chrome.storage.local.get(['captureStatuses', 'captureCheckpoint']);
      const statuses = data.captureStatuses || Object.fromEntries(statusCache);
      for (const [id, storedStatus] of Object.entries(statuses)) {
        const status = statusCache.get(id) || storedStatus;
        if (!activeSessions.has(id) && ['running', 'stopping'].includes(status.state)) {
          const saved = data.captureCheckpoint;
          await setStatus({ ...status, state: 'stopped', stopRequested: false, cleanupPending: false, message: 'Phiên chụp bị gián đoạn. Copy kết quả hiện có hoặc tiếp tục từ mục chưa xong.', resumeAvailable: saved?.version === '6.4.0' && saved.nextIndex < saved.jobs?.length }, id);
          statuses[id] = statusCache.get(id);
        } else if (!activeSessions.has(id) && status.cleanupPending) {
          await setStatus({ ...status, cleanupPending: false }, id);
          statuses[id] = statusCache.get(id);
        }
      }
      return statuses;
    })().then(respond).catch((error) => respond({ session1: { state: 'error', message: error.message } }));
    return true;
  }
  if (message.type === 'MAC_STOP_SESSION') {
    (async () => {
      const sessionId = 'session1';
      const stored = (await chrome.storage.local.get('captureStatuses')).captureStatuses || {};
      const status = statusCache.get(sessionId) || stored[sessionId] || {};
      const runningId = activeSessions.get(sessionId) || status.targetTabId;
      if (!runningId || !['running', 'stopping'].includes(status.state)) return { ok: true, alreadyStopped: true };
      const executorAlive = activeSessions.has(sessionId);
      stopRequestedTabs.add(runningId);
      await setStatus({ state: 'stopping', message: 'Đang dừng sau thao tác hiện tại…', stopRequested: true, targetTabId: runningId }, sessionId);
      try { await send(runningId, { type: 'MAC_CONTENT_STOP' }); } catch {}
      if (!executorAlive) {
        await setStatus({ state: 'stopped', message: 'Đã dừng phiên cũ.', stopRequested: true, targetTabId: runningId }, sessionId);
        stopRequestedTabs.delete(runningId);
      }
      return { ok: true };
    })().then(respond).catch((error) => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'MAC_STOP_ALL') {
    (async () => {
      const stored = (await chrome.storage.local.get('captureStatuses')).captureStatuses || {};
      await Promise.all(SESSION_IDS_FOR_BACKGROUND.map(async (sessionId) => {
        const status = statusCache.get(sessionId) || stored[sessionId] || {};
        const tabId = activeSessions.get(sessionId) || status.targetTabId;
        if (!tabId || !['running', 'stopping'].includes(status.state)) return;
        stopRequestedTabs.add(tabId);
        await setStatus({ state: 'stopping', message: 'Đang dừng sau thao tác hiện tại…', stopRequested: true, targetTabId: tabId }, sessionId);
        try { await send(tabId, { type: 'MAC_CONTENT_STOP' }); } catch {}
        if (!activeSessions.has(sessionId)) await setStatus({ state: 'stopped', message: 'Đã dừng phiên cũ.', stopRequested: true, targetTabId: tabId }, sessionId);
      }));
      return { ok: true };
    })().then(respond).catch((error) => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === 'MAC_STOP') {
    (async () => {
      const status = (await chrome.storage.local.get('captureStatus')).captureStatus || {};
      const runningId = [...activeCaptureTabs][0] || (status.state === 'running' || status.state === 'stopping' ? status.targetTabId : null);
      if (!runningId) return { ok: true, alreadyStopped: true };
      const executorAlive = activeCaptureTabs.has(runningId);
      stopRequestedTabs.add(runningId);
      await setStatus({ state: 'stopping', message: 'Đang dừng sau thao tác hiện tại…', stopRequested: true, targetTabId: runningId });
      try { await send(runningId, { type: 'MAC_CONTENT_STOP' }); } catch {}
      if (!executorAlive) {
        await setStatus({ state: 'stopped', message: 'Đã dừng phiên cũ.', stopRequested: true, targetTabId: runningId });
        stopRequestedTabs.delete(runningId);
      }
      return { ok: true };
    })().then(respond).catch((error) => respond({ ok: false, error: error.message }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'quick-capture') return;
  (async () => {
    if (activeSessions.size) throw new Error('Tool đang chạy. Hãy dừng phiên hiện tại trước khi dùng phím tắt.');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Không có tab hiện tại để chụp.');
    const [synced, local] = await Promise.all([
      chrome.storage.sync.get('settings'),
      chrome.storage.local.get(['quickCaptureSettings', 'webhookToken'])
    ]);
    const settings = {
      ...DEFAULTS,
      ...(synced.settings || {}),
      ...(local.quickCaptureSettings || {}),
      webhookToken: local.webhookToken || local.quickCaptureSettings?.webhookToken || '',
      tabId: tab.id,
      resumeCapture: false,
      sessionId: 'session1',
      maxLoadWaitMs: Math.max(30000, Number(local.quickCaptureSettings?.maxLoadWaitMs || synced.settings?.maxLoadWaitMs || 30000))
    };
    if (!isCaptureUrl(tab.url, settings)) throw new Error('Hãy mở trang phù hợp với chế độ chụp đã chọn rồi nhấn Ctrl + Shift + F.');
    if (!settings.captureLevels) settings.captureLevels = { campaign: true, adset: true, ad: true };
    statusCache.clear();
    await chrome.storage.local.set({ captureStatuses: {} });
    activeCaptureTabs.add(tab.id);
    activeSessions.set('session1', tab.id);
    stopRequestedTabs.delete(tab.id);
    await setStatus({ state: 'running', progress: 0, message: 'Đã kích hoạt bằng Ctrl + Shift + F…', result: null, error: null, targetTabId: tab.id, stopRequested: false, resumeAvailable: false, cleanupPending: true }, 'session1');
    runCapture(tab, settings, 'session1');
  })().catch((error) => setStatus({ state: 'error', progress: 0, message: error.message, error: error.message }, 'session1'));
});
