import { useState } from 'react';
import { useProjects } from '../../hooks/useProjects';
import useAppStore from '../../store/appStore';

export default function NewProjectModal({ colors, onClose }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(colors[0]);
  const [loading, setLoading] = useState(false);
  const { addProject } = useProjects();
  const { setActiveProject, setActiveChannel, user } = useAppStore();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await addProject(name.trim(), color, user?.name || '', user?.uid);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-4)', padding: 28, width: 360, boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>새 프로젝트</h3>
        <div className="form-group">
          <label className="form-label">프로젝트 이름</label>
          <input className="form-input" placeholder="예: 신제품 출시" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
        </div>
        <div className="form-group">
          <label className="form-label">컬러</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {colors.map((c) => (
              <div key={c} style={{ width: 28, height: 28, borderRadius: 8, background: c, border: c === color ? '3px solid var(--ink)' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn accent" onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? '생성 중…' : '만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}
