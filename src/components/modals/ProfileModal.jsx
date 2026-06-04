import { useState, useRef } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import useAppStore from '../../store/appStore';

const POSITIONS = ['대표', '부장', '팀장', '대리', '사원'];
const LEAD_POSITIONS = new Set(['대표', '부장', '팀장']);

function cropToSquare(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 500;
      canvas.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, 500, 500);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.88);
    };
    img.src = url;
  });
}

export default function ProfileModal({ onClose }) {
  const { user, setUser } = useAppStore();
  const [name, setName] = useState(user?.name || '');
  const [position, setPosition] = useState(user?.position || '사원');
  const [preview, setPreview] = useState(user?.photoURL || null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('이미지 파일만 선택 가능합니다.'); return; }
    setError('');
    const blob = await cropToSquare(file);
    setPhotoBlob(blob);
    setPreview(URL.createObjectURL(blob));
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!user?.uid || !name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      let photoURL = user?.photoURL ?? null;
      if (photoBlob) {
        const storageRef = ref(storage, `avatars/${user.uid}.jpg`);
        await uploadBytes(storageRef, photoBlob, { contentType: 'image/jpeg' });
        photoURL = await getDownloadURL(storageRef);
      }
      const role = LEAD_POSITIONS.has(position) ? 'lead' : 'member';
      const updates = { name: name.trim(), position, role };
      if (photoURL !== (user?.photoURL ?? null)) updates.photoURL = photoURL;
      await updateDoc(doc(db, 'users', user.uid), updates);
      setUser({ ...user, ...updates, photoURL: photoURL ?? user?.photoURL ?? null });
      onClose();
    } catch (e) {
      console.error('Profile save:', e);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 380 }}>
        <div className="modal-head">
          <h3>프로필 설정</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">✕</button>
        </div>

        <div className="modal-body">
          {/* 프로필 사진 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <div
              className="profile-avatar-wrap"
              onClick={() => fileRef.current?.click()}
              title="클릭하여 사진 변경"
            >
              {preview ? (
                <img src={preview} alt="프로필" className="profile-avatar-img" />
              ) : (
                <span className="profile-avatar-initial">
                  {(name || user?.name || '?')[0]}
                </span>
              )}
              <div className="profile-avatar-overlay">변경</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
            <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>500×500 자동 조정 · JPG/PNG</span>
          </div>

          <div className="modal-field">
            <label>이름 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름을 입력하세요" autoFocus />
          </div>

          <div className="modal-field">
            <label>직급</label>
            <select value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div className="modal-field">
            <label>이메일</label>
            <input value={user?.email || '—'} readOnly style={{ opacity: 0.5 }} />
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--rose)', marginTop: 4 }}>{error}</p>}
        </div>

        <div className="modal-foot">
          <button className="btn minor" onClick={onClose}>취소</button>
          <button className="btn accent" onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
