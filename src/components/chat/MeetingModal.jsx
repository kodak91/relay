import { useState, useRef, useEffect } from 'react';
import { claudeComplete } from '../../lib/claude';
import { useMeetings } from '../../hooks/useMeetings';
import { serverTimestamp } from 'firebase/firestore';

function fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function Avatar({ name, size = 30 }) {
  const colors = ['oklch(0.55 0.18 250)', 'oklch(0.52 0.18 140)', 'oklch(0.52 0.18 30)', 'oklch(0.48 0.18 310)', 'oklch(0.50 0.16 200)'];
  const idx = (name || '').charCodeAt(0) % colors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: colors[idx],
      color: '#fff', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {(name || '?').slice(0, 2)}
    </div>
  );
}

function extractLive(lines) {
  const items = [];
  const decisionWords = ['확정', '결정', '하기로', '것으로', '정했', '선택', '채택'];
  const actionWords = ['담당', '맡아', '할게', '하겠', '진행할', '처리할', '발주', '연락'];
  const riskWords = ['리스크', '우려', '빠듯', '문제', '어려울', '걱정', '위험', '지연'];
  lines.forEach((l) => {
    const txt = l.text;
    if (decisionWords.some((w) => txt.includes(w)))
      items.push({ k: '결정', v: txt.length > 40 ? txt.slice(0, 40) + '…' : txt });
    else if (actionWords.some((w) => txt.includes(w)))
      items.push({ k: '액션', v: txt.length > 40 ? txt.slice(0, 40) + '…' : txt });
    else if (riskWords.some((w) => txt.includes(w)))
      items.push({ k: '리스크', v: txt.length > 40 ? txt.slice(0, 40) + '…' : txt });
  });
  return items;
}

// ─── Live phase ──────────────────────────────────────────────────────────────

function LivePhase({ transcript, inputText, setInputText, activeSpeaker, setActiveSpeaker, members, agenda, elapsed, tsScrollRef, onAddLine, onEnd, generating, presence }) {
  const extracted = extractLive(transcript);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddLine(); }
  };

  return (
    <div className="m-body recording">
      <aside className="m-left">
        {agenda.length > 0 && (
          <div className="m-section compact">
            <h4>안건</h4>
            <ul className="m-agenda-prog">
              {agenda.map((a, i) => (
                <li key={i} data-st="pending"><span className="dt" /><span>{a}</span></li>
              ))}
            </ul>
          </div>
        )}
        <div className="m-section compact">
          <h4>참석자</h4>
          <div className="m-att-list">
            {members.map((m) => {
              const online = !!(presence && presence[m.uid]);
              return (
                <div key={m.uid} className={'m-att' + (m.uid === activeSpeaker ? ' speaking' : '')}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar name={m.name} size={26} />
                    {online && (
                      <span style={{
                        position: 'absolute', bottom: 0, right: 0,
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'oklch(0.55 0.22 145)',
                        border: '1.5px solid var(--surface)',
                      }} />
                    )}
                  </div>
                  <span className="nm" style={{ opacity: online ? 1 : 0.5 }}>{m.name}</span>
                  {m.uid === activeSpeaker && <span className="m-active-dot" />}
                </div>
              );
            })}
          </div>
        </div>
        <div className="m-section compact">
          <h4>AI 실시간 추출</h4>
          <div className="m-ai-live">
            {extracted.length === 0 ? (
              <div className="m-ai-empty">대화에서 결정·액션·리스크를 추출하는 중…</div>
            ) : (
              <div className="m-extract-list">
                {extracted.slice(-6).map((it, i) => (
                  <div key={i} className={`m-ex m-ex-${it.k === '결정' ? 'dec' : it.k === '액션' ? 'act' : 'risk'}`}>
                    <span className="ex-k">{it.k}</span>
                    <span className="ex-v">{it.v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="m-main">
        <div className="m-transcript" ref={tsScrollRef}>
          <div className="m-trans-hd">
            <span className="badge">실시간 텍스트</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{transcript.length}개 발화</span>
          </div>
          {transcript.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 30, marginBottom: 12 }}>💬</div>
              <p style={{ fontSize: 13 }}>발언자를 선택하고 내용을 입력하세요</p>
            </div>
          )}
          {transcript.map((l, i) => (
            <div className="t-line" key={i}>
              <Avatar name={l.name} size={30} />
              <div>
                <div className="t-h">
                  <span className="nm">{l.name}</span>
                  <span className="mono ts">{l.ts}</span>
                </div>
                <div className="t-tx">{l.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="m-input-row">
          <select className="m-speaker-select" value={activeSpeaker} onChange={(e) => setActiveSpeaker(e.target.value)}>
            {members.map((m) => <option key={m.uid} value={m.uid}>{m.name}</option>)}
          </select>
          <textarea
            className="m-input-ta"
            placeholder="발언 내용 입력 후 Enter…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button className="btn sm accent" onClick={onAddLine} disabled={!inputText.trim()}>추가</button>
        </div>
        <div className="m-foot">
          <span className="m-foot-hint">
            {transcript.length > 0 ? `발화 ${transcript.length}건 기록됨` : '회의를 종료하면 AI가 회의록을 생성합니다'}
          </span>
          <button
            className="btn"
            style={{ background: 'var(--rose)', borderColor: 'var(--rose)', color: 'white' }}
            onClick={onEnd}
            disabled={generating}
          >
            {generating ? '회의록 생성 중…' : '■ 회의 종료'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review phase ────────────────────────────────────────────────────────────

function ReviewPhase({ meetingTitle, participants, transcript, minutes, generating, elapsed, onPost, onClose }) {
  const [copied, setCopied] = useState(false);

  const buildText = () => {
    if (!minutes) return '';
    const lines = [`## 회의록 — ${meetingTitle}`, `진행 시간: ${fmtTime(elapsed)} · 참석 ${participants.length}명\n`];
    if (minutes.summary) lines.push(`### 요약\n${minutes.summary}\n`);
    if (minutes.decisions?.length) {
      lines.push('### 핵심 결정');
      minutes.decisions.forEach((d, i) => lines.push(`${i + 1}. **${d.text}**${d.detail ? ` — ${d.detail}` : ''}`));
      lines.push('');
    }
    if (minutes.actions?.length) {
      lines.push('### 액션 아이템');
      minutes.actions.forEach((a) => lines.push(`- [ ] ${a.text}${a.assigneeName ? ` (${a.assigneeName})` : ''}${a.due ? ` · ${a.due}` : ''}`));
      lines.push('');
    }
    if (minutes.risks?.length) {
      lines.push('### 리스크');
      minutes.risks.forEach((r) => lines.push(`- ⚠ ${r.text}${r.detail ? ` — ${r.detail}` : ''}`));
    }
    return lines.join('\n');
  };

  const copyMinutes = async () => {
    try { await navigator.clipboard.writeText(buildText()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <div className="m-body review">
      <div className="m-review-hd">
        <div>
          <div className="badge">자동 생성 회의록</div>
          <h3 style={{ margin: '6px 0 4px', fontSize: 16, fontWeight: 700 }}>{meetingTitle}</h3>
          <div className="m-meta mono">
            {fmtTime(elapsed)} · 참석 {participants.length}명 ·
            <span style={{ color: 'var(--accent)', marginLeft: 6 }}>Relay AI 요약</span>
          </div>
        </div>
        <div className="m-people-stack">
          {participants.slice(0, 5).map((p) => <Avatar key={p.uid} name={p.name} size={30} />)}
        </div>
      </div>

      {generating ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--ink-3)' }}>
          <span className="ai-typing"><span /><span /><span /></span>
          <p style={{ fontSize: 13 }}>AI가 회의록을 작성하고 있습니다…</p>
        </div>
      ) : (
        <div className="m-review-grid">
          {minutes?.summary && (
            <section className="rv-section rv-full">
              <h4>📝 요약</h4>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>{minutes.summary}</p>
            </section>
          )}
          {minutes?.decisions?.length > 0 && (
            <section className="rv-section">
              <h4>📌 핵심 결정 · {minutes.decisions.length}건</h4>
              <ol className="rv-list">
                {minutes.decisions.map((d, i) => (
                  <li key={i}><b>{d.text}</b>{d.detail && <span className="rv-sub">{d.detail}</span>}</li>
                ))}
              </ol>
            </section>
          )}
          {minutes?.actions?.length > 0 && (
            <section className="rv-section">
              <h4>✅ 액션 아이템 · {minutes.actions.length}건</h4>
              <div className="rv-actions">
                {minutes.actions.map((a, i) => (
                  <div key={i} className="rv-action open">
                    <Avatar name={a.assigneeName || '?'} size={26} />
                    <div className="rv-a-t">{a.text}</div>
                    {a.assigneeName && <div className="rv-a-w mono">{a.assigneeName}</div>}
                    {a.due && <div className="rv-a-d mono">📅 {a.due}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {minutes?.risks?.length > 0 && (
            <section className="rv-section">
              <h4>⚠ 리스크 · {minutes.risks.length}건</h4>
              {minutes.risks.map((r, i) => (
                <div key={i} className="rv-risk">
                  <b>{r.text}</b>
                  {r.detail && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{r.detail}</p>}
                </div>
              ))}
            </section>
          )}
          {transcript.length > 0 && !minutes?.decisions?.length && !minutes?.actions?.length && (
            <section className="rv-section rv-full">
              <h4>📜 전체 발화 · {transcript.length}건</h4>
              <div className="rv-quotes">
                {transcript.slice(0, 6).map((l, i) => (
                  <div key={i} className="rv-q">
                    <Avatar name={l.name} size={22} />
                    <span className="rv-q-name">{l.name}</span>
                    <span className="rv-q-text">"{l.text}"</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="m-foot">
        <button className="btn minor" onClick={onClose}>나중에</button>
        <button className="btn minor" style={{ marginLeft: 4 }} onClick={copyMinutes}>{copied ? '✓ 복사됨' : '📋 복사'}</button>
        <span className="m-foot-hint" style={{ marginLeft: 'auto', marginRight: 12 }}>
          회의록을 채팅에 게시하면 모든 참석자에게 공유됩니다
        </span>
        <button className="btn accent" onClick={onPost} disabled={generating}>채팅에 게시 →</button>
      </div>
    </div>
  );
}

// ─── Live meeting modal ───────────────────────────────────────────────────────
// Transcript is shared via Firestore (meeting.liveTranscript).
// Presence is tracked per user in meeting.livePresence map.

export function MeetingLiveModal({ open, onClose, meeting, members = [], user, projectId, onPost }) {
  const { updateMeeting, startLiveMeeting, joinLiveMeeting, addLiveLine, removeLivePresence } = useMeetings(projectId);
  const [phase, setPhase] = useState('live');
  const [inputText, setInputText] = useState('');
  const [activeSpeaker, setActiveSpeaker] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [minutes, setMinutes] = useState(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const tsScrollRef = useRef(null);

  const participantUids = meeting?.participants?.map((p) => p.uid) || [];
  const participantMembers = members.filter((m) => participantUids.includes(m.uid));
  const allMembers = participantMembers.length > 0 ? participantMembers : members.filter((m) => m.uid);

  // Shared transcript and presence from Firestore
  const transcript = meeting?.liveTranscript || [];
  const presence = meeting?.livePresence || {};

  // Join or start meeting on open; remove presence on close/unmount
  useEffect(() => {
    if (!open || !meeting?.id || !user?.uid) return;
    setPhase('live');
    setInputText('');
    setActiveSpeaker(user?.uid || allMembers[0]?.uid || '');
    setGenerating(false);
    setMinutes(null);
    setShowEndConfirm(false);

    if (meeting.status !== 'live') {
      startLiveMeeting(meeting.id, user).catch(console.error);
    } else {
      joinLiveMeeting(meeting.id, user).catch(console.error);
    }

    return () => {
      if (meeting?.id && user?.uid) {
        removeLivePresence(meeting.id, user.uid).catch(() => {});
      }
    };
  }, [open, meeting?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer based on shared liveStartedAt
  useEffect(() => {
    if (phase !== 'live') return;
    const getStartMs = () => {
      const sat = meeting?.liveStartedAt;
      if (!sat) return Date.now();
      return sat.toDate ? sat.toDate().getTime() : new Date(sat).getTime();
    };
    const tick = () => setElapsed(Math.floor((Date.now() - getStartMs()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, meeting?.liveStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tsScrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' });
  }, [transcript.length]);

  if (!open) return null;

  const addLine = async () => {
    const txt = inputText.trim();
    if (!txt || !meeting?.id) return;
    const speaker = allMembers.find((m) => m.uid === activeSpeaker) || { name: user?.name || '나', uid: user?.uid || 'me' };
    await addLiveLine(meeting.id, { uid: speaker.uid, name: speaker.name, text: txt, ts: fmtTime(elapsed) });
    setInputText('');
  };

  const endMeeting = async () => {
    setShowEndConfirm(false);
    setGenerating(true);
    setPhase('review');
    try {
      const transcriptText = transcript.map((t) => `[${t.name}] ${t.text}`).join('\n');
      const agendaText = (meeting?.agenda || []).join(', ');
      const prompt = `다음은 팀 회의 내용입니다. 회의록을 JSON 형식으로 작성해주세요.

회의 제목: ${meeting?.title || '회의'}
안건: ${agendaText || '(안건 없음)'}
참석자: ${allMembers.map((m) => m.name).join(', ')}
진행 시간: ${fmtTime(elapsed)}

대화 내용:
${transcriptText || '(기록된 발화 없음)'}

아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "decisions": [{"text": "결정 내용", "detail": "세부사항 또는 빈 문자열"}],
  "actions": [{"text": "액션 내용", "assigneeName": "담당자명 또는 빈 문자열", "due": "기한 또는 빈 문자열"}],
  "risks": [{"text": "리스크 내용", "detail": "세부사항 또는 빈 문자열"}],
  "summary": "전체 회의 요약 2-3문장",
  "highlights": [{"speakerName": "이름", "text": "주요 발언 내용"}]
}`;
      const result = await claudeComplete(prompt, '당신은 팀 회의록 작성 AI입니다. 반드시 JSON만 응답하세요.');
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      setMinutes(parsed);
      if (meeting?.id) {
        await updateMeeting(meeting.id, {
          status: 'done',
          transcript,
          minutes: parsed,
          duration: elapsed,
          endedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error('Meeting minutes error:', e);
      const fallback = {
        decisions: [], actions: [], risks: [],
        summary: '회의록 생성 중 오류가 발생했습니다.',
        highlights: transcript.slice(0, 3).map((t) => ({ speakerName: t.name, text: t.text })),
      };
      setMinutes(fallback);
      if (meeting?.id) {
        await updateMeeting(meeting.id, { status: 'done', transcript, minutes: fallback, duration: elapsed, endedAt: serverTimestamp() });
      }
    } finally {
      setGenerating(false);
    }
  };

  const postToChat = () => {
    onPost?.({
      meetingTitle: meeting?.title || '회의',
      agenda: meeting?.agenda || [],
      participants: allMembers,
      transcript,
      minutes,
      duration: elapsed,
    });
    onClose();
  };

  return (
    <div className="meeting-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="meeting-modal">
        <header className="meeting-head">
          <div className="m-title">
            <div className={`m-rec-dot ${phase}`} />
            <h2>{phase === 'live' ? '회의 진행 중' : '회의록'}</h2>
            {phase === 'live' && <span className="m-sub mono">&nbsp;·&nbsp;{fmtTime(elapsed)}</span>}
            {meeting?.title && <span className="m-sub">&nbsp;·&nbsp;{meeting.title}</span>}
          </div>
          <button className="icon-btn" onClick={onClose} title="닫기">✕</button>
        </header>

        {/* End confirmation overlay */}
        {showEndConfirm && (
          <div className="meeting-end-overlay">
            <div className="meeting-end-dialog">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>회의를 종료하시겠습니까?</div>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 20px' }}>
                종료하면 모든 참석자의 화면이 닫히고 AI가 회의록을 자동 생성합니다.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn ghost" onClick={() => setShowEndConfirm(false)}>취소</button>
                <button
                  className="btn"
                  style={{ background: 'var(--rose)', color: '#fff', borderColor: 'var(--rose)' }}
                  onClick={endMeeting}
                >
                  종료하기
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'live' && (
          <LivePhase
            transcript={transcript}
            inputText={inputText} setInputText={setInputText}
            activeSpeaker={activeSpeaker} setActiveSpeaker={setActiveSpeaker}
            members={allMembers}
            agenda={meeting?.agenda || []}
            elapsed={elapsed}
            tsScrollRef={tsScrollRef}
            onAddLine={addLine}
            onEnd={() => setShowEndConfirm(true)}
            generating={generating}
            presence={presence}
          />
        )}
        {phase === 'review' && (
          <ReviewPhase
            meetingTitle={meeting?.title || '회의'}
            participants={allMembers}
            transcript={transcript}
            minutes={minutes}
            generating={generating}
            elapsed={elapsed}
            onPost={postToChat}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

// ─── Schedule creation modal ──────────────────────────────────────────────────

export default function MeetingScheduleModal({ open, onClose, members = [], initialTitle = '', projectId, user, onPostToChat }) {
  const { addMeeting } = useMeetings(projectId);
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [agenda, setAgenda] = useState(['']);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle || '');
    setScheduledAt('');
    setAgenda(['']);
    setSelected(members.filter((m) => m.uid).map((m) => m.uid));
    setSaving(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const addAgendaItem = () => setAgenda((prev) => [...prev, '']);
  const updateAgenda = (i, v) => setAgenda((prev) => prev.map((a, idx) => idx === i ? v : a));
  const removeAgenda = (i) => setAgenda((prev) => prev.filter((_, idx) => idx !== i));
  const toggleMember = (uid) => setSelected((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const participants = members.filter((m) => selected.includes(m.uid)).map((m) => ({ uid: m.uid, name: m.name }));
      const cleanAgenda = agenda.filter((a) => a.trim());
      await addMeeting({
        title: title.trim(),
        agenda: cleanAgenda,
        scheduledAt: scheduledAt || null,
        participants,
        createdBy: { uid: user?.uid, name: user?.name },
      });
      onPostToChat?.({
        title: title.trim(),
        agenda: cleanAgenda,
        scheduledAt: scheduledAt || null,
        participants,
      });
      onClose();
    } catch (e) {
      console.error('addMeeting error:', e);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)', padding: '7px 10px', fontSize: 13, background: 'var(--surface-2)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', color: 'var(--ink)' };

  return (
    <div className="meeting-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="meeting-modal" style={{ maxWidth: 520 }}>
        <header className="meeting-head">
          <div className="m-title">
            <span style={{ fontSize: 16 }}>📅</span>
            <h2>회의 예약</h2>
          </div>
          <button className="icon-btn" onClick={onClose} title="닫기">✕</button>
        </header>

        <div className="m-body m-schedule-body">
          <div className="m-section">
            <h4>회의 제목 *</h4>
            <input
              style={inputStyle}
              placeholder="회의 제목을 입력하세요…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="m-section">
            <h4>일시</h4>
            <input
              type="datetime-local"
              style={inputStyle}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="m-section">
            <h4>안건</h4>
            <ul className="m-agenda">
              {agenda.map((a, i) => (
                <li key={i} className="m-agenda-item">
                  <span className="m-agenda-num">{i + 1}.</span>
                  <input
                    className="m-agenda-input"
                    placeholder={`안건 ${i + 1}…`}
                    value={a}
                    onChange={(e) => updateAgenda(i, e.target.value)}
                  />
                  {agenda.length > 1 && <button className="m-agenda-rm" onClick={() => removeAgenda(i)}>×</button>}
                </li>
              ))}
              <li><button className="m-agenda-add" onClick={addAgendaItem}>+ 안건 추가</button></li>
            </ul>
          </div>

          <div className="m-section" style={{ borderBottom: 'none' }}>
            <h4>참석자 <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{selected.length}명 선택됨</span></h4>
            <div className="m-people">
              {members.filter((m) => m.uid).map((m) => {
                const on = selected.includes(m.uid);
                return (
                  <button key={m.uid} className={'m-person' + (on ? ' on' : '')} onClick={() => toggleMember(m.uid)}>
                    <Avatar name={m.name} size={32} />
                    <div style={{ textAlign: 'left' }}>
                      <div className="nm">{m.name}</div>
                      <div className="rl">{m.position || m.role || ''}</div>
                    </div>
                    <div className={'m-check' + (on ? ' on' : '')}>✓</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="m-foot">
          <button className="btn minor" onClick={onClose}>취소</button>
          <button className="btn accent" onClick={handleSave} disabled={!title.trim() || saving}>
            {saving ? '저장 중…' : '📅 회의 예약'}
          </button>
        </div>
      </div>
    </div>
  );
}
