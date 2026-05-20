import { useState, useEffect } from 'react';
import { useKB } from '../../hooks/useKB';

export default function KBSaveBanner({ projectId, files, user, onSave, onDismiss }) {
  const { folders, initFolders, saveFromChat } = useKB(projectId);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (folders.length === 0) initFolders();
  }, [folders.length]);

  useEffect(() => {
    if (folders.length > 0 && !selectedFolderId) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders]);

  const activeFolderId = selectedFolderId || folders[0]?.id;

  const handleSave = async () => {
    if (!activeFolderId) return;
    setSaving(true);
    try {
      for (const f of files) {
        await saveFromChat({
          ...f,
          folderId: activeFolderId,
          uploader: user?.name || '',
          uploaderUid: user?.uid || '',
        });
      }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const label = files.length === 1 ? `"${files[0].name}"` : `파일 ${files.length}개`;

  return (
    <div className="kb-savebar">
      <span className="kb-savebar-ico">📚</span>
      <div className="kb-savebar-i">
        <b>{label}을 KB에 저장할까요?</b>
        <div className="kb-savebar-folders">
          {folders.map((f) => (
            <button
              key={f.id}
              className={'kb-folder-chip' + (activeFolderId === f.id ? ' on' : '')}
              style={activeFolderId === f.id ? { background: f.color, color: '#fff', borderColor: f.color } : {}}
              onClick={() => setSelectedFolderId(f.id)}
            >
              {f.icon} {f.name}
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
