(() => {
  const textDecoder = new TextDecoder('utf-8');

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let eocd = -1;
    for (let offset = bytes.length - 22, floor = Math.max(0, bytes.length - 65557); offset >= floor; offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) throw new Error('File XLSX không có thư mục ZIP hợp lệ.');
    const entryCount = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let index = 0; index < entryCount; index++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Cấu trúc ZIP của XLSX không hợp lệ.');
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = textDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, '/');
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      let content;
      if (method === 0) content = new Uint8Array(compressed);
      else if (method === 8) content = await inflateRaw(compressed);
      else throw new Error(`XLSX dùng kiểu nén chưa hỗ trợ (${method}).`);
      entries.set(name.replace(/^\//, ''), content);
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function xml(entries, path) {
    const bytes = entries.get(path.replace(/^\//, ''));
    if (!bytes) return null;
    const doc = new DOMParser().parseFromString(textDecoder.decode(bytes), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error(`XML không hợp lệ: ${path}`);
    return doc;
  }

  function texts(node, tag = 't') {
    return [...node.getElementsByTagName(tag)].map((item) => item.textContent || '').join('');
  }

  function columnIndex(reference) {
    const letters = String(reference || 'A1').match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
    let value = 0;
    for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
    return value - 1;
  }

  function parseSheet(doc, sharedStrings) {
    const rows = [];
    for (const rowNode of doc.getElementsByTagName('row')) {
      const cells = new Map();
      let width = 0;
      for (const cell of rowNode.getElementsByTagName('c')) {
        const index = columnIndex(cell.getAttribute('r'));
        const type = cell.getAttribute('t');
        const valueNode = cell.getElementsByTagName('v')[0];
        let value = '';
        if (type === 'inlineStr') value = texts(cell);
        else if (valueNode) value = type === 's' ? (sharedStrings[Number(valueNode.textContent)] || '') : (valueNode.textContent || '');
        cells.set(index, value);
        width = Math.max(width, index + 1);
      }
      rows.push(Array.from({ length: width }, (_, index) => cells.get(index) || ''));
    }
    return rows;
  }

  async function parse(file) {
    const entries = await unzip(await file.arrayBuffer());
    const sharedDoc = xml(entries, 'xl/sharedStrings.xml');
    const sharedStrings = sharedDoc ? [...sharedDoc.getElementsByTagName('si')].map((node) => texts(node)) : [];
    const workbook = xml(entries, 'xl/workbook.xml');
    const relations = xml(entries, 'xl/_rels/workbook.xml.rels');
    if (!workbook) throw new Error('Không tìm thấy workbook.xml trong file XLSX.');
    const relationTargets = new Map();
    if (relations) {
      for (const relation of relations.getElementsByTagName('Relationship')) {
        relationTargets.set(relation.getAttribute('Id'), relation.getAttribute('Target'));
      }
    }
    const sheets = [];
    for (const sheet of workbook.getElementsByTagName('sheet')) {
      const relationId = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relationTargets.get(relationId) || '';
      target = target.replace(/^\//, '');
      if (target && !target.startsWith('xl/')) target = `xl/${target}`;
      const sheetDoc = xml(entries, target);
      if (sheetDoc) sheets.push({ name: sheet.getAttribute('name') || 'Sheet', rows: parseSheet(sheetDoc, sharedStrings) });
    }
    if (!sheets.length) throw new Error('Không đọc được sheet dữ liệu trong XLSX.');
    return sheets;
  }

  globalThis.MetaAdsXlsx = { parse };
})();
