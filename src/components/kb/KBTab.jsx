import { useState, useRef, useMemo } from 'react';
import useAppStore from '../../store/appStore';
import { useKB } from '../../hooks/useKB';
import KBFileDetail from './KBFileDetail';
import DriveConnectModal from './DriveConnectModal';
import { getStoredToken, requestDriveAccess } from '../../lib/driveApi';

export const EXT_COLORS = {
  pdf: 'oklch(0.55 0.18 25)',  ai: 'oklch(0.55 0.16 50)',
  png: 'oklch(0.50 0.15 200)', jpg: 'oklch(0.50 0.15 200)', jpeg: 'oklch(0.50 0.15 200)',
  xlsx: 'oklch(0.50 0.15 150)', docx: 'oklch(0.50 0.15 240)',
  md: 'oklch(0.45 0.05 80)', txt: 'oklch(0.45 0.05 80)',
  pptx: 'oklch(0.55 0.18 25)', zip: 'oklch(0.50 0.10 80)',
  svg: 'oklch(0.50 0.15 200)', gif: 'oklch(0.50 0.15 200)', webp: 'oklch(0.50 0.15 200)',
  gdoc: '#4285F4', gsheet: '#34A853', gslide: '#FBBC05',
};
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

export default function KBTab({ projectId }) {
  const { user } = useAppStore();
  const {
    folders, files, loading, syncing,
    connectDriveRoot, disconnectDrive, syncFromDrive,
    uploadToDrive, deleteFile,
  } = useKB(projectId);

  const [activeFolderId, setActiveFolderId] = useState(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [openFile, setOpenFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [syncError, setSyncError] = useState('');
  const fileInputRef = useRef(null);

  const activeFolder = folders.find((f) => f.id === activeFolderId) || folders[0] || null;
  const effectiveFolderId = activeFolderId || folders[0]?.id || null;

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return files.filter((f) =>
      f.name?.toLowerCase().includes(q) ||
      f.uploader?.toLowerCase().includes(q) ||
      (f.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [search, files]);

  const displayed = searchResults || files.filter((f) => f.folderId === effectiveFolderId);

  const getToken = async () => {
    let token = getStoredToken();
    if (!token) token = await requestDriveAccess();
    return token;
  };

  const handleSync = async () => {
    setSyncError('');
    try {
      const token = await getToken();
      await syncFromDrive(token);
    } catch (e) {
      setSyncError(e.message || '동기화 실패');
    }
  };

  const handleConnectDrive = async (token, { driveFolderId, driveFolderName }) => {
    try {
      // connectDriveRoot builds the folder tree AND indexes files in one pass
      await connectDriveRoot(token, { driveFolderId, driveFolderName });
      setShowDriveModal(false);
      setActiveFolderId(null);
    } catch (e) {
      setSyncError(e.message || 'Drive 연동 실패');
      setShowDriveModal(false);
    }
  };

  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles?.length || !effectiveFolderId) return;
    setSyncError('');
    setUploading(true);
    try {
      const token = await getToken();
      await uploadToDrive(effectiveFolderId, Array.from(selectedFiles), token);
    } catch (e) {
      setSyncError(e.message || '업로드 실패');
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

  const formatLastSync = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const diff = Math.floor((new Date() - d) / 60000);
    if (diff < 1) return '방금';
    if (diff < 60) return `${diff}분 전`;
    if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
    return d.toLocaleDateString('ko');
  };

  const isConnected = folders.length > 0;

  if (loading) {
    return (
      <div className="kb-main" style={{ display: 'grid', placeItems: 'center' }}>
        <span className="ai-typing"><span /><span /><span /></span>
      </div>
    );
  }

  // No Drive connected yet — show big connect CTA
  if (!isConnected) {
    return (
      <div className="kb-main" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span className="drive-g-ico" style={{ width: 56, height: 56, fontSize: 32 }}>G</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Drive 폴더 연동</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', maxWidth: 300 }}>
              Google Drive 폴더를 연결하면 하위 폴더 구조가 그대로 KB 트리로 표시됩니다.
            </div>
          </div>
          <button className="btn-drive-connect" style={{ padding: '10px 20px', fontSize: 13 }}
            onClick={() => setShowDriveModal(true)}>
            <span className="drive-g-ico sm">G</span>
            Drive 폴더 연동하기
          </button>
        </div>
        {showDriveModal && (
          <DriveConnectModal onConnect={handleConnectDrive} onClose={() => setShowDriveModal(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="kb-main" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Toolbar */}
      <div className="kb-toolbar">
        <div className="kb-search">
          <span>🔎</span>
          <input placeholder="파일명 · 태그 · 업로더 검색…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          {search && <button className="kb-search-x" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="kb-view-switch">
          <button className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')} title="카드">▦</button>
          <button className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} title="목록">≡</button>
        </div>
        <button className="btn-drive-sync" onClick={handleSync} disabled={syncing}>
          <span className="drive-g-ico sm">G</span>
          {syncing ? '동기화 중…' : '동기화'}
        </button>
        <button className="btn minor sm" onClick={() => fileInputRef.current?.click()}
          disabled={!effectiveFolderId || uploading}>
          {uploading ? '업로드 중…' : '↑ 업로드'}
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)} />
      </div>

      {syncError && (
        <div style={{ margin: '6px 20px 0', padding: '7px 12px', background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 'var(--r-2)', fontSize: 12, color: 'var(--rose)' }}>
          ⚠️ {syncError}
          <button onClick={() => setSyncError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--rose)' }}>✕</button>
        </div>
      )}

      {/* Body */}
      <div className="kb-body">
        {/* Left tree — shows Drive folder hierarchy */}
        <aside className="kb-tree">
          <div className="kb-tree-hd">
            <span>Drive 폴더</span>
            <button className="kb-tree-disc" onClick={disconnectDrive} title="연동 해제">✕</button>
          </div>
          {folders.map((f) => (
            <button
              key={f.id}
              className={'kb-tree-row' + ((effectiveFolderId === f.id && !search) ? ' on' : '')}
              style={{ paddingLeft: 12 + (f.depth || 0) * 14 }}
              onClick={() => { setActiveFolderId(f.id); setSearch(''); }}
            >
              <span className="kb-tree-ico drive">
                {f.isRoot ? '🗂' : '📁'}
              </span>
              <span className="nm">{f.name}</span>
              <span className="mono cnt">{files.filter((x) => x.folderId === f.id).length}</span>
            </button>
          ))}

          {/* Sync info */}
          <div className="kb-tree-hd" style={{ marginTop: 18 }}>저장소</div>
          <div className="kb-source">
            {folders.filter((f) => f.isRoot).map((f) => (
              <div key={f.id} className="src-row">
                <div className="src-l">
                  <div className="src-ico g">G</div>
                  <div>
                    <div className="src-n">{f.name}</div>
                    <div className="src-d mono">
                      {f.driveLastSync ? '동기화 ' + formatLastSync(f.driveLastSync) : '미동기화'}
                    </div>
                  </div>
                </div>
                <span className="src-on">● 연결됨</span>
              </div>
            ))}
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
                    {activeFolder.isRoot ? '🗂' : '📁'} {activeFolder.name}
                  </h3>
                  <p className="mono" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {displayed.length}개 파일
                    <span style={{ color: 'var(--ink-mute)' }}>·</span>
                    <span className="kb-drive-label">
                      <span className="drive-g-ico xs">G</span>
                      {activeFolder.drivePath}
                    </span>
                  </p>
                </>
              ) : null}
            </div>
          </header>

          {viewMode === 'grid' ? (
            <div className="kb-grid">
              {displayed.map((f) => <KBFileCard key={f.id} file={f} onClick={() => setOpenFile(f)} />)}
              <button className="kb-add-card" onClick={() => fileInputRef.current?.click()}>
                <span className="plus">＋</span>
                <span>파일 업로드</span>
                <span className="mono">클릭 또는 드래그</span>
              </button>
            </div>
          ) : (
            <div className="kb-list">
              <div className="kb-list-hd mono">
                <span>이름</span><span>버전</span><span>업로더</span>
                <span>크기</span><span>날짜</span><span>소스</span>
              </div>
              {displayed.map((f) => <KBFileRow key={f.id} file={f} onClick={() => setOpenFile(f)} />)}
            </div>
          )}

          {displayed.length === 0 && !uploading && !syncing && (
            <div className="kb-empty">
              <div style={{ fontSize: 36 }}>📭</div>
              <div className="kb-empty-t">
                {search ? '검색 결과 없음' : '이 폴더에 파일이 없어요'}
              </div>
              <div className="kb-empty-s">
                {search
                  ? '파일명·업로더·태그로 다시 시도해보세요.'
                  : '동기화 버튼으로 Drive 파일을 가져오거나 직접 업로드하세요.'}
              </div>
              {!search && (
                <button className="btn accent sm" style={{ marginTop: 12 }} onClick={handleSync} disabled={syncing}>
                  동기화 시작
                </button>
              )}
            </div>
          )}
        </section>

        {openFile && (
          <KBFileDetail file={openFile} onClose={() => setOpenFile(null)}
            onDelete={openFile.source !== 'drive' ? () => handleDelete(openFile.id) : null} />
        )}
      </div>

      {showDriveModal && (
        <DriveConnectModal onConnect={handleConnectDrive} onClose={() => setShowDriveModal(false)} />
      )}
    </div>
  );
}

export function KBFileCard({ file, onClick }) {
  const c = EXT_COLORS[file.ext] || 'oklch(0.50 0.05 80)';
  const isImage = IMAGE_EXTS.includes(file.ext);
  const isDrive = file.source === 'drive';
  return (
    <button className="kb-card" onClick={onClick}>
      <div className="kb-card-hd">
        <div className="kb-card-ext" style={{ background: c }}>{(file.ext || '?').toUpperCase()}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isDrive && <span className="kb-src-badge drive">G</span>}
          {(file.v || 1) > 1 && <span className="kb-card-ver mono">v{file.v}</span>}
        </div>
      </div>
      <div className="kb-card-thumb">
        {isImage && file.fileUrl ? (
          <img src={file.fileUrl} alt={file.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        ) : file.thumbnailLink ? (
          <img src={file.thumbnailLink} alt={file.name}
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
  const isDrive = file.source === 'drive';
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
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isDrive ? (
          <a className="kb-row-act" href={file.webViewLink} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}>
            <span className="drive-g-ico xs">G</span>Drive
          </a>
        ) : (
          <a className="kb-row-act" href={file.fileUrl} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}>↗ 열기</a>
        )}
      </span>
    </button>
  );
}
