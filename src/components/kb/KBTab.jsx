import { useState, useRef, useMemo, useEffect } from 'react';
import useAppStore from '../../store/appStore';
import { useKB } from '../../hooks/useKB';
import KBFileDetail from './KBFileDetail';
import DriveConnectModal from './DriveConnectModal';
import { getStoredToken, requestDriveAccess } from '../../lib/driveApi';
import { uploadFile, formatFileSize } from '../../lib/uploadFile';

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
  const { folders, files, loading, syncing, initFolders, connectDrive, disconnectDrive, syncFromDrive, addFileDirectly, deleteFile } = useKB(projectId);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [openFile, setOpenFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [syncError, setSyncError] = useState('');
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
  const driveFiles = displayed.filter((f) => f.source === 'drive');
  const localFiles = displayed.filter((f) => f.source !== 'drive');

  const handleSync = async () => {
    if (!activeFolderId) return;
    setSyncError('');
    let token = getStoredToken();
    if (!token) {
      try { token = await requestDriveAccess(); } catch { setSyncError('Drive 인증이 필요합니다. Drive 연동 버튼을 클릭해주세요.'); return; }
    }
    try {
      await syncFromDrive(activeFolderId, token);
    } catch (e) {
      setSyncError(e.message || '동기화 실패. Drive 연동을 다시 확인해주세요.');
    }
  };

  const handleConnectDrive = async ({ driveFolderId, driveFolderName }) => {
    await connectDrive(activeFolderId, { driveFolderId, driveFolderName });
    setShowDriveModal(false);
    // Auto-sync after connecting
    const token = getStoredToken();
    if (token) {
      try { await syncFromDrive(activeFolderId, token); } catch { /* will show error on next sync */ }
    }
  };

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
          uploader: user?.name || '', uploaderUid: user?.uid || '',
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

  const formatLastSync = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1) return '방금';
    if (diff < 60) return `${diff}분 전`;
    if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`;
    return d.toLocaleDateString('ko');
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
          <input placeholder="파일명 · 태그 · 업로더 검색…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          {search && <button className="kb-search-x" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="kb-view-switch">
          <button className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')} title="카드">▦</button>
          <button className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} title="목록">≡</button>
        </div>
        {/* Drive sync or local upload depending on folder type */}
        {activeFolder?.driveFolderId ? (
          <button className="btn-drive-sync" onClick={handleSync} disabled={syncing}>
            <span className="drive-g-ico sm">G</span>
            {syncing ? '동기화 중…' : '동기화'}
          </button>
        ) : (
          <button className="btn minor sm" onClick={() => fileInputRef.current?.click()} disabled={!activeFolderId || uploading}>
            {uploading ? '업로드 중…' : '+ 파일 색인'}
          </button>
        )}
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {f.driveFolderId && <span className="kb-drive-dot" title="Drive 연동됨">G</span>}
                <span className="mono cnt">{files.filter((x) => x.folderId === f.id).length}</span>
              </span>
            </button>
          ))}

          {/* Source section */}
          <div className="kb-tree-hd" style={{ marginTop: 18 }}>저장소</div>
          <div className="kb-source">
            {folders.filter((f) => f.driveFolderId).map((f) => (
              <div key={f.id} className="src-row">
                <div className="src-l">
                  <div className="src-ico g">G</div>
                  <div>
                    <div className="src-n">{f.driveFolderName}</div>
                    <div className="src-d mono">
                      {f.driveLastSync ? '동기화 ' + formatLastSync(f.driveLastSync) : '미동기화'}
                    </div>
                  </div>
                </div>
                <span className="src-on">● 연결됨</span>
              </div>
            ))}
            <div className="src-row">
              <div className="src-l">
                <div className="src-ico f">🔥</div>
                <div>
                  <div className="src-n">Firebase Storage</div>
                  <div className="src-d mono">직접 업로드 파일</div>
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
                  <p className="mono">
                    {displayed.length}개 파일
                    {activeFolder.driveFolderId && (
                      <span style={{ marginLeft: 8 }}>
                        · <span className="kb-drive-label">
                          <span className="drive-g-ico xs">G</span>
                          {activeFolder.driveFolderName}
                        </span>
                      </span>
                    )}
                  </p>
                </>
              ) : null}
            </div>
            {/* Drive connect / disconnect */}
            {!search && activeFolder && (
              <div style={{ display: 'flex', gap: 6 }}>
                {activeFolder.driveFolderId ? (
                  <button className="btn minor sm" style={{ fontSize: 11 }}
                    onClick={() => disconnectDrive(activeFolderId)}>
                    Drive 연동 해제
                  </button>
                ) : (
                  <button className="btn-drive-connect" onClick={() => setShowDriveModal(true)}>
                    <span className="drive-g-ico sm">G</span>
                    Drive 연동
                  </button>
                )}
              </div>
            )}
          </header>

          {/* Drive files section */}
          {!search && activeFolder?.driveFolderId && driveFiles.length > 0 && (
            <div className="kb-section-label">
              <span className="drive-g-ico xs">G</span> Drive 파일 ({driveFiles.length})
            </div>
          )}

          {viewMode === 'grid' ? (
            <div className="kb-grid">
              {displayed.map((f) => <KBFileCard key={f.id} file={f} onClick={() => setOpenFile(f)} />)}
              {!search && !activeFolder?.driveFolderId && (
                <button className="kb-add-card" onClick={() => fileInputRef.current?.click()}>
                  <span className="plus">＋</span>
                  <span>파일 추가</span>
                  <span className="mono">클릭 또는 드래그</span>
                </button>
              )}
              {!search && !activeFolder?.driveFolderId && displayed.length === 0 && (
                <button className="kb-add-drive" onClick={() => setShowDriveModal(true)}>
                  <span className="drive-g-ico">G</span>
                  <span>Drive 폴더 연동</span>
                  <span className="mono">파일은 Drive에, 색인만 여기에</span>
                </button>
              )}
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
              <div style={{ fontSize: 36 }}>{activeFolder?.driveFolderId ? '🔄' : '📭'}</div>
              <div className="kb-empty-t">
                {search ? '검색 결과 없음' : activeFolder?.driveFolderId ? 'Drive 폴더가 비어있거나 동기화가 필요합니다' : '아직 파일이 없어요'}
              </div>
              <div className="kb-empty-s">
                {search ? '파일명·업로더·태그로 다시 시도해보세요.' :
                  activeFolder?.driveFolderId ? '동기화 버튼을 눌러 Drive 파일을 불러오세요.' :
                    'Drive 폴더를 연동하거나 파일을 직접 업로드하세요.'}
              </div>
              {!search && activeFolder?.driveFolderId && (
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

      {showDriveModal && activeFolder && (
        <DriveConnectModal
          kbFolder={activeFolder}
          onConnect={handleConnectDrive}
          onClose={() => setShowDriveModal(false)}
        />
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
