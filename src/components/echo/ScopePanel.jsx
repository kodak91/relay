import { useState } from 'react';
import useAppStore from '../../store/appStore';
import EchoPanel from './EchoPanel';
import PRPanel from './PRPanel';

// Relay Scope — 조직 분석 영역 (lead 전용 진입). 하위탭: Capsule(역할 재현) / PR(분기 성과 평가).
// Capsule/PR 은 공통 데이터 레이어(같은 워크스페이스의 채팅·태스크·티켓·회의)를 공유.
export default function ScopePanel() {
  const { activeProject, user, setActiveChannel } = useAppStore();
  const isLead = user?.role === 'lead';
  const [tab, setTab] = useState('capsule'); // 'capsule' | 'pr'

  if (!activeProject) {
    return (
      <main className="col-main scope-panel" style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <div style={{ color: 'var(--ink-mute)', fontSize: 14 }}>워크스페이스를 먼저 선택하세요.</div>
      </main>
    );
  }

  return (
    <main className="col-main scope-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn ghost sm" onClick={() => setActiveChannel('chat')} title="채팅으로">←</button>
        <span style={{ fontSize: 18 }}>🔭</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <strong style={{ fontSize: 15 }}>Relay Scope</strong>
          <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>조직원 캡처 · 성과 평가</span>
        </div>
        {/* 하위탭 */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className={'btn sm' + (tab === 'capsule' ? ' accent' : ' ghost')} onClick={() => setTab('capsule')}>🧬 Capsule</button>
          {isLead && <button className={'btn sm' + (tab === 'pr' ? ' accent' : ' ghost')} onClick={() => setTab('pr')}>📊 PR</button>}
        </div>
      </div>

      {tab === 'capsule' ? <EchoPanel /> : (isLead ? <PRPanel /> : <EchoPanel />)}
    </main>
  );
}
