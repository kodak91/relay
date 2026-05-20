import { useState } from 'react';

export default function JoinWorkspaceModal({ user, onClose, joinByCode }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleJoin = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const name = await joinByCode(code.trim(), user);
      setSuccess(`"${name}" 워크스페이스에 참가 요청을 보냈습니다. 관리자 승인을 기다려 주세요.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-4)', padding: 28, width: 360, boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>워크스페이스 참가</h3>

        {success ? (
          <>
            <div style={{ padding: '12px 14px', background: 'var(--emerald-bg)', border: '1px solid var(--emerald-line)', borderRadius: 'var(--r-2)', fontSize: 13, color: 'var(--emerald)', lineHeight: 1.6 }}>
              {success}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn accent" onClick={onClose}>확인</button>
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">초대 코드</label>
              <input
                className="form-input mono"
                placeholder="6자리 초대 코드"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                style={{ letterSpacing: '0.15em', fontSize: 16 }}
              />
            </div>
            {error && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--rose)' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn ghost" onClick={onClose}>취소</button>
              <button className="btn accent" onClick={handleJoin} disabled={code.trim().length < 1 || loading}>
                {loading ? '요청 중…' : '참가 요청'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
