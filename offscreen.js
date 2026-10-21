async function stitch(frames, geometry) {
  const first = await createImageBitmap(await (await fetch(frames[0].dataUrl)).blob());
  // Some visible-tab captures include an extra side-panel strip on the right.
  // Derive density from viewport height, not that strip's inflated width.
  const scale = geometry.viewportHeight > 0 ? first.height / geometry.viewportHeight : first.width / geometry.viewportWidth;
  const wholePage = geometry.wholePage === true;
  const footer = wholePage ? Math.max(0, geometry.viewportHeight - geometry.rect.top - geometry.rect.height) : 0;
  const width = Math.max(1, Math.round((wholePage ? geometry.viewportWidth : geometry.rect.width) * scale));
  const naturalHeight = Math.max(1, Math.ceil((geometry.scrollHeight + (wholePage ? geometry.rect.top + footer : 0)) * scale));
  const height = Math.min(naturalHeight, 30000);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = geometry.backgroundColor || '#edf6fc'; ctx.fillRect(0, 0, width, height);
  const bitmapWidth = first.width, bitmapHeight = first.height;
  let coveredUntil = wholePage ? Math.round(geometry.rect.top * scale) : 0;
  for (let i = 0; i < frames.length; i++) {
    const bitmap = i === 0 ? first : await createImageBitmap(await (await fetch(frames[i].dataUrl)).blob());
    if (bitmap.width !== bitmapWidth || bitmap.height !== bitmapHeight) {
      bitmap.close();
      throw new Error('Kích thước ảnh thay đổi giữa các đoạn. Tool sẽ bỏ ảnh tạm và chụp lại từ đầu.');
    }
    if (wholePage && i === 0) {
      ctx.drawImage(bitmap, 0, 0, width, bitmap.height, 0, 0, width, bitmap.height);
      if (footer > 0) {
        const footerHeight = Math.round(footer * scale);
        ctx.drawImage(bitmap, 0, bitmap.height - footerHeight, width, footerHeight, 0, height - footerHeight, width, footerHeight);
      }
      coveredUntil = Math.round((geometry.rect.top + geometry.rect.height) * scale);
      bitmap.close();
      continue;
    }
    const sx = Math.round(geometry.rect.left * scale);
    let sy = Math.round(geometry.rect.top * scale);
    let sw = Math.min(Math.round(geometry.rect.width * scale), bitmap.width - sx);
    const frameStickyCutoffX = Number.isFinite(frames[i].stickyCutoffX) ? frames[i].stickyCutoffX : geometry.stickyCutoffX;
    if (i > 0 && Number.isFinite(frameStickyCutoffX)) {
      sw = Math.min(sw, Math.max(1, Math.round((frameStickyCutoffX - geometry.rect.left) * scale)));
    }
    const sh = Math.min(Math.round(geometry.rect.height * scale), bitmap.height - sy);
    const dx = wholePage ? sx : 0;
    let dy = Math.round((frames[i].scrollTop + (wholePage ? geometry.rect.top : 0)) * scale);
    if (dy > coveredUntil + Math.ceil(2 * scale)) {
      bitmap.close();
      throw new Error('Bị thiếu một đoạn do cuộn vượt vùng đã chụp. Tool sẽ chụp lại từ đầu.');
    }
    // Only append new pixels. Redrawing the overlap can cut cards apart when
    // Meta changes sticky content or layout between two screenshots.
    const overlap = Math.max(0, coveredUntil - dy);
    sy += overlap;
    dy += overlap;
    // Clip the source and destination equally; otherwise the final tile is
    // squeezed vertically when it extends past the bottom of the long image.
    const drawHeight = Math.min(sh - overlap, height - dy);
    if (drawHeight > 0) ctx.drawImage(bitmap, sx, sy, sw, drawHeight, dx, dy, sw, drawHeight);
    coveredUntil = Math.max(coveredUntil, dy + Math.max(0, drawHeight));
    bitmap.close();
  }
  const contentBottom = Math.min(height, Math.round((geometry.scrollHeight + (wholePage ? geometry.rect.top : 0)) * scale));
  if (coveredUntil < contentBottom - Math.ceil(2 * scale)) {
    const missing = Math.ceil((contentBottom - coveredUntil) / scale);
    throw new Error(`Ảnh chưa phủ hết nội dung: thiếu ${missing} px (nội dung ${geometry.scrollHeight} px; khung cuộn ${geometry.clientHeight ?? '?'} px; vùng chụp ${geometry.rect.height} px; vị trí cuối ${frames.at(-1).scrollTop} px). Tool sẽ chụp lại từ đầu.`);
  }
  const marks = geometry.regionHighlights || (geometry.advantageHighlight ? [{ ...geometry.advantageHighlight, kind: 'advantage' }] : []);
  const drawnKinds = new Set();
  for (const mark of marks) {
    if (!mark) continue;
    const maxHeight = mark.kind === 'advantage' ? 900 : ['ta', 'budget'].includes(mark.kind) ? 2000 : 0;
    if (!mark || drawnKinds.has(mark.kind) || ![mark.x, mark.y, mark.width, mark.height].every(Number.isFinite)
      || mark.width < 40 || mark.height < 30 || mark.height > maxHeight || mark.width > geometry.rect.width
      || mark.x + mark.width <= 0 || mark.x >= width / scale || mark.y + mark.height <= 0 || mark.y >= height / scale) continue;
    const margin = Math.max(5, Math.round(6 * scale));
    const lineWidth = Math.max(4, Math.round(4 * scale));
    const x = Math.max(lineWidth, Math.round(mark.x * scale) - margin);
    const y = Math.max(lineWidth, Math.round(mark.y * scale) - margin);
    const right = Math.min(width - lineWidth, Math.round((mark.x + mark.width) * scale) + margin);
    const bottom = Math.min(height - lineWidth, Math.round((mark.y + mark.height) * scale) + margin);
    if (right > x && bottom > y) {
      ctx.save();
      ctx.strokeStyle = '#ff2020';
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(255,32,32,.28)';
      ctx.shadowBlur = Math.max(3, Math.round(3 * scale));
      ctx.strokeRect(x, y, right - x, bottom - y);
      ctx.restore();
      drawnKinds.add(mark.kind);
    }
  }
  return { dataUrl: canvas.toDataURL('image/png'), width, height, truncated: naturalHeight > height };
}
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type !== 'MAC_STITCH') return;
  stitch(message.frames, message.geometry).then((result) => respond({ ok: true, ...result })).catch((error) => respond({ ok: false, error: error.message }));
  return true;
});
