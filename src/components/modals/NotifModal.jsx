import { useState } from 'react';
import useAppStore from '../../store/appStore';
import { useNotifications } from '../../hooks/useNotifications';

// 알림 카테고리 토글 정의
const CATEGORY_TOGGLES = [
  { key: 'general', label: '일반 알림', sub: '태스크 배정·승인/결정 결과' },
  { key: 'featureChat', label: '기능 채팅 알림', sub: '나에게 온 결정·컨펌·투표 요청' },
  { key: 'myThread', label: '내 글 스레드', sub: '내가 쓴 글에 달린 댓글' },
  { key: 'allThread', label: '모든 스레드', sub: '내가 참여한 스레드의 새 댓글' },
];

function fmtWhen(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

export default function NotifModal({ onClose }) {
  const { user } = useAppStore();
  const { unreadItems, unreadCount, prefs, setPref, markRead, markAllRead } = useNotifications(user?.uid);
  const [view, setView] = useState('unread'); // 'unread' | 'settings'
  const [perm, setPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [requesting, setRequesting] = useState(false);

  const handleToggle = async () => {
    if (perm === 'granted') { alert('브라우저 설정에서 이 사이트의 알림 권한을 차단하실 수 있습니다.'); return; }
    if (perm === 'denied') { alert('브라우저 설정에서 이 사이트의 알림 권한을 허용해주세요.'); return; }
    setRequesting(true);
    const result = await Notification.requestPermission();
    setPerm(result);
    setRequesting(false);
  };

  const permLabel = perm === 'granted' ? '허용됨 ✓' : perm === 'denied' ? '차단됨' : '허용하기';
  const permOn = perm === 'granted';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 340 }}>
        <div className="modal-head">
          <h3>알림 관리</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">✕</button>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 6, padding: '0 16px', marginBottom: 4 }}>
          <button className={'btn sm' + (view === 'unread' ? ' accent' : ' ghost')} onClick={() => setView('unread')}>
            읽지 않음{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>
          <button className={'btn sm' + (view === 'settings' ? ' accent' : ' ghost')} onClick={() => setView('settings')}>
            설정
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {view === 'unread' ? (
            <>
              {unreadItems.length === 0 ? (
                <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
                  읽지 않은 알림이 없습니다 ✓
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn minor sm" onClick={markAllRead}>전체 읽음</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                    {unreadItems.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        title="클릭하면 읽음 처리됩니다"
                        style={{
                          textAlign: 'left', padding: '9px 11px', borderRadius: 'var(--r-2)',
                          border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{n.title}</span>
                          <span style={{ fontSize: 10, color: 'var(--ink-mute)', flexShrink: 0 }}>{fmtWhen(n.createdAt)}</span>
                        </div>
                        {n.body && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{n.body}</span>}
                        {n.fromName && <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{n.fromName}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="notif-row">
                <div>
                  <div className="notif-row-label">브라우저 알림</div>
                  <div className="notif-row-sub">앱이 꺼져 있어도 데스크탑 알림</div>
                </div>
                <button className={'notif-toggle' + (permOn ? ' on' : '')} onClick={handleToggle} disabled={requesting}>
                  {permLabel}
                </button>
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', fontWeight: 700 }}>받을 알림 종류</div>

              {CATEGORY_TOGGLES.map((c) => {
                const on = prefs[c.key] !== false;
                return (
                  <div className="notif-row" key={c.key}>
                    <div>
                      <div className="notif-row-label">{c.label}</div>
                      <div className="notif-row-sub">{c.sub}</div>
                    </div>
                    <button
                      className={'notif-toggle' + (on ? ' on' : '')}
                      onClick={() => setPref(c.key, !on)}
                    >
                      {on ? '켜짐' : '꺼짐'}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
