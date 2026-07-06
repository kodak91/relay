import { useState, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useAppStore from '../../store/appStore';
import { useProjects } from '../../hooks/useProjects';
import { usePR, useEvaluations } from '../../hooks/usePR';

const CRITERIA = [
  { key: '완수도', label: '업무 완수도', weight: 30 },
  { key: '품질', label: '업무 품질', weight: 25 },
  { key: '속도', label: '업무 속도', weight: 20 },
  { key: '커뮤니케이션', label: '커뮤니케이션', weight: 15 },
  { key: '주도성', label: '주도성·태도', weight: 10 },
];

// year/quarter → { quarterId, start(ISO), end(ISO) }
function quarterPeriod(year, q) {
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01T00:00:00.000Z`;
  const end = new Date(Date.UTC(year, endMonth, 0, 23, 59, 59, 999)).toISOString();
  return { quarterId: `${year}Q${q}`, start, end };
}

// Relay Scope > PR 탭 (분기 성과 평가) — 팀장/대표 전용. ScopePanel 안에 임베드.
export default function PRPanel() {
  const { activeProject, user } = useAppStore();
  const { projects } = useProjects(user?.uid);
  const currentProject = useMemo(() => projects.find((p) => p.id === activeProject) || null, [projects, activeProject]);
  const { runEvaluation } = usePR(activeProject);

  const members = (currentProject?.members || []).filter((m) => m.uid);

  const now = new Date();
  const [selectedId, setSelectedId] = useState(null);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getUTCMonth() / 3) + 1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedId && members.length > 0) setSelectedId(members[0].uid);
  }, [members, selectedId]);
  useEffect(() => { setError(''); }, [selectedId, year, quarter]);

  const selectedMember = members.find((m) => m.uid === selectedId) || null;
  const evaluations = useEvaluations(activeProject, selectedId);
  const { quarterId, start, end } = quarterPeriod(year, quarter);
  const evalDoc = evaluations.find((e) => e.id === quarterId) || null;

  const handleRun = async () => {
    if (!selectedMember) return;
    setRunning(true); setError('');
    try {
      const r = await runEvaluation({
        memberId: selectedMember.uid, memberName: selectedMember.name, role: selectedMember.role || 'member',
        quarterId, periodStart: start, periodEnd: end,
      });
      if (r?.empty) setError(r.error || '해당 분기 데이터가 없습니다.');
      // 결과는 useEvaluations 구독으로 자동 표시
    } catch (e) {
      setError(e.message || '평가 실행 실패');
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = () => {
    if (!evalDoc?.reportMarkdown) return;
    const blob = new Blob([evalDoc.reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (selectedMember?.name || selectedId).replace(/[^\w가-힣]+/g, '_');
    a.download = `PR_${safe}_${quarterId}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const years = [now.getUTCFullYear(), now.getUTCFullYear() - 1, now.getUTCFullYear() - 2];

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {/* 멤버 목록 */}
      <aside style={{ width: 220, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 8, flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-mute)', padding: '4px 8px', fontWeight: 700 }}>멤버 ({members.length})</div>
        {members.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--ink-mute)' }}>멤버가 없습니다.</div>}
        {members.map((m) => (
          <button key={m.uid} onClick={() => setSelectedId(m.uid)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 'var(--r-2)', border: 'none', cursor: 'pointer', background: selectedId === m.uid ? 'var(--accent-soft)' : 'transparent', color: 'var(--ink)', marginBottom: 2 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.name}{m.role === 'lead' && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4 }}>팀장</span>}
            </span>
          </button>
        ))}
      </aside>

      {/* 평가 본문 */}
      <section style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', minWidth: 0 }}>
        {!selectedMember ? (
          <div style={{ color: 'var(--ink-mute)', fontSize: 14 }}>멤버를 선택하세요.</div>
        ) : (
          <>
            {/* 분기 선택 + 실행 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{selectedMember.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>분기 성과 평가 · 보상/면담 근거</div>
              </div>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                style={{ padding: '6px 8px', borderRadius: 'var(--r-2)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {years.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}
                style={{ padding: '6px 8px', borderRadius: 'var(--r-2)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
              </select>
              <button className="btn accent sm" onClick={handleRun} disabled={running}>
                {running ? '평가 중…' : evalDoc ? '🔄 재평가' : '▶ 평가 실행'}
              </button>
              <button className="btn minor sm" onClick={handleDownload} disabled={!evalDoc?.reportMarkdown}>↓ MD</button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 14 }}>
              대상 분기: {quarterId} ({start.slice(0, 10)} ~ {end.slice(0, 10)})
            </div>

            {error && <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--r-2)', background: 'oklch(0.95 0.05 25)', color: 'oklch(0.45 0.18 25)', fontSize: 13 }}>⚠ {error}</div>}

            {evalDoc ? (
              <>
                {/* 종합 점수 + 항목별 바 */}
                <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', minWidth: 110 }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>종합</div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1 }}>{evalDoc.totalScore ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>/ 100</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    {CRITERIA.map((c) => {
                      const v = evalDoc.scores?.[c.key];
                      return (
                        <div key={c.key} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                            <span style={{ color: 'var(--ink-3)' }}>{c.label} <span style={{ color: 'var(--ink-mute)' }}>{c.weight}%</span></span>
                            <span style={{ fontWeight: 700 }}>{v != null ? `${v}점` : '—'}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${v || 0}%`, background: 'var(--accent)' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 12 }}>
                  데이터 출처: 채팅 {evalDoc.evidence?.chat ?? 0}건 / 태스크 {evalDoc.evidence?.tasks ?? 0}건 / 티켓 {evalDoc.evidence?.tickets ?? 0}건 / 회의 {evalDoc.evidence?.meetings ?? 0}회
                  {evalDoc.createdAt && ` · 평가일 ${new Date(evalDoc.createdAt).toLocaleString('ko-KR')}`}
                </div>

                {/* 리포트 MD */}
                <div className="md-content" style={{ fontSize: 14, lineHeight: 1.7 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{evalDoc.reportMarkdown || ''}</ReactMarkdown>
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mute)', fontSize: 14 }}>
                {quarterId} 평가가 아직 없습니다. "평가 실행"을 눌러 생성하세요.
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
