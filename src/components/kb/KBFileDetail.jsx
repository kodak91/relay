import { useState } from 'react';

const EXT_COLORS = {
  pdf: 'oklch(0.55 0.18 25)',  ai: 'oklch(0.55 0.16 50)',
  png: 'oklch(0.50 0.15 200)', jpg: 'oklch(0.50 0.15 200)', jpeg: 'oklch(0.50 0.15 200)',
  xlsx: 'oklch(0.50 0.15 150)', docx: 'oklch(0.50 0.15 240)',
  md: 'oklch(0.45 0.05 80)', txt: 'oklch(0.45 0.05 80)',
  pptx: 'oklch(0.55 0.18 25)', zip: 'oklch(0.50 0.10 80)',
  svg: 'oklch(0.50 0.15 200)',
};
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

export default function KBFileDetail({ file, onClose, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const c = EXT_COLORS[file.ext] || 'oklch(0.50 0.05 80)';
  const isImage = IMAGE_EXTS.includes(file.ext);
  const versions = file.versions || [{ v: 1, date: file.date, by: file.uploader, note: '최초 등록' }];

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(file.fileUrl || ''); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="kb-detail-overlay" onClick={onClose}>
      <aside className="kb-detail" onClick={(e) => e.stopPropagation()}>
        <header className="kb-detail-hd">
          <button className="icon-btn" onClick={onClose} style={{ fontSize: 13 }}>✕</button>
          <div className="kb-detail-actions">
            <button className="btn minor sm" onClick={copyLink}>
              {copied ? '복사됨 ✓' : '📋 링크 복사'}
            </button>
            {file.fileUrl && (
              <a className="btn minor sm" href={file.fileUrl} target="_blank" rel="noreferrer"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                ↗ 열기
              </a>
            )}
          </div>
        </header>

        <div className="kb-detail-body">
          {/* Thumb */}
          <div className="kb-detail-thumb">
            {isImage ? (
              <img src={file.fileUrl} alt={file.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="kb-thumb-bg" style={{ background: c, opacity: 0.25, position: 'absolute', inset: 0 }} />
            )}
            <div className="kb-detail-ext mono">{(file.ext || '?').toUpperCase()}</div>
            {(file.v || 1) > 1 && <div className="kb-detail-ver mono">v{file.v}</div>}
          </div>

          <h2 className="kb-detail-title">{file.name}</h2>

          <div className="kb-detail-meta">
            <div><span className="mono">업로더</span><b>{file.uploader || '—'}</b></div>
            <div><span className="mono">날짜</span><b>{file.date || '—'}</b></div>
            <div><span className="mono">크기</span><b className="mono">{file.size || '—'}</b></div>
            <div><span className="mono">버전</span><b className="mono">v{file.v || 1}</b></div>
          </div>

          {file.tags && file.tags.length > 0 && (
            <div className="kb-detail-tags">
              {file.tags.map((t, i) => <span key={i} className="tag mono">{t}</span>)}
            </div>
          )}

          {/* Version history */}
          <section className="kb-detail-section">
            <h4>버전 히스토리</h4>
            <div className="kb-versions">
              {versions.slice().reverse().map((v, i, arr) => (
                <div key={i} className={'kb-ver' + (v.v === (file.v || 1) ? ' current' : '')}>
                  <div className="kb-ver-mark">
                    <span className="dot" />
                    {i < arr.length - 1 && <span className="line" />}
                  </div>
                  <div className="kb-ver-i">
                    <div className="kb-ver-h">
                      <span className="kb-ver-v mono">v{v.v}</span>
                      {v.v === (file.v || 1) && <span className="kb-ver-now">현재</span>}
                      <span className="mono kb-ver-d">{v.date}</span>
                    </div>
                    <div className="kb-ver-by">{v.by}</div>
                    {v.note && <div className="kb-ver-note">"{v.note}"</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Delete */}
          {onDelete && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
              {showDeleteConfirm ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--rose)' }}>
                  <span>정말 삭제할까요?</span>
                  <button className="btn danger sm" onClick={onDelete}>삭제</button>
                  <button className="btn ghost sm" onClick={() => setShowDeleteConfirm(false)}>취소</button>
                </div>
              ) : (
                <button className="btn ghost sm" style={{ color: 'var(--rose)' }}
                  onClick={() => setShowDeleteConfirm(true)}>
                  🗑️ KB에서 제거
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
