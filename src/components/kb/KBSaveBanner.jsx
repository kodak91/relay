import { useState, useEffect } from 'react';
import { useKB } from '../../hooks/useKB';
import { getStoredToken, requestDriveAccess } from '../../lib/driveApi';

export default function KBSaveBanner({ projectId, files, initialFolderId = null, user, onSave, onDismiss }) {
  const { folders, saveFromChat } = useKB(projectId);
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [driveReady, setDriveReady] = useState(() => !!getStoredToken()); // 유효한 Drive 토큰 보유 여부
  const [connecting, setConnecting] = useState(false);

  const activeFolderId = selectedFolderId || folders[0]?.id;
  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const needsDrive = !!activeFolder?.driveFolderId; // 선택 폴더가 Drive 폴더인가

  // 토큰 유효성 재확인 (만료 시 UI 상태 갱신)
  useEffect(() => { setDriveReady(!!getStoredToken()); }, [activeFolderId]);

  // 명시적 Drive 인증 — 저장과 분리해 "저장할 때 갑자기 뜨는" 혼란 방지
  const connectDrive = async () => {
    setConnecting(true);
    setSaveError('');
    try {
      await requestDriveAccess();
      setDriveReady(true);
    } catch {
      setSaveError('Drive 인증에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setConnecting(false);
    }
  };

  const handleSave = async () => {
    if (!activeFolderId) return;
    setSaving(true);
    setSaveError('');
    try {
      let token = null;
      if (activeFolder?.driveFolderId) {
        token = getStoredToken();
        if (!token) {
          try { token = await requestDriveAccess(); setDriveReady(true); } catch {
            setSaveError('Drive 인증이 필요합니다. 아래 "Drive 연결" 버튼을 눌러주세요.');
            return;
          }
        }
      }
      for (const f of files) {
        await saveFromChat({
          ...f,
          folderId: activeFolderId,
          uploader: user?.name || '',
          uploaderUid: user?.uid || '',
          token,
        });
      }
      onSave();
    } catch (e) {
      setSaveError(e.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const label = files.length === 1 ? `"${files[0].name}"` : `파일 ${files.length}개`;

  if (folders.length === 0) return null;

  return (
    <div className="kb-savebar">
      <span className="kb-savebar-ico">📚</span>
      <div className="kb-savebar-i">
        <b>{label}을 저장소에 저장할까요?</b>
        {needsDrive && (
          <span style={{ fontSize: 11, color: driveReady ? 'var(--emerald, #0a7)' : 'var(--ink-mute)' }}>
            {driveReady ? '● Drive 인증됨 (약 1시간 유지)' : '○ Drive 인증 필요 — 저장 전 한 번만 연결하세요'}
          </span>
        )}
        {saveError && <span style={{ fontSize: 11, color: 'var(--rose)' }}>{saveError}</span>}
        <div className="kb-savebar-folders">
          {folders.map((f) => (
            <button
              key={f.id}
              className={'kb-folder-chip' + (activeFolderId === f.id ? ' on' : '')}
              style={{ paddingLeft: 8 + (f.depth || 0) * 10 }}
              onClick={() => setSelectedFolderId(f.id)}
            >
              <span className="drive-g-ico xs" style={{ marginRight: 4 }}>G</span>
              {f.isRoot ? '🗂' : '📁'} {f.name}
            </button>
          ))}
        </div>
      </div>
      <button className="btn ghost sm" onClick={onDismiss}>나중에</button>
      {needsDrive && !driveReady && (
        <button className="btn sm" onClick={connectDrive} disabled={connecting}>
          {connecting ? '연결 중…' : '🔗 Drive 연결'}
        </button>
      )}
      <button className="btn accent sm" onClick={handleSave} disabled={saving || !activeFolderId}>
        {saving ? '저장 중…' : '📚 저장'}
      </button>
    </div>
  );
}
