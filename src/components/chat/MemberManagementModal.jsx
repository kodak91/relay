import { useState } from 'react';

export default function MemberManagementModal({ project, user, onClose, onApprove, onReject, onRemove, onDelegate }) {
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [delegateConfirm, setDelegateConfirm] = useState(null);

  const isOwner = user?.uid && project?.ownerId === user.uid;
  const members = project?.members || [];
  const pending = project?.pendingMembers || [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(project?.inviteCode || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  const doAction = async (fn, key) => {
    setActionLoading(key);
    try { await fn(); } finally { setActionLoading(null); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="member-modal" onClick={(e) => e.stopPropagation()}>
        <div className="member-modal-hd">
          <span>멤버 관리</span>
          <button className="member-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="member-invite-section">
          <div className="member-section-label">초대 코드</div>
          <div className="member-invite-row">
            <span className="member-invite-code mono">{project?.inviteCode || '—'}</span>
            <button className="btn ghost sm" onClick={copy}>{copied ? '복사됨 ✓' : '복사'}</button>
          </div>
          <div className="member-invite-hint">이 코드를 공유하면 팀원이 워크스페이스에 참가를 요청할 수 있습니다.</div>
        </div>

        {isOwner && pending.length > 0 && (
          <div className="member-section">
            <div className="member-section-label">승인 대기 ({pending.length})</div>
            {pending.map((m) => (
              <div key={m.uid} className="member-row">
                <div className="member-avatar" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
                  {(m.name || '?')[0].toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">{m.name}</div>
                  <div className="member-role" style={{ color: 'var(--amber)' }}>승인 대기 중</div>
                </div>
                <div className="member-actions">
                  <button
                    className="btn accent sm"
                    disabled={!!actionLoading}
                    onClick={() => doAction(() => onApprove(m.uid), 'approve-' + m.uid)}
                  >
                    승인
                  </button>
                  <button
                    className="btn ghost sm"
                    disabled={!!actionLoading}
                    onClick={() => doAction(() => onReject(m.uid), 'reject-' + m.uid)}
                    style={{ color: 'var(--rose)' }}
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="member-section">
          <div className="member-section-label">멤버 ({members.length})</div>
          {members.length === 0 ? (
            <div className="member-empty">멤버가 없습니다.</div>
          ) : (
            members.map((m) => (
              <div key={m.uid} className="member-row">
                <div className="member-avatar">{(m.name || '?')[0].toUpperCase()}</div>
                <div className="member-info">
                  <div className="member-name">
                    {m.name}
                    {m.uid === user?.uid && <span className="member-you-badge">나</span>}
                  </div>
                  <div className="member-role">{m.role === 'lead' ? '팀장' : '팀원'}</div>
                </div>
                {isOwner && m.uid !== user?.uid && (
                  <div className="member-actions" style={{ gap: 4 }}>
                    {m.role !== 'lead' && onDelegate && (
                      delegateConfirm === m.uid ? (
                        <>
                          <button
                            className="btn accent sm"
                            disabled={!!actionLoading}
                            onClick={() => { doAction(() => onDelegate(m.uid), 'delegate-' + m.uid); setDelegateConfirm(null); }}
                          >확인</button>
                          <button className="btn ghost sm" onClick={() => setDelegateConfirm(null)}>취소</button>
                        </>
                      ) : (
                        <button
                          className="btn ghost sm"
                          disabled={!!actionLoading}
                          onClick={() => setDelegateConfirm(m.uid)}
                          style={{ color: 'var(--accent)', flexShrink: 0 }}
                        >팀장 위임</button>
                      )
                    )}
                    {delegateConfirm !== m.uid && (
                      <button
                        className="btn ghost sm"
                        disabled={!!actionLoading}
                        onClick={() => doAction(() => onRemove(m.uid), 'remove-' + m.uid)}
                        style={{ color: 'var(--rose)', flexShrink: 0 }}
                      >− 제외</button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
