import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Echo Phase 3 — 캡슐 가동 (에이전트 + 인수인계 문서 + 신뢰도 피드백)
// 팀장 전용. side-effect 없음(제안/초안만). 호출부(EchoPanel)에서 isLead 로 게이팅.
export default function EchoAgent({ projectId, member, capsule, runAgent }) {
  const [mode, setMode] = useState('agent');        // 'agent' | 'handover'
  const [task, setTask] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);        // { response, rulesUsed, logId, mode }

  // 피드백 상태
  const [rating, setRating] = useState(null);        // 'up' | 'down' | null
  const [wrongRule, setWrongRule] = useState('');
  const [comment, setComment] = useState('');
  const [fbSaved, setFbSaved] = useState(false);

  // 멤버/모드 전환 시 초기화
  useEffect(() => { setResult(null); setError(''); setRating(null); setFbSaved(false); }, [member?.uid, mode]);

  const run = async () => {
    setLoading(true); setError(''); setResult(null); setRating(null); setFbSaved(false);
    try {
      const r = await runAgent({ memberId: member.uid, memberName: member.name, mode, task });
      setResult({ response: r.response, rulesUsed: r.rulesUsed || [], logId: r.logId, mode: r.mode });
    } catch (e) {
      setError(e.message || '실행 실패');
    } finally {
      setLoading(false);
    }
  };

  const logRef = () => doc(db, 'projects', projectId, 'echoCapsules', member.uid, 'agentLogs', result.logId);

  const thumbUp = async () => {
    setRating('up');
    if (result?.logId) await updateDoc(logRef(), { rating: 'up' });
  };

  const thumbDown = () => setRating('down');   // 어떤 규칙이 틀렸는지 입력받기

  // 👎 확정 — 로그에 rating 기록 + reviewFlags 에 재검토 플래그 생성(다음 캡처가 소비)
  const submitDownFeedback = async () => {
    if (!result?.logId) return;
    const rule = wrongRule.trim() || '(규칙 미지정)';
    await updateDoc(logRef(), { rating: 'down', wrongRule: rule, feedbackComment: comment.trim() });
    await addDoc(collection(db, 'projects', projectId, 'echoCapsules', member.uid, 'reviewFlags'), {
      rule,
      comment: comment.trim(),
      sourceLogId: result.logId,
      resolved: false,
      createdAt: serverTimestamp(),
    });
    setFbSaved(true);
  };

  const downloadHandover = () => {
    if (result?.mode !== 'handover' || !result.response) return;
    const blob = new Blob([result.response], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (member.name || member.uid).replace(/[^\w가-힣]+/g, '_');
    a.download = `인수인계_${safe}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasCapsule = !!capsule?.capsuleMarkdown;

  return (
    <div>
      {/* 모드 전환 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button className={'btn sm' + (mode === 'agent' ? ' accent' : ' ghost')} onClick={() => setMode('agent')}>🤖 스타일 작업 지시</button>
        <button className={'btn sm' + (mode === 'handover' ? ' accent' : ' ghost')} onClick={() => setMode('handover')}>📄 인수인계 문서</button>
      </div>

      {!hasCapsule && (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-mute)' }}>
          이 멤버의 캡슐이 아직 없어요. "캡슐" 탭에서 먼저 캡처하세요.
        </div>
      )}

      {hasCapsule && mode === 'agent' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 6 }}>
            {member.name}의 의사결정 규칙·거래처 지식에 근거해 응답합니다. <b>실행은 하지 않고 초안/제안만</b> 만들어요.
          </div>
          <textarea
            className="edit-ta"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 72 }}
            placeholder={`예: ${member.name} 스타일로 이 인쇄 견적 3개 비교해줘`}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn accent sm" onClick={run} disabled={loading || !task.trim()}>
              {loading ? '생성 중…' : '▶ 실행 (Ctrl+Enter)'}
            </button>
          </div>
        </>
      )}

      {hasCapsule && mode === 'handover' && (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 8 }}>
            캡슐을 신규 입사자용 인수인계 문서로 재구성합니다.
          </div>
          <button className="btn accent sm" onClick={run} disabled={loading}>
            {loading ? '생성 중…' : '📄 인수인계 문서 생성'}
          </button>
        </>
      )}

      {error && (
        <div style={{ padding: '10px 14px', marginTop: 14, borderRadius: 'var(--r-2)', background: 'oklch(0.95 0.05 25)', color: 'oklch(0.45 0.18 25)', fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', background: 'var(--surface-2)' }}>
            <div className="md-content" style={{ fontSize: 14, lineHeight: 1.7 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.response}</ReactMarkdown>
            </div>
          </div>

          {/* 근거(사용 규칙) */}
          {result.rulesUsed?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-mute)', marginRight: 6 }}>📌 사용한 규칙:</span>
              {result.rulesUsed.map((r, i) => (
                <span key={i} style={{ display: 'inline-block', fontSize: 11, padding: '2px 8px', margin: '2px 4px 2px 0', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)' }}>{r}</span>
              ))}
            </div>
          )}

          {result.mode === 'handover' && (
            <button className="btn minor sm" style={{ marginTop: 10 }} onClick={downloadHandover}>↓ MD 다운로드</button>
          )}

          {/* 신뢰도 피드백 (에이전트 모드) */}
          {result.mode === 'agent' && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              {fbSaved ? (
                <div style={{ fontSize: 13, color: 'var(--accent)' }}>
                  👎 피드백 저장됨 — 다음 캡처 때 해당 규칙이 "⚠️ 규칙 재검토 필요"로 표시됩니다.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--ink-3)' }}>이 응답이 그 사람 판단에 부합하나요?</span>
                    <button className={'btn sm' + (rating === 'up' ? ' accent' : ' ghost')} onClick={thumbUp}>👍</button>
                    <button className={'btn sm' + (rating === 'down' ? ' accent' : ' ghost')} onClick={thumbDown}>👎</button>
                    {rating === 'up' && <span style={{ fontSize: 12, color: 'var(--emerald, oklch(0.55 0.14 145))' }}>고마워요!</span>}
                  </div>

                  {rating === 'down' && (
                    <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-2)' }}>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>어떤 규칙이 틀렸나요?</div>
                      {result.rulesUsed?.length > 0 ? (
                        <select
                          value={wrongRule}
                          onChange={(e) => setWrongRule(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', marginBottom: 8, borderRadius: 'var(--r-2)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                        >
                          <option value="">규칙 선택…</option>
                          {result.rulesUsed.map((r, i) => <option key={i} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <input
                          value={wrongRule}
                          onChange={(e) => setWrongRule(e.target.value)}
                          placeholder="틀린 규칙/판단을 적어주세요"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', marginBottom: 8, borderRadius: 'var(--r-2)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                        />
                      )}
                      <textarea
                        className="edit-ta"
                        style={{ width: '100%', boxSizing: 'border-box', minHeight: 48 }}
                        placeholder="무엇이 어떻게 달라야 하는지 (선택)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <button className="btn accent sm" onClick={submitDownFeedback}>재검토 플래그 저장</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
