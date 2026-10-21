const $ = (id) => document.getElementById(id);
let currentStatus = {}, compact = false, expandedSize = null, stopPending = false;
const labels = { idle: 'Chưa có phiên chụp', running: 'Đang xử lý', stopping: 'Đang dừng', stopped: 'Đã dừng', done: 'Hoàn tất', error: 'Đã dừng tại mục lỗi' };

function render(status = {}) {
  if (currentStatus.updatedAt && (!status.updatedAt || status.updatedAt < currentStatus.updatedAt)) return;
  currentStatus = status;
  const retrying = status.state === 'running' && status.retrying === true;
  const progress = Math.max(0, Math.min(100, Number(status.progress) || 0));
  document.body.dataset.state = retrying ? 'retry' : status.state || 'idle';
  $('stateLabel').textContent = retrying ? 'Đang thử lại' : labels[status.state] || labels.idle;
  $('message').textContent = status.message || 'Bấm Bắt đầu xử lý trong app để chụp.';
  $('percent').textContent = `${progress}%`;
  $('progress').value = progress;
  $('warning').hidden = !retrying;
  $('backToTab').disabled = !Number.isInteger(status.targetTabId);
  $('stopCapture').disabled = status.state !== 'running' || stopPending;
}

function showError(message) {
  $('actionError').textContent = message;
  $('actionError').hidden = false;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.captureStatus?.newValue) render(changes.captureStatus.newValue);
});
chrome.runtime.sendMessage({ type: 'MAC_GET_STATUSES' })
  .then((statuses) => render(statuses?.session1 || { state: 'idle' }))
  .catch(() => showError('Không đọc được tiến độ. Hãy mở lại app để kiểm tra.'));

$('backToTab').addEventListener('click', async () => {
  $('actionError').hidden = true;
  try {
    const tab = await chrome.tabs.get(currentStatus.targetTabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
  } catch { showError('Tab đang chụp đã đóng hoặc không còn truy cập được. Mở app để xem kết quả hiện có.'); }
});

$('stopCapture').addEventListener('click', async () => {
  stopPending = true; render(currentStatus); $('actionError').hidden = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'MAC_STOP_SESSION', sessionId: 'session1' });
    if (!response?.ok) throw new Error('Stop failed');
  } catch { showError('Chưa gửi được yêu cầu dừng. Hãy mở app để dừng tool.'); }
  finally { stopPending = false; render(currentStatus); }
});

$('sizeToggle').addEventListener('click', async () => {
  $('actionError').hidden = true;
  try {
    const win = await chrome.windows.getCurrent();
    const nextCompact = !compact;
    if (nextCompact) expandedSize = { width: win.width, height: win.height };
    const size = nextCompact ? { width: win.width, height: 280 } : expandedSize || { width: 360, height: 330 };
    await chrome.windows.update(win.id, { ...size, state: 'normal' });
    compact = nextCompact;
    document.body.classList.toggle('compact', compact);
    $('sizeToggle').textContent = compact ? 'Mở rộng' : 'Thu gọn';
    $('sizeToggle').setAttribute('aria-expanded', String(!compact));
  } catch { showError('Không đổi được kích thước. Bạn vẫn có thể kéo mép cửa sổ để thu/phóng.'); }
});
