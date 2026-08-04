// Vercel serverless — Relay Scope > PR: 분기 성과 평가 (Phase 1)
// 패턴: api/echo-capture.js 동일 (Firestore REST + idToken 인증 + Claude Sonnet).
//
// 분기 기간 스냅샷으로 태스크/채팅/회의 데이터를 읽어 5개 항목(가중치) 평가 리포트 생성.
// ⚠️ 읽기 전용(기존 컬렉션). 쓰기는 evaluations 하위에만. side-effect 없음.
// 권한: 팀장/대표(lead)만. 팀원 접근 불가.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

const MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 4096;
const MAX_CONTEXT_CHARS = 50000;

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const SYSTEM_PROMPT = `당신은 팀원의 분기 성과를 평가하는 HR 평가 전문가입니다. 목적은 보상/면담 근거 확보입니다("이 사람이 이번 분기 잘했나").

아래 5개 항목을 각각 0~100점으로 평가하고 가중치로 종합점수를 계산하세요.
- 업무 완수도 (30%): 태스크 완료율, 기한 준수율
- 업무 품질 (25%): 재작업 빈도, 지시 이해 정확도
- 업무 속도 (20%): 태스크 체류 시간, 반응 속도
- 커뮤니케이션 (15%): 보고 빈도·명확성, 회의 기여도
- 주도성·태도 (10%): 자발적 공유, 문제 제기, 개선 시도

평가 규칙:
- 반드시 제공된 데이터(태스크/채팅/회의)에 근거하라. 데이터가 부족한 항목은 추측하지 말고 "데이터 부족"으로 명시하고 보수적으로(중간점 부근) 평가하라.
- 종합점수 = round(Σ 항목점수 × 가중치).
- 근거추적성: 강점/개선/추천에는 가능한 한 구체적 사례(어떤 태스크/대화/회의)를 인용하라.
- "관리자(팀장) 메시지"로 표시된 항목은 지시 이행 여부·반복 지적·긍정 피드백 판단에 활용하라.

아래 구조의 한국어 Markdown 리포트로만 출력(머리말 없이 곧바로 시작):
# INSA 분기 평가 — {이름} | {분기}
> 평가 기간: {기간}
> 데이터 출처: 채팅 N건 / 태스크 N건 / 회의 N회

## 종합 NN점 / 100

## 항목별
### 업무 완수도 30% → NN점
### 업무 품질 25% → NN점
### 업무 속도 20% → NN점
### 커뮤니케이션 15% → NN점
### 주도성·태도 10% → NN점

## 강점
## 개선 필요 사항
## 관리자 피드백 반영 내용
## 추천 액션

리포트 맨 끝에 아래 HTML 주석 메타블록 한 개만 정확히 덧붙여라(그 앞은 순수 리포트 MD, 뒤에는 아무것도 쓰지 말 것):
<!--PR_META
{"totalScore": <0~100 정수>, "scores": {"완수도": <0~100>, "품질": <0~100>, "속도": <0~100>, "커뮤니케이션": <0~100>, "주도성": <0~100>}}
-->`;

function fsHeaders(idToken) {
  const h = { 'Content-Type': 'application/json' };
  if (idToken) h['Authorization'] = `Bearer ${idToken}`;
  return h;
}
// idToken을 서버에서 검증해 실제 uid 반환(위조 방지). 실패 시 null.
// ⚠️ requesterUid(클라이언트 제공)는 신뢰 금지 — 반드시 이 값으로 권한 판정.
async function verifyUid(idToken) {
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.users?.[0]?.localId || null;
  } catch { return null; }
}
async function fsGetDoc(path, idToken) {
  const r = await fetch(`${FS_BASE}/${path}?key=${FIREBASE_API_KEY}`, { headers: fsHeaders(idToken) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore GET ${path}: ${r.status}`);
  return r.json();
}
async function fsCreateDoc(collectionPath, obj, idToken) {
  const r = await fetch(`${FS_BASE}/${collectionPath}?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: fsHeaders(idToken), body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!r.ok) throw new Error(`Firestore CREATE ${collectionPath}: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return data.name ? data.name.split('/').pop() : null;
}
// 특정 문서를 덮어쓰기(set) — 분기별 doc 경로 고정
async function fsSetDoc(path, obj, idToken) {
  const r = await fetch(`${FS_BASE}/${path}?key=${FIREBASE_API_KEY}`, {
    method: 'PATCH', headers: fsHeaders(idToken), body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!r.ok) throw new Error(`Firestore SET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
// createdAt 범위(분기) 쿼리
async function fsQueryRange(parentPath, collectionId, startIso, endIso, idToken) {
  const body = {
    structuredQuery: {
      from: [{ collectionId, allDescendants: false }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: startIso } } },
            { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: endIso } } },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
    },
  };
  const r = await fetch(`${FS_BASE}/${parentPath}:runQuery?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: fsHeaders(idToken), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Firestore runQuery ${collectionId}: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return (rows || []).filter((x) => x.document).map((x) => decodeDoc(x.document));
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encodeValue(val);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}
function toFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) f[k] = encodeValue(v);
  return f;
}
function decodeValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = decodeValue(val);
    return o;
  }
  return null;
}
function decodeDoc(doc) {
  const o = { _id: doc.name.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields || {})) o[k] = decodeValue(v);
  return o;
}

function parseMeta(raw) {
  let md = raw, totalScore = null, scores = null;
  const m = raw.match(/<!--\s*PR_META\s*([\s\S]*?)-->/i);
  if (m) {
    md = raw.replace(m[0], '').trim();
    try {
      const meta = JSON.parse(m[1].trim());
      if (typeof meta.totalScore === 'number') totalScore = Math.max(0, Math.min(100, Math.round(meta.totalScore)));
      if (meta.scores && typeof meta.scores === 'object') {
        scores = {};
        for (const [k, v] of Object.entries(meta.scores)) {
          if (typeof v === 'number') scores[k] = Math.max(0, Math.min(100, Math.round(v)));
        }
      }
    } catch { /* 본문만 */ }
  }
  return { md, totalScore, scores };
}

const inPeriod = (createdAt, s, e) => createdAt && createdAt >= s && createdAt <= e;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId, memberId, memberName, role, quarterId, periodStart, periodEnd, idToken, requesterUid } = req.body || {};
  if (!projectId || !memberId || !quarterId || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'projectId, memberId, quarterId, periodStart, periodEnd required' });
  }
  if (!idToken) return res.status(401).json({ error: 'idToken required' });
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) return res.status(500).json({ error: 'Firebase config missing' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    // idToken 검증 → 실제 uid (requesterUid 위조 방지)
    const uid = await verifyUid(idToken);
    if (!uid) return res.status(401).json({ error: '유효하지 않은 인증 토큰입니다. 다시 로그인해주세요.' });

    // 권한 — lead 만
    const projRaw = await fsGetDoc(`projects/${projectId}`, idToken);
    if (!projRaw) return res.status(404).json({ error: '워크스페이스를 찾을 수 없습니다.' });
    const proj = decodeDoc(projRaw);
    const members = proj.members || [];
    const leadUids = members.filter((m) => m.role === 'lead').map((m) => m.uid);
    if (!leadUids.includes(uid)) {
      return res.status(403).json({ error: '팀장/대표만 성과 평가를 실행할 수 있습니다.' });
    }
    const leadNames = new Set(members.filter((m) => m.role === 'lead').map((m) => m.name));

    // 분기 데이터 수집 (createdAt 범위) — 읽기 전용
    // 태스크는 두 곳에 나뉘어 저장됨: 담당자 지정 시 users/{uid}/tasks(개인함), 미지정 시 projects/{pid}/tasks(공용)
    const [messages, projectTasks, personalTasks, meetings] = await Promise.all([
      fsQueryRange(`projects/${projectId}`, 'messages', periodStart, periodEnd, idToken),
      fsQueryRange(`projects/${projectId}`, 'tasks', periodStart, periodEnd, idToken),
      fsQueryRange(`users/${memberId}`, 'tasks', periodStart, periodEnd, idToken),
      fsQueryRange(`projects/${projectId}`, 'meetings', periodStart, periodEnd, idToken),
    ]);
    const tasks = [...projectTasks, ...personalTasks];

    const isMember = (uidOrName, name) => uidOrName === memberId || (memberName && name === memberName);

    // 채팅: 본인 + 팀장(관리자) 메시지를 라벨링해 함께 제공
    const myMessages = messages.filter((m) => isMember(m.senderUid, m.senderName));
    const chatLines = messages
      .filter((m) => isMember(m.senderUid, m.senderName) || leadNames.has(m.senderName))
      .map((m) => {
        const who = isMember(m.senderUid, m.senderName) ? '본인' : (leadNames.has(m.senderName) ? '관리자' : '기타');
        const status = m.status ? `·${m.status}` : '';
        return `[${who}/${m.type || 'text'}${status}] ${m.ts || ''} ${(m.text || m.title || '').slice(0, 200)}`;
      });

    // 태스크: users/{memberId}/tasks 문서는 이미 본인 소유(경로 자체로 스코프됨) → 전부 포함
    // projects/{pid}/tasks 문서는 assigneeUid/ownerUid/assigneeName으로 본인 담당분만 필터
    const myTasks = [
      ...personalTasks,
      ...projectTasks.filter((t) => t.assigneeUid === memberId || t.ownerUid === memberId || (memberName && t.assigneeName === memberName)),
    ];
    const taskLines = myTasks.map((t) => `[${t.done ? '완료' : '진행'}] ${t.title || t.text || ''}${t.due || t.date ? ` (마감:${t.due || t.date})` : ''}`);

    // 회의: 본인이 참석자에 포함
    const myMeetings = meetings.filter((m) => (m.participants || []).some((p) => p.uid === memberId || (memberName && p.name === memberName)));
    const meetingLines = myMeetings.map((m) => {
      const rsvp = (m.rsvp && (m.rsvp[memberId] || '')) || '';
      const present = m.livePresence && m.livePresence[memberId] ? '참석' : (rsvp === 'attend' ? '참석예정' : rsvp === 'decline' ? '불참' : '미응답');
      return `[${m.status || ''}/${present}] ${m.title || m.text || ''}`;
    });

    const evidence = { chat: myMessages.length, tasks: myTasks.length, meetings: myMeetings.length };

    // 컨텍스트 구성
    let userPrompt = `# 평가 대상: ${memberName || memberId} (직급/역할: ${role || '미지정'})\n# 워크스페이스: ${proj.name || projectId}\n# 분기: ${quarterId}\n# 평가 기간: ${periodStart.slice(0, 10)} ~ ${periodEnd.slice(0, 10)}\n`;
    userPrompt += `\n## 데이터 출처 요약\n채팅(본인) ${evidence.chat}건 / 태스크 ${evidence.tasks}건 / 회의 ${evidence.meetings}회\n`;
    userPrompt += `\n## 채팅 (본인 + 관리자 메시지, ${chatLines.length}건)\n${chatLines.join('\n') || '데이터 없음'}\n`;
    userPrompt += `\n## 태스크 (${taskLines.length}건)\n${taskLines.join('\n') || '데이터 없음'}\n`;
    userPrompt += `\n## 회의 (${meetingLines.length}건)\n${meetingLines.join('\n') || '데이터 없음'}\n`;
    userPrompt += `\n위 데이터로 5개 항목을 평가하고 리포트 + PR_META를 출력하라.`;

    if (userPrompt.length > MAX_CONTEXT_CHARS) userPrompt = userPrompt.slice(0, MAX_CONTEXT_CHARS) + '\n\n…(이하 생략 — 데이터 과다)';

    const totalDataPoints = evidence.chat + evidence.tasks + evidence.meetings;
    if (totalDataPoints === 0) {
      return res.status(200).json({ ok: false, empty: true, error: '해당 분기에 이 멤버의 데이터가 없습니다. 기간을 확인하세요.' });
    }

    // Claude 호출
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] }),
    });
    if (!claudeRes.ok) return res.status(claudeRes.status).json({ error: 'Claude API error: ' + (await claudeRes.text()) });
    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '';
    if (!raw) return res.status(502).json({ error: '평가 리포트 생성 실패 (빈 응답)' });

    const { md: reportMarkdown, totalScore, scores } = parseMeta(raw);

    // 저장 — projects/{pid}/evaluations/{memberId}/quarters/{quarterId}
    const nowIso = new Date().toISOString();
    const evalPath = `projects/${projectId}/evaluations/${memberId}/quarters/${quarterId}`;
    await fsSetDoc(evalPath, {
      memberId,
      memberName: memberName || '',
      role: role || '',
      quarterId,
      period: { start: periodStart, end: periodEnd },
      totalScore,
      scores: scores || {},
      evidence,
      reportMarkdown,
      managerFeedback: '',          // Phase 2: 팀장 수동 보정
      createdAt: nowIso,
    }, idToken);

    return res.status(200).json({ ok: true, quarterId, totalScore, scores, evidence, reportMarkdown, createdAt: nowIso });
  } catch (err) {
    console.error('PR evaluate error:', err);
    return res.status(500).json({ error: err.message });
  }
}
