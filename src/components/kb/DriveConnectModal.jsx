import { useState } from 'react';
import { requestDriveAccess, getStoredToken, getFolderInfo, parseFolderIdFromUrl } from '../../lib/driveApi';

export default function DriveConnectModal({ kbFolder, onConnect, onClose }) {
  const [step, setStep] = useState(getStoredToken() ? 2 : 1);
  const [authLoading, setAuthLoading] = useState(false);
  const [folderUrl, setFolderUrl] = useState('');
  const [folderInfo, setFolderInfo] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async () => {
    setAuthLoading(true);
    setError('');
    try {
      await requestDriveAccess();
      setStep(2);
    } catch (e) {
      setError(e.message || 'Google 인증에 실패했습니다. 팝업이 차단됐는지 확인해주세요.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCheckFolder = async () => {
    setCheckLoading(true);
    setError('');
    setFolderInfo(null);
    try {
      const folderId = parseFolderIdFromUrl(folderUrl);
      if (!folderId) { setError('유효한 Drive 폴더 URL이나 ID가 아닙니다.'); return; }
      const token = getStoredToken();
      if (!token) { setStep(1); setError('인증이 만료됐습니다. 다시 연결해주세요.'); return; }
      const info = await getFolderInfo(token, folderId);
      setFolderInfo(info);
    } catch (e) {
      if (e.message.includes('401') || e.message.includes('만료')) {
        setStep(1);
        setError('Drive 인증이 만료됐습니다. 다시 연결해주세요.');
      } else {
        setError(e.message || '폴더를 찾을 수 없습니다. URL을 확인해주세요.');
      }
    } finally {
      setCheckLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!folderInfo) return;
    setConnectLoading(true);
    try {
      await onConnect({ driveFolderId: folderInfo.id, driveFolderName: folderInfo.name });
    } finally {
      setConnectLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="drive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drive-modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="drive-g-ico">G</span>
            <span>Google Drive 연동</span>
          </div>
          <button className="member-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* KB folder badge */}
        <div className="drive-modal-target">
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>연결 대상 KB 폴더</span>
          <span className="drive-folder-badge" style={{ background: kbFolder.color }}>
            {kbFolder.icon} {kbFolder.name}
          </span>
        </div>

        <div className="drive-modal-body">
          {/* Step 1: Auth */}
          <div className={'drive-step' + (step >= 1 ? ' active' : '')}>
            <div className="drive-step-num">1</div>
            <div className="drive-step-content">
              <div className="drive-step-title">Google 계정으로 Drive 연결</div>
              <div className="drive-step-desc">
                Drive 폴더를 읽기 전용으로 접근합니다. 파일은 Drive에 그대로 있고 Relay는 목록만 읽어옵니다.
              </div>
              {step === 1 && (
                <button className="btn-google" onClick={handleAuth} disabled={authLoading}>
                  <span className="drive-g-ico sm">G</span>
                  {authLoading ? '연결 중…' : 'Google로 Drive 연결'}
                </button>
              )}
              {step >= 2 && (
                <div style={{ fontSize: 12, color: 'var(--emerald)', fontWeight: 600 }}>
                  ✓ 연결됨
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Folder URL */}
          <div className={'drive-step' + (step >= 2 ? ' active' : ' muted')}>
            <div className="drive-step-num">2</div>
            <div className="drive-step-content">
              <div className="drive-step-title">연결할 Drive 폴더 URL 입력</div>
              {step >= 2 && (
                <>
                  <div className="drive-step-desc">
                    Google Drive에서 연결할 폴더를 열고 주소창 URL을 붙여넣으세요.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      className="form-input"
                      style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                      placeholder="https://drive.google.com/drive/folders/…"
                      value={folderUrl}
                      onChange={(e) => { setFolderUrl(e.target.value); setFolderInfo(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleCheckFolder()}
                    />
                    <button className="btn minor sm" onClick={handleCheckFolder} disabled={!folderUrl.trim() || checkLoading}>
                      {checkLoading ? '확인 중…' : '폴더 확인'}
                    </button>
                  </div>
                  {folderInfo && (
                    <div className="drive-folder-confirmed">
                      <span>📂</span>
                      <span style={{ fontWeight: 600 }}>{folderInfo.name}</span>
                      <a href={folderInfo.webViewLink} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 'auto' }}>↗ Drive에서 보기</a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: '0 20px', padding: '8px 12px', background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 'var(--r-2)', fontSize: 12, color: 'var(--rose)' }}>
            {error}
          </div>
        )}

        <div className="drive-modal-foot">
          <button className="btn ghost sm" onClick={onClose}>취소</button>
          <button
            className="btn accent sm"
            onClick={handleConnect}
            disabled={!folderInfo || connectLoading}
          >
            {connectLoading ? '연결 중…' : '연결 & 동기화 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}
