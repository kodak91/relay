import { useState } from 'react';
import { useMeetings } from '../../hooks/useMeetings';
import MeetingScheduleModal, { MeetingLiveModal, Avatar } from '../chat/MeetingModal';

function fmtScheduledAt(ts) {
  if (!ts) return '일시 미정';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short' });
}

function fmtDuration(s) {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}

function isOverdue(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d < new Date();
}

// ─── 예정 회의 카드 ────────────────────────────────────────────────────────────

function UpcomingCard({ meeting, onStart, onDelete }) {
  const overdue = isOverdue(meeting.scheduledAt);
  return (
    <div className={'mtg-card' + (overdue ? ' overdue' : '')}>
      <div className="mtg-card-top">
        <div className="mtg-card-info">
          <div className="mtg-card-title">{meeting.title}</div>
          <div className="mtg-card-time">
            {overdue && <span className="mtg-badge overdue">지금 시작</span>}
            <span className="mtg-card-ts">{fmtScheduledAt(meeting.scheduledAt)}</span>
          </div>
        </div>
        <div className="mtg-card-actions">
          <button className="btn accent sm" onClick={onStart}>▶ 시작</button>
          <button className="mtg-del-btn" onClick={onDelete} title="삭제">×</button>
        </div>
      </div>
      {meeting.agenda?.length > 0 && (
        <div className="mtg-agenda-chips">
          {meeting.agenda.filter(Boolean).map((a, i) => (
            <span key={i} className="mtg-chip">{i + 1}. {a}</span>
          ))}
        </div>
      )}
      {meeting.participants?.length > 0 && (
        <div className="mtg-participants">
          {meeting.participants.slice(0, 6).map((p) => (
            <Avatar key={p.uid} name={p.name} size={24} />
          ))}
          {meeting.participants.length > 6 && (
            <span className="mtg-more mono">+{meeting.participants.length - 6}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 회의록 아카이브 카드 ──────────────────────────────────────────────────────

function ArchiveCard({ meeting, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const m = meeting.minutes;

  return (
    <div className="mtg-archive-card">
      <div className="mtg-archive-top" onClick={() => setExpanded((v) => !v)}>
        <div className="mtg-archive-info">
          <div className="mtg-archive-title">{meeting.title}</div>
          <div className="mtg-archive-meta mono">
            {fmtScheduledAt(meeting.endedAt || meeting.scheduledAt)}
            {meeting.duration ? ` · ${fmtDuration(meeting.duration)}` : ''}
            {meeting.participants?.length ? ` · ${meeting.participants.length}명` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mtg-caret">{expanded ? '▾' : '▸'}</span>
          <button className="mtg-del-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="삭제">×</button>
        </div>
      </div>

      {expanded && m && (
        <div className="mtg-archive-body">
          {m.summary && (
            <div className="mtg-archive-summary">{m.summary}</div>
          )}
          {m.decisions?.length > 0 && (
            <div className="mtg-archive-section">
              <div className="mtg-archive-section-hd">📌 결정 · {m.decisions.length}건</div>
              {m.decisions.map((d, i) => (
                <div key={i} className="mtg-archive-row dec">
                  <span className="mtg-archive-dot" />
                  <span>{d.text}</span>
                </div>
              ))}
            </div>
          )}
          {m.actions?.length > 0 && (
            <div className="mtg-archive-section">
              <div className="mtg-archive-section-hd">✅ 액션 · {m.actions.length}건</div>
              {m.actions.map((a, i) => (
                <div key={i} className="mtg-archive-row act">
                  <span className="mtg-archive-dot" />
                  <span>{a.text}</span>
                  {a.assigneeName && <span className="mtg-archive-assignee">{a.assigneeName}</span>}
                </div>
              ))}
            </div>
          )}
          {m.risks?.length > 0 && (
            <div className="mtg-archive-section">
              <div className="mtg-archive-section-hd">⚠ 리스크 · {m.risks.length}건</div>
              {m.risks.map((r, i) => (
                <div key={i} className="mtg-archive-row risk">
                  <span className="mtg-archive-dot" />
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function KBMeetingTab({ projectId, members = [], user, onPostMeeting }) {
  const { meetings, deleteMeeting } = useMeetings(projectId);
  const [showSchedule, setShowSchedule] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState(null);

  const upcoming = meetings.filter((m) => m.status === 'scheduled' || m.status === 'live');
  const done = meetings.filter((m) => m.status === 'done');

  return (
    <div className="kb-meeting-tab">
      <div className="kb-meeting-hd">
        <span className="kb-meeting-title">회의</span>
        <button className="btn accent sm" onClick={() => setShowSchedule(true)}>+ 회의 예약</button>
      </div>

      <div className="kb-meeting-body">
        <section className="kb-meeting-section">
          <div className="kb-meeting-section-hd">
            예정된 회의
            <span className="mono cnt">{upcoming.length}</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="kb-meeting-empty">
              <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
              <div>예정된 회의가 없습니다</div>
              <button className="btn sm accent" style={{ marginTop: 10 }} onClick={() => setShowSchedule(true)}>회의 예약하기</button>
            </div>
          ) : (
            upcoming.map((m) => (
              <UpcomingCard
                key={m.id}
                meeting={m}
                onStart={() => setActiveMeeting(m)}
                onDelete={() => deleteMeeting(m.id)}
              />
            ))
          )}
        </section>

        <section className="kb-meeting-section">
          <div className="kb-meeting-section-hd">
            회의록
            <span className="mono cnt">{done.length}</span>
          </div>
          {done.length === 0 ? (
            <div className="kb-meeting-empty">
              <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
              <div>아직 완료된 회의가 없습니다</div>
            </div>
          ) : (
            done.map((m) => (
              <ArchiveCard key={m.id} meeting={m} onDelete={() => deleteMeeting(m.id)} />
            ))
          )}
        </section>
      </div>

      <MeetingScheduleModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        members={members}
        projectId={projectId}
        user={user}
      />

      {activeMeeting && (
        <MeetingLiveModal
          open={!!activeMeeting}
          onClose={() => setActiveMeeting(null)}
          meeting={activeMeeting}
          members={members}
          user={user}
          projectId={projectId}
          onPost={onPostMeeting}
        />
      )}
    </div>
  );
}
