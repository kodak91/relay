import { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useAppStore from '../../store/appStore';
import { useProjects } from '../../hooks/useProjects';
import { useEcho } from '../../hooks/useEcho';
import EchoQuestions from './EchoQuestions';
import EchoAgent from './EchoAgent';

// Relay Scope > Capsule 탭 (구 Echo) — 역할 캡슐 열람/캡처/에이전트.
// ScopePanel 안에 임베드되어 렌더됨(자체 헤더/뒤로가기 없음). 팀장 전용 진입은 ScopePanel/사이드바에서 제어.
export default function EchoPanel() {
  const { activeProject, user } = useAppStore();
  const { projects } = useProjects(user?.uid);
  const currentProject = useMemo(
    () => projects.find((p) => p.id === activeProject) || null,
    [projects, activeProject]
  );

  const { isLead, runCapture, runAgent, getCapsule, setEchoEnabled } = useEcho(activeProject);

  const echoEnabled = currentProject?.echoEnabled === true; // opt-in: 명시적으로 켠 워크스페이스만
  const allMembers = (currentProject?.members || []).filter((m) => m.uid);
  const members = isLead ? allMembers : allMembers.filter((m) => m.uid === user?.uid);

  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('capsule'); // 'capsule' | 'agent' (agent = lead 전용)
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!selectedId && members.length > 0) setSelectedId(members[0].uid);
  }, [members, selectedId]);

  useEffect(() => { setNotice(''); setError(''); setViewMode('capsule'); }, [selectedId]);

  const selectedMember = members.find((m) => m.uid === selectedId) || null;
  const capsule = selectedId ? getCapsule(selectedId) : null;

  const handleCapture = async () => {
    if (!selectedMember) return;
    setRunning(true); setError(''); setNotice('');
    try {
      const result = await runCapture(selectedMember);
      if (result?.skipped) setNotice('신규 메시지가 없어 업데이트를 건너뛰었습니다.');
      else if (result?.mode === 'merge') {
        const s = result.stats || {};
        setNotice(`업데이트 완료 — 신규 메시지 ${s.newMessages ?? 0}건, 반영된 답변 ${s.mergedAnswers ?? 0}건.`);
      } else setNotice('캡슐을 생성했습니다.');
    } catch (e) {
      setError(e.message || 'Echo 실행 중 오류가 발생했습니다.');
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = () => {
    if (!capsule?.capsuleMarkdown) return;
    const blob = new Blob([capsule.capsuleMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (selectedMember?.name || selectedId || 'capsule').replace(/[^\w가-힣]+/g, '_');
    a.download = `capsule_${safeName}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {/* 멤버 목록 */}
      <aside style={{ width: 220, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-mute)', fontWeight: 700 }}>{isLead ? `멤버 (${members.length})` : '내 캡슐'}</span>
          {isLead && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-3)', cursor: 'pointer' }}
              title="켠 워크스페이스만 캡처·3일 자동 수집 대상 (기본 꺼짐)">
              <input type="checkbox" checked={echoEnabled} onChange={(e) => setEchoEnabled(e.target.checked)} />
              {echoEnabled ? '켜짐' : '꺼짐'}
            </label>
          )}
        </div>
        {members.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--ink-mute)' }}>멤버가 없습니다.</div>}
        {members.map((m) => {
          const cap = getCapsule(m.uid);
          return (
            <button key={m.uid} onClick={() => setSelectedId(m.uid)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 'var(--r-2)', border: 'none', cursor: 'pointer', background: selectedId === m.uid ? 'var(--accent-soft)' : 'transparent', color: 'var(--ink)', marginBottom: 2 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}{m.role === 'lead' && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4 }}>팀장</span>}
              </span>
              {cap ? <span style={{ fontSize: 9, color: 'var(--emerald, oklch(0.55 0.14 145))' }} title="캡슐 생성됨">●</span>
                : <span style={{ fontSize: 9, color: 'var(--ink-mute)' }} title="미생성">○</span>}
            </button>
          );
        })}
      </aside>

      {/* 캡슐 본문 */}
      <section style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', minWidth: 0 }}>
        {!selectedMember ? (
          <div style={{ color: 'var(--ink-mute)', fontSize: 14 }}>멤버를 선택하세요.</div>
        ) : (
          <>
            {isLead && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                <button className={'btn sm' + (viewMode === 'capsule' ? ' accent' : ' ghost')} onClick={() => setViewMode('capsule')}>🧬 캡슐</button>
                <button className={'btn sm' + (viewMode === 'agent' ? ' accent' : ' ghost')} onClick={() => setViewMode('agent')}>⚡ 에이전트 / 인수인계</button>
              </div>
            )}

            {viewMode === 'capsule' && (<>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{selectedMember.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
                    {capsule?.lastUpdated ? `마지막 캡처: ${new Date(capsule.lastUpdated).toLocaleString('ko-KR')}` : '아직 캡슐이 없습니다.'}
                  </div>
                </div>
                {isLead && (
                  <button className="btn accent sm" onClick={handleCapture} disabled={running || !echoEnabled}
                    title={!echoEnabled ? '이 워크스페이스의 Echo를 먼저 켜세요 (좌측 체크박스).' : ''}>
                    {running ? '캡처 중…' : capsule ? '🔄 업데이트' : '⚡ 지금 캡처'}
                  </button>
                )}
                <button className="btn minor sm" onClick={handleDownload} disabled={!capsule?.capsuleMarkdown}>↓ MD 다운로드</button>
              </div>

              {capsule?.reproducibility != null && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--ink-3)' }}>재현 가능도</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{capsule.reproducibility}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${capsule.reproducibility}%`, background: 'var(--accent)', transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>나머지 {100 - capsule.reproducibility}%는 인수인계 시 직접 확인이 필요합니다.</div>
                </div>
              )}

              {notice && <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--r-2)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 13 }}>{notice}</div>}
              {error && <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--r-2)', background: 'oklch(0.95 0.05 25)', color: 'oklch(0.45 0.18 25)', fontSize: 13 }}>⚠ {error}</div>}

              {capsule?.capsuleMarkdown ? (
                <div className="md-content echo-capsule" style={{ fontSize: 14, lineHeight: 1.7 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{capsule.capsuleMarkdown}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mute)', fontSize: 14 }}>
                  {isLead ? '아직 캡슐이 없습니다. "지금 캡처"를 눌러 이 멤버의 역할 캡슐을 생성하세요.' : '아직 캡슐이 생성되지 않았습니다. 팀장이 캡처하면 여기에 표시됩니다.'}
                </div>
              )}

              {selectedMember.uid === user?.uid && <EchoQuestions projectId={activeProject} memberId={selectedMember.uid} />}
            </>)}

            {viewMode === 'agent' && isLead && (
              <EchoAgent projectId={activeProject} member={selectedMember} capsule={capsule} runAgent={runAgent} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
