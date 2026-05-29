import { useState } from 'react';
import { useKB } from '../../hooks/useKB';
import { getStoredToken, requestDriveAccess } from '../../lib/driveApi';

export default function KBSaveBanner({ projectId, files, initialFolderId = null, user, onSave, onDismiss }) {
  const { folders, saveFromChat } = useKB(projectId);
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const activeFolderId = selectedFolderId || folders[0]?.id;
  const activeFolder = folders.find((f) => f.id === activeFolderId);

  const handleSave = async () => {
    if (!activeFolderId) return;
    setSaving(true);
    setSaveError('');
    try {
      let token = null;
      if (activeFolder?.driveFolderId) {
        token = getStoredToken();
        if (!token) {
          try { token = await requestDriveAccess(); } catch {
            setSaveError('Drive 인증이 필요합니다. 저장소 탭에서 먼저 Drive를 연동해주세요.');
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
      <button className="btn accent sm" onClick={handleSave} disabled={saving || !activeFolderId}>
        {saving ? '저장 중…' : '📚 저장'}
      </button>
    </div>
  );
}
