import { useState } from 'react';
import useAppStore from '../../store/appStore';
import { useNotifications } from '../../hooks/useNotifications';

export default function NotifModal({ onClose }) {
  const { user } = useAppStore();
  const { markAllRead } = useNotifications(user?.uid);
  const [perm, setPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [requesting, setRequesting] = useState(false);

  const handleToggle = async () => {
    if (perm === 'granted') {
      // 브라우저 권한은 프로그래밍으로 취소 불가 — 안내만
      alert('브라우저 설정에서 이 사이트의 알림 권한을 차단하실 수 있습니다.');
      return;
    }
    if (perm === 'denied') {
      alert('브라우저 설정에서 이 사이트의 알림 권한을 허용해주세요.');
      return;
    }
    setRequesting(true);
    const result = await Notification.requestPermission();
    setPerm(result);
    setRequesting(false);
  };

  const permLabel = perm === 'granted' ? '허용됨 ✓' : perm === 'denied' ? '차단됨' : '허용하기';
  const permOn = perm === 'granted';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 300 }}>
        <div className="modal-head">
          <h3>알림 관리</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div className="notif-row">
            <div>
              <div className="notif-row-label">브라우저 알림</div>
              <div className="notif-row-sub">새 컨펌·태스크·회의 알림</div>
            </div>
            <button
              className={'notif-toggle' + (permOn ? ' on' : '')}
              onClick={handleToggle}
              disabled={requesting}
            >
              {permLabel}
            </button>
          </div>

          <div className="notif-row">
            <div>
              <div className="notif-row-label">미읽음 알림</div>
              <div className="notif-row-sub">Firestore 알림 기록</div>
            </div>
            <button className="btn minor sm" onClick={async () => { await markAllRead(); onClose(); }}>
              전체 읽음
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
