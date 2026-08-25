// 옵시디언 vault를 브라우저에서 직접 읽어 그래프로 색인한다.
// Relay는 Vercel(서버리스)에 배포되므로 로컬 폴더(C:\Users\...)를 서버가 읽을 방법이 없다.
// 대신 File System Access API로 "이 브라우저"가 사용자 폴더를 직접 읽는다 — 서버 왕복 없음,
// vault 내용은 어디에도 저장되지 않고 이 브라우저 세션 메모리에만 존재한다 (읽기 전용).
const SKIP_DIRS = new Set(['node_modules', '.git']);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const TEXT_EXTS = new Set(['md', 'txt']);
const PDF_EXTS = new Set(['pdf']);

export function fsAccessSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ── 폴더 핸들을 브라우저에 기억시켜 매번 다시 고르지 않게 함 ──
const IDB_NAME = 'relay-aide';
const IDB_STORE = 'handles';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVaultHandle(handle) {
  const db = await openHandleDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, 'vaultDir');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadVaultHandle() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get('vaultDir');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// 이미 허가된 폴더인지 조용히 확인 (사용자 클릭 없이). 없으면 null.
export async function verifyVaultPermission(handle) {
  if (!handle) return false;
  const opts = { mode: 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return false;
}

// 사용자 클릭(버튼)에서만 호출 가능 — 브라우저가 제스처 없이는 팝업을 막는다.
export async function requestVaultPermission(handle) {
  const opts = { mode: 'read' };
  return (await handle.requestPermission(opts)) === 'granted';
}

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

// [[노트 제목]], [[노트 제목|표시 텍스트]], [[노트 제목#섹션]] → "노트 제목"만 추출
function extractLinks(text) {
  const links = [];
  const re = /\[\[([^\]|#]+)/g;
  let m;
  while ((m = re.exec(text))) links.push(m[1].trim());
  return links;
}

function extractTags(text) {
  const tags = new Set();
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const block = fm[1];
    const inline = block.match(/tags:\s*\[(.*?)\]/);
    if (inline) inline[1].split(',').forEach((t) => { const v = t.trim().replace(/^["']|["']$/g, ''); if (v) tags.add(v); });
    const list = block.match(/tags:\s*\n((?:\s*-\s*.+\n?)+)/);
    if (list) list[1].split('\n').forEach((line) => { const v = line.replace(/^\s*-\s*/, '').trim(); if (v) tags.add(v); });
  }
  const inlineTags = text.match(/(^|\s)#([\w가-힣][\w가-힣-]*)/g);
  if (inlineTags) inlineTags.forEach((t) => tags.add(t.trim().replace(/^#/, '')));
  return [...tags];
}

// 재귀적으로 폴더를 걷는다. topFolder(첫 하위 폴더명)를 "종류"로 쓴다 — vault에
// 이미 있는 00-받은자료 / 10-매일기록 / 20-고객 / 30-자비스결과 / 90-보관 분류를 그대로 재사용.
async function walk(dirHandle, relPath, topFolder, notes, skipped) {
  for await (const [name, handle] of dirHandle.entries()) {
    const nextPath = relPath ? `${relPath}/${name}` : name;
    if (handle.kind === 'directory') {
      if (SKIP_DIRS.has(name)) continue;
      await walk(handle, nextPath, topFolder || name, notes, skipped);
      continue;
    }
    const ext = extOf(name);
    if (!TEXT_EXTS.has(ext) && !PDF_EXTS.has(ext)) continue;
    const file = await handle.getFile();
    if (file.size > MAX_FILE_BYTES) { skipped.tooBig++; continue; }
    const text = TEXT_EXTS.has(ext) ? await file.text() : null;
    notes.push({
      id: nextPath,
      title: name.replace(/\.[^.]+$/, ''),
      path: nextPath,
      ext,
      kind: topFolder || '(루트)',
      size: file.size,
      mtime: file.lastModified,
      text,
      tags: text ? extractTags(text) : [],
      links: text ? extractLinks(text) : [],
    });
  }
}

function buildGraph(notes) {
  const titleToId = new Map();
  notes.forEach((n) => {
    const key = n.title.toLowerCase();
    if (!titleToId.has(key)) titleToId.set(key, n.id);
  });

  const edges = [];
  notes.forEach((n) => {
    n.links.forEach((linkTitle) => {
      const targetId = titleToId.get(linkTitle.toLowerCase());
      if (targetId && targetId !== n.id) edges.push({ source: n.id, target: targetId });
    });
  });

  const degree = new Map(notes.map((n) => [n.id, 0]));
  edges.forEach((e) => {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  });

  const nodes = notes.map((n) => ({
    id: n.id,
    title: n.title,
    kind: n.kind,
    tags: n.tags,
    path: n.path,
    degree: degree.get(n.id) || 0,
  }));

  return { nodes, edges };
}

export async function indexVault(dirHandle) {
  const notes = [];
  const skipped = { tooBig: 0 };
  await walk(dirHandle, '', '', notes, skipped);
  const { nodes, edges } = buildGraph(notes);

  const counts = {};
  nodes.forEach((n) => { counts[n.kind] = (counts[n.kind] || 0) + 1; });

  const topHubs = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 10);

  // 1단계 요구사항: 색인 결과를 콘솔에 보고
  console.log(`[Aide] vault 색인 완료 — 노트 ${nodes.length}개, 링크 ${edges.length}개, 2MB 초과로 건너뜀 ${skipped.tooBig}개`);
  console.table(Object.entries(counts).map(([kind, count]) => ({ 종류: kind, 개수: count })));
  console.table(topHubs.map((n) => ({ 노트: n.title, 연결: n.degree, 종류: n.kind })));

  const notesById = new Map(notes.map((n) => [n.id, n]));
  return { notes, notesById, nodes, edges, counts, topHubs, skipped };
}
