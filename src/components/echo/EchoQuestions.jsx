import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Echo Phase 2 — 미캡처 보완 질문 루프
// echoCapsules/{memberId}/questions 를 구독해, 본인에게만 미답변 질문을 노출.
// 팀원이 답변 입력 → 저장(answered:true). 다음 캡처 시 echo-capture 가 머지하고 merged 처리.
//
// ⚠️ 본인(memberId === user.uid)에게만 렌더되도록 호출부(EchoPanel)에서 제어함.
export default function EchoQuestions({ projectId, memberId }) {
  const [questions, setQuestions] = useState([]);
  const [drafts, setDrafts] = useState({});   // { [questionId]: 입력중 텍스트 }
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (!projectId || !memberId) return;
    const col = collection(db, 'projects', projectId, 'echoCapsules', memberId, 'questions');
    return onSnapshot(col, (snap) => {
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [projectId, memberId]);

  const pending = questions.filter((q) => !q.answered);
  const answered = questions.filter((q) => q.answered);

  const saveAnswer = async (q) => {
    const text = (drafts[q.id] || '').trim();
    if (!text) return;
    setSavingId(q.id);
    try {
      await updateDoc(doc(db, 'projects', projectId, 'echoCapsules', memberId, 'questions', q.id), {
        answer: text,
        answered: true,
        merged: false,            // 다음 캡처에서 머지 대상
        answeredAt: serverTimestamp(),
      });
      setDrafts((d) => ({ ...d, [q.id]: '' }));
    } finally {
      setSavingId(null);
    }
  };

  if (questions.length === 0) return null;

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🕳️ 미캡처 보완 질문</div>
      <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 12 }}>
        아래는 캡슐에서 아직 비어 있는 부분이에요. 답하면 다음 캡처 때 내 역할 캡슐에 반영됩니다.
      </div>

      {pending.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--emerald, oklch(0.55 0.14 145))', marginBottom: 8 }}>
          ✓ 답변하지 않은 질문이 없습니다.
        </div>
      )}

      {pending.map((q) => (
        <div key={q.id} style={{ marginBottom: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-2)', background: 'var(--surface-2)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{q.question}</div>
          <textarea
            className="edit-ta"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 56 }}
            placeholder="답변을 입력하세요…"
            value={drafts[q.id] || ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveAnswer(q); }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn accent sm" onClick={() => saveAnswer(q)} disabled={savingId === q.id || !(drafts[q.id] || '').trim()}>
              {savingId === q.id ? '저장 중…' : '답변 저장'}
            </button>
          </div>
        </div>
      ))}

      {answered.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: 'var(--ink-mute)', cursor: 'pointer' }}>
            답변 완료 {answered.length}건 {answered.some((q) => !q.merged) ? '(다음 캡처에 반영 예정)' : ''}
          </summary>
          <div style={{ marginTop: 8 }}>
            {answered.map((q) => (
              <div key={q.id} style={{ marginBottom: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{q.question}</div>
                <div style={{ color: 'var(--ink-3)' }}>↳ {q.answer} {q.merged ? '· 반영됨 ✓' : '· 대기'}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
