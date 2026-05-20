import { useState, useRef, useMemo, useEffect } from 'react';
import useAppStore from '../../store/appStore';
import { useKB } from '../../hooks/useKB';
import KBFileDetail from './KBFileDetail';
import { uploadFile, formatFileSize } from '../../lib/uploadFile';

export const EXT_COLORS = {
  pdf: 'oklch(0.55 0.18 25)',  ai: 'oklch(0.55 0.16 50)',
  png: 'oklch(0.50 0.15 200)', jpg: 'oklch(0.50 0.15 200)', jpeg: 'oklch(0.50 0.15 200)',
  xlsx: 'oklch(0.50 0.15 150)', docx: 'oklch(0.50 0.15 240)',
  md: 'oklch(0.45 0.05 80)', txt: 'oklch(0.45 0.05 80)',
  pptx: 'oklch(0.55 0.18 25)', zip: 'oklch(0.50 0.10 80)',
  svg: 'oklch(0.50 0.15 200)', gif: 'oklch(0.50 0.15 200)', webp: 'oklch(0.50 0.15 200)',
};
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

export default function KBTab({ projectId }) {
  const { user } = useAppStore();
  const { folders, files, loading, initFolders, addFileDirectly, deleteFile } = useKB(projectId);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [openFile, setOpenFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!loading && folders.length === 0) initFolders();
  }, [loading, folders.length]);

  useEffect(() => {
    if (folders.length > 0 && !activeFolderId) setActiveFolderId(folders[0].id);
  }, [folders]);

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return files.filter((f) =>
      f.name?.toLowerCase().includes(q) ||
      f.uploader?.toLowerCase().includes(q) ||
      (f.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [search, files]);

  const displayed = searchResults || files.filter((f) => f.folderId === activeFolderId);

  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles?.length || !activeFolderId) return;
    setUploading(true);
    try {
      for (const file of Array.from(selectedFiles)) {
        const ext = file.name.split('.').pop().toLowerCase();
        const url = await uploadFile(file, () => {});
        await addFileDirectly({
          name: file.name, ext, fileUrl: url,
          size: formatFileSize(file.size),
          uploader: user?.name || '',
          uploaderUid: user?.uid || '',
          folderId: activeFolderId,
        });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (fileId) => {
    await deleteFile(fileId);
    setOpenFile(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) handleUpload(e.dataTransfer.files);
  };

  if (loading) {
    return (
      <div className="kb-main" style={{ display: 'grid', placeItems: 'center' }}>
        <span className="ai-typing"><span /><span /><span /></span>
      </div>
    );
  }

  return (
    <div className="kb-main" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Toolbar */}
      <div className="kb-toolbar">
        <div className="kb-search">
          <span>🔎</span>
          <input
            placeholder="파일명 · 태그 · 업로더 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button className="kb-search-x" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="kb-view-switch">
          <button className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')} title="카드">▦</button>
          <button className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} title="목록">≡</button>
        </div>
        <button className="btn minor sm" onClick={() => fileInputRef.current?.click()} disabled={!activeFolderId || uploading}>
          {uploading ? '업로드 중…' : '+ 파일 색인'}
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)} />
      </div>

      {/* Body */}
      <div className="kb-body">
        {/* Left tree */}
        <aside className="kb-tree">
          <div className="kb-tree-hd">폴더</div>
          {folders.map((f) => (
            <button
              key={f.id}
              className={'kb-tree-row' + (activeFolderId === f.id && !search ? ' on' : '')}
              onClick={() => { setActiveFolderId(f.id); setSearch(''); }}
            >
              <span className="kb-tree-ico" style={{ background: f.color, color: '#fff' }}>{f.icon}</span>
              <span className="nm">{f.name}</span>
              <span className="mono cnt">{files.filter((x) => x.folderId === f.id).length}</span>
            </button>
          ))}

          <div className="kb-tree-hd" style={{ marginTop: 18 }}>저장소</div>
          <div className="kb-source">
            <div className="src-row">
              <div className="src-l">
                <div className="src-ico f">🔥</div>
                <div>
                  <div className="src-n">Firebase Storage</div>
                  <div className="src-d mono">내장 저장소</div>
                </div>
              </div>
              <span className="src-on">● 연결됨</span>
            </div>
          </div>
        </aside>

        {/* Content */}
        <section className="kb-content">
          <header className="kb-content-hd">
            <div>
              {search ? (
                <>
                  <h3>"{search}" 검색 결과</h3>
                  <p className="mono">{displayed.length}개 파일 · 모든 폴더</p>
                </>
              ) : activeFolder ? (
                <>
                  <h3>
                    <span className="kb-content-ico" style={{ background: activeFolder.color, color: '#fff' }}>
                      {activeFolder.icon}
                    </span>
                    {activeFolder.name}
                  </h3>
                  <p className="mono">{displayed.length}개 파일</p>
                </>
              ) : null}
            </div>
          </header>

          {viewMode === 'grid' ? (
            <div className="kb-grid">
              {displayed.map((f) => (
                <KBFileCard key={f.id} file={f} onClick={() => setOpenFile(f)} />
              ))}
              {!search && (
                <button className="kb-add-card" onClick={() => fileInputRef.current?.click()}>
                  <span className="plus">＋</span>
                  <span>파일 추가</span>
                  <span className="mono">클릭 또는 드래그</span>
                </button>
              )}
            </div>
          ) : (
            <div className="kb-list">
              <div className="kb-list-hd mono">
                <span>이름</span><span>버전</span><span>업로더</span>
                <span>크기</span><span>날짜</span><span></span>
              </div>
              {displayed.map((f) => (
                <KBFileRow key={f.id} file={f} onClick={() => setOpenFile(f)} />
              ))}
            </div>
          )}

          {displayed.length === 0 && !uploading && (
            <div className="kb-empty">
              <div style={{ fontSize: 36 }}>📭</div>
              <div className="kb-empty-t">{search ? '검색 결과 없음' : '아직 파일이 없어요'}</div>
              <div className="kb-empty-s">
                {search ? '파일명·업로더·태그로 다시 시도해보세요.' : '파일을 드래그하거나 + 파일 색인을 클릭하세요.'}
              </div>
            </div>
          )}
        </section>

        {openFile && (
          <KBFileDetail
            file={openFile}
            onClose={() => setOpenFile(null)}
            onDelete={() => handleDelete(openFile.id)}
          />
        )}
      </div>
    </div>
  );
}

export function KBFileCard({ file, onClick }) {
  const c = EXT_COLORS[file.ext] || 'oklch(0.50 0.05 80)';
  const isImage = IMAGE_EXTS.includes(file.ext);
  return (
    <button className="kb-card" onClick={onClick}>
      <div className="kb-card-hd">
        <div className="kb-card-ext" style={{ background: c }}>{(file.ext || '?').toUpperCase()}</div>
        {(file.v || 1) > 1 && <span className="kb-card-ver mono">v{file.v}</span>}
      </div>
      <div className="kb-card-thumb">
        {isImage ? (
          <img src={file.fileUrl} alt={file.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        ) : (
          <>
            <div style={{ position: 'absolute', inset: 0, background: c, opacity: 0.15 }} />
            <div className="kb-thumb-overlay">{(file.ext || '?').toUpperCase()}</div>
          </>
        )}
      </div>
      <div className="kb-card-name">{file.name}</div>
      <div className="kb-card-meta">
        <span>{file.uploader}</span>
        <span className="dot">·</span>
        <span className="mono">{file.date}</span>
      </div>
      {file.tags?.length > 0 && (
        <div className="kb-card-tags">
          {file.tags.slice(0, 2).map((t, i) => <span key={i} className="tag mono">{t}</span>)}
        </div>
      )}
    </button>
  );
}

export function KBFileRow({ file, onClick }) {
  const c = EXT_COLORS[file.ext] || 'oklch(0.50 0.05 80)';
  return (
    <button className="kb-row" onClick={onClick}>
      <span className="kb-row-name">
        <span className="kb-row-ext mono" style={{ background: c }}>{(file.ext || '?').toUpperCase()}</span>
        {file.name}
        {file.tags?.slice(0, 1).map((t, i) => <span key={i} className="tag mono kb-row-tag">{t}</span>)}
      </span>
      <span className="mono">v{file.v || 1}</span>
      <span>{file.uploader}</span>
      <span className="mono">{file.size}</span>
      <span className="mono">{file.date}</span>
      <a className="kb-row-act" href={file.fileUrl} target="_blank" rel="noreferrer"
        onClick={(e) => e.stopPropagation()}>↗ 열기</a>
    </button>
  );
}
