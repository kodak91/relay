// Vercel serverless — Echo Phase 1: 멤버 "역할 캡슐" 생성
// 패턴: api/claude.js (API 키 서버사이드) + api/weeklyReport.js (Firestore REST)를 따름.
//
// 흐름: 팀장이 멤버 지정 호출 → 해당 멤버 관련 messages/tasks/tickets 읽기(READ ONLY)
//      → Claude(Sonnet)로 7섹션 역할 캡슐 MD 생성 → echoCapsules 에만 저장(+ 버전 스냅샷).
//
// ⚠️ 기존 채팅/태스크/티켓 컬렉션은 절대 쓰지 않음 — 읽기 전용.
// 인증: 호출자(팀장)의 Firebase ID 토큰을 Firestore REST에 Bearer로 전달 → 보안 규칙 준수.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

const MODEL = 'claude-sonnet-4-6';      // 의사결정 패턴 추론이 필요하므로 sonnet 계열
const MAX_CONTEXT_CHARS = 50000;        // Claude 입력 컨텍스트 상한
const MAX_OUTPUT_TOKENS = 4096;

// ─── 역할 캡슐 시스템 프롬프트 (7개 섹션 고정) ──────────────────────────────
const SYSTEM_PROMPT = `당신은 팀원의 업무 역할을 "재현 가능한 형태"로 캡처하는 인수인계 전문가입니다.
목적은 "평가"가 아니라 "재현/인수인계"입니다. 이 사람이 내일 사라져도 다른 사람이 역할을 이어받을 수 있도록, 채팅·태스크·티켓 기록에서 역할(RnR)·업무 흐름·관계·암묵지를 추출합니다.

반드시 아래 7개 섹션 구조로만, 한국어 Markdown으로 출력하세요. 섹션 제목과 순서를 변경하지 마세요.

## 🎯 이 역할이 책임지는 것 (RnR)
## 🔁 핵심 업무 흐름 (input → process → output)
## 🧠 의사결정 규칙 (캡처된 판단 패턴)
## 📇 외부 관계 / 거래처 지식
## ⚙️ AI 대체 가능 영역 (✅가능 / ⚠️부분 / ❌인간필요)
## 🕳️ 미캡처 영역 (인수인계 시 직접 확인할 것)
## 🔄 변경 이력

작성 규칙:
- "왜 그 결정을 했는지"까지 기록에서 추론하세요. 결정 메시지/컨펌/투표에서 판단 기준을 끌어내 "의사결정 규칙"에 넣습니다.
- 근거가 충분하지 않은 추측은 단정하지 말고 "🕳️ 미캡처 영역"에 "확인 필요" 항목으로 넣으세요.
- "⚙️ AI 대체 가능 영역"은 각 업무를 ✅가능 / ⚠️부분 / ❌인간필요 로 분류하세요.
- "🔄 변경 이력"에는 이번 캡처 일자와 "최초 생성" 또는 "업데이트" 여부를 한 줄로 기록하세요.
- 기록이 빈약한 섹션은 비워두지 말고 "기록 부족 — 미캡처" 라고 명시하세요.
- 사족/머리말 없이 곧바로 첫 번째 ## 섹션부터 시작하세요.`;

// ─── Firestore REST helpers (idToken 인증) ──────────────────────────────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

function fsHeaders(idToken) {
  const h = { 'Content-Type': 'application/json' };
  if (idToken) h['Authorization'] = `Bearer ${idToken}`;
  return h;
}

async function fsGetDoc(path, idToken) {
  const r = await fetch(`${FS_BASE}/${path}?key=${FIREBASE_API_KEY}`, { headers: fsHeaders(idToken) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore GET ${path}: ${r.status}`);
  return r.json();
}

async function fsListCollection(collectionPath, idToken, pageSize = 300) {
  const r = await fetch(`${FS_BASE}/${collectionPath}?key=${FIREBASE_API_KEY}&pageSize=${pageSize}`, { headers: fsHeaders(idToken) });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Firestore LIST ${collectionPath}: ${r.status}`);
  const data = await r.json();
  return (data.documents || []).map(decodeDoc);
}

async function fsPatchDoc(path, obj, idToken) {
  const r = await fetch(`${FS_BASE}/${path}?key=${FIREBASE_API_KEY}`, {
    method: 'PATCH',
    headers: fsHeaders(idToken),
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!r.ok) throw new Error(`Firestore PATCH ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fsCreateDoc(collectionPath, obj, idToken) {
  const r = await fetch(`${FS_BASE}/${collectionPath}?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: fsHeaders(idToken),
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!r.ok) throw new Error(`Firestore CREATE ${collectionPath}: ${r.status} ${await r.text()}`);
  return r.json();
}

// ─── Firestore <-> JS 값 인코딩/디코딩 ─────────────────────────────────────
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

// ─── 핸들러 ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId, memberId, memberName, role, idToken, requesterUid } = req.body || {};
  if (!projectId || !memberId) return res.status(400).json({ error: 'projectId, memberId required' });
  if (!idToken) return res.status(401).json({ error: 'idToken required' });

  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) return res.status(500).json({ error: 'Firebase config missing' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    // 1. 권한 검증 — 요청자가 해당 워크스페이스의 lead 인지 + Echo 기능 on 인지
    const projDoc = await fsGetDoc(`projects/${projectId}`, idToken);
    if (!projDoc) return res.status(404).json({ error: '워크스페이스를 찾을 수 없습니다.' });
    const proj = decodeDoc(projDoc);
    const members = proj.members || [];
    const leadUids = members.filter((m) => m.role === 'lead').map((m) => m.uid);
    if (!requesterUid || !leadUids.includes(requesterUid)) {
      return res.status(403).json({ error: '팀장만 Echo를 실행할 수 있습니다.' });
    }
    if (proj.echoEnabled === false) {
      return res.status(403).json({ error: '이 워크스페이스에서 Echo 기능이 꺼져 있습니다.' });
    }

    // 2. 멤버 관련 데이터 수집 (READ ONLY). Phase 1은 전체 메시지를 읽음 (델타는 Phase 2).
    const [allMessages, projTasks, personalTasks, tickets] = await Promise.all([
      fsListCollection(`projects/${projectId}/messages`, idToken),
      fsListCollection(`projects/${projectId}/tasks`, idToken),
      fsListCollection(`users/${memberId}/tasks`, idToken),
      fsListCollection(`projects/${projectId}/tickets`, idToken),
    ]);

    const isMine = (m) => m.senderUid === memberId || (memberName && m.senderName === memberName);
    const myMessages = allMessages.filter(isMine);
    const myProjTasks = projTasks.filter((t) =>
      t.assigneeUid === memberId || t.ownerUid === memberId || t.uid === memberId || (memberName && t.assigneeName === memberName));
    const myTickets = tickets.filter((t) =>
      t.assigneeUid === memberId || (memberName && t.assigneeName === memberName));

    // 델타용: 분석에 포함된 마지막 메시지 타임스탬프 (Phase 2 증분 분석 기준)
    const lastMessageTs = myMessages
      .map((m) => m.createdAt)
      .filter(Boolean)
      .sort()
      .pop() || null;

    // 3. Claude 컨텍스트 구성
    const msgLines = myMessages.map((m) => {
      const type = m.type || 'text';
      const status = m.status ? `·${m.status}` : '';
      const chosen = m.chosen ? `·선택:${m.chosen}` : '';
      const content = (m.text || m.title || '').slice(0, 200);
      return `[${type}${status}${chosen}] ${m.ts || ''} ${content}`;
    });
    const taskLines = [...myProjTasks, ...personalTasks].map((t) =>
      `[${t.done ? '완료' : '진행'}] ${t.title || t.text || ''}${t.due ? ` (마감:${t.due})` : ''}`);
    const ticketLines = myTickets.map((t) =>
      `[${t.status || '열림'}] ${t.ticketTitle || t.title || ''}${t.ticketPriority ? ` · ${t.ticketPriority}` : ''}${t.ticketDesc ? ` — ${String(t.ticketDesc).slice(0, 150)}` : ''}`);

    let context =
      `# 분석 대상: ${memberName || memberId} (역할: ${role || '미지정'})\n` +
      `# 워크스페이스: ${proj.name || projectId}\n\n` +
      `## 이 멤버가 보낸 채팅/결정/컨펌 (${msgLines.length}건)\n${msgLines.join('\n') || '기록 없음'}\n\n` +
      `## 이 멤버의 태스크 (${taskLines.length}건)\n${taskLines.join('\n') || '기록 없음'}\n\n` +
      `## 이 멤버 담당 티켓 (${ticketLines.length}건)\n${ticketLines.join('\n') || '기록 없음'}`;

    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.slice(0, MAX_CONTEXT_CHARS) + '\n\n…(이하 생략 — 기록 과다)';
    }

    const hasData = msgLines.length + taskLines.length + ticketLines.length > 0;
    const userPrompt = hasData
      ? `${context}\n\n위 기록을 바탕으로 이 멤버의 역할 캡슐을 7개 섹션 구조로 작성하세요. 오늘 날짜는 ${new Date().toISOString().slice(0, 10)} 입니다.`
      : `${context}\n\n이 멤버에 대한 기록이 거의 없습니다. 7개 섹션 구조는 유지하되 대부분을 "🕳️ 미캡처 영역"에 인수인계 시 직접 확인할 항목으로 정리하세요. 오늘 날짜는 ${new Date().toISOString().slice(0, 10)} 입니다.`;

    // 4. Claude 호출
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(claudeRes.status).json({ error: 'Claude API error: ' + err });
    }
    const claudeData = await claudeRes.json();
    const capsuleMarkdown = claudeData.content?.[0]?.text || '';
    if (!capsuleMarkdown) return res.status(502).json({ error: 'Echo 캡슐 생성 실패 (빈 응답)' });

    // 5. 저장 — echoCapsules 에만 쓰기 (+ 버전 스냅샷)
    const nowIso = new Date().toISOString();
    const capsulePath = `projects/${projectId}/echoCapsules/${memberId}`;
    const existing = await fsGetDoc(capsulePath, idToken);
    const createdAt = existing ? decodeDoc(existing).createdAt || nowIso : nowIso;

    await fsPatchDoc(capsulePath, {
      memberId,
      memberName: memberName || '',
      role: role || '',
      capsuleMarkdown,
      reproducibility: null,          // Phase 1은 null 허용 (재현 가능도 산정은 Phase 2)
      lastUpdated: nowIso,
      lastMessageTs,                  // 델타용
      createdAt,
      analyzedMessageCount: msgLines.length,
      analyzedTaskCount: taskLines.length,
      analyzedTicketCount: ticketLines.length,
    }, idToken);

    // 버전 이력 스냅샷 (덮어쓰기 방지)
    await fsCreateDoc(`${capsulePath}/versions`, {
      capsuleMarkdown,
      createdAt: nowIso,
    }, idToken);

    return res.status(200).json({
      ok: true,
      capsuleMarkdown,
      lastUpdated: nowIso,
      stats: { messages: msgLines.length, tasks: taskLines.length, tickets: ticketLines.length },
    });
  } catch (err) {
    console.error('Echo capture error:', err);
    return res.status(500).json({ error: err.message });
  }
}
