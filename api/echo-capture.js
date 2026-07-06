// Vercel serverless — Echo "역할 캡슐" 생성/갱신 (Phase 2: 재현 엔진)
// 패턴: api/claude.js (API 키 서버사이드) + api/weeklyReport.js (Firestore REST)를 따름.
//
// Phase 2 변경점:
//  (1) 델타: echoCapsules.lastMessageTs 이후 신규 메시지만 읽음 (없으면 스킵)
//  (2) 머지: 기존 캡슐을 베이스로 신규 정보만 반영 (단순 덮어쓰기 금지)
//  (3) 재현 가능도: Claude가 0~100 산출 → reproducibility 필드
//  (4) 미캡처 질문: Claude가 질문 추출 → echoCapsules/{memberId}/questions 에 적재,
//      팀원 답변은 다음 캡처 때 머지
//
// ⚠️ 기존 채팅/태스크/티켓 컬렉션은 읽기 전용. 쓰기는 echoCapsules 하위에만.
// 인증: 호출자(팀장)의 Firebase ID 토큰을 Firestore REST에 Bearer로 전달 → 보안 규칙 준수.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

const MODEL = 'claude-sonnet-4-6';      // 의사결정 패턴 추론이 필요하므로 sonnet 계열
const MAX_CONTEXT_CHARS = 50000;
const MAX_OUTPUT_TOKENS = 4096;

// ─── 시스템 프롬프트 (7섹션 + 머지 규칙 + 재현가능도 + 질문 메타) ──────────────
// ⚠️ functions/echoScheduler.js 의 SYSTEM_PROMPT 와 동일하게 유지할 것.
const SYSTEM_PROMPT = `당신은 팀원의 업무 역할을 "재현 가능한 형태"로 캡처/갱신하는 인수인계 전문가입니다.
목적은 평가가 아니라 인수인계/재현입니다. 이 사람이 사라져도 다른 사람이 역할을 이어받을 수 있도록, 기록에서 역할(RnR)·업무 흐름·관계·암묵지를 추출합니다.

[출력 구조] 반드시 아래 7개 섹션 구조의 한국어 Markdown 으로만 출력하세요. 제목과 순서를 바꾸지 마세요.
## 🎯 이 역할이 책임지는 것 (RnR)
## 🔁 핵심 업무 흐름 (input → process → output)
## 🧠 의사결정 규칙 (캡처된 판단 패턴)
## 📇 외부 관계 / 거래처 지식
## ⚙️ AI 대체 가능 영역 (✅가능 / ⚠️부분 / ❌인간필요)
## 🕳️ 미캡처 영역 (인수인계 시 직접 확인할 것)
## 🔄 변경 이력

[갱신(머지) 규칙] "기존 캡슐"이 함께 주어지면 그것을 베이스로 신규 정보만 반영해 "업데이트된 전체 캡슐"을 반환합니다. 단순 덮어쓰기를 절대 하지 마세요.
- 새 의사결정 사례 발견 → 기존 의사결정 규칙을 강화하거나 예외를 추가
- 패턴 변화 감지 → "🔄 변경 이력"에 날짜(YYYY-MM-DD)와 함께 한 줄로 기록
- 기존 규칙과 모순되는 행동 발견 → 해당 항목 옆에 "⚠️ 규칙 재검토 필요" 플래그 표시
- 기존에 캡처된 내용은 신규 근거 없이 삭제 금지. 근거가 없으면 그대로 유지
- "팀원 미캡처 보완 답변"이 주어지면 그 내용을 적절한 섹션에 반영하고, 해당 항목은 🕳️ 미캡처 영역에서 제거

[추론 규칙] "왜 그 결정을 했는지"까지 기록에서 추론하세요. 근거가 부족한 추측은 단정하지 말고 🕳️ 미캡처 영역에 "확인 필요"로 넣으세요.

[재현 가능도] 이 캡슐만으로 역할을 재현할 수 있는 정도를 0~100 정수로 산출하세요. 기준: RnR 명확도, 업무흐름 완결성, 의사결정 규칙의 수와 구체성, 미캡처 영역 비중(클수록 낮음).

[미캡처 질문] 🕳️ 미캡처 영역의 핵심 공백을, 팀원 본인에게 직접 물을 구체적 질문 문장으로 3~6개 뽑으세요. 예: "CJ 물류 담당자 연락 시 특별히 신경쓰는 점이 있나요?"

[출력 끝 메타블록] 캡슐 본문(7섹션) 뒤에 아래 HTML 주석 한 개만 정확히 덧붙이세요. 그 앞은 순수 캡슐 MD 여야 하고, 메타블록 뒤에는 아무것도 쓰지 마세요.
<!--ECHO_META
{"reproducibility": <0~100 정수>, "questions": ["질문1", "질문2"]}
-->`;

// ─── Firestore REST helpers (idToken 인증) ──────────────────────────────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

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

async function fsListCollection(collectionPath, idToken, pageSize = 300) {
  const r = await fetch(`${FS_BASE}/${collectionPath}?key=${FIREBASE_API_KEY}&pageSize=${pageSize}`, { headers: fsHeaders(idToken) });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Firestore LIST ${collectionPath}: ${r.status}`);
  const data = await r.json();
  return (data.documents || []).map(decodeDoc);
}

// 델타 쿼리: createdAt > sinceTs 인 문서만 (서브컬렉션 단위 runQuery)
async function fsQuerySince(parentPath, collectionId, sinceTs, idToken) {
  const body = {
    structuredQuery: {
      from: [{ collectionId, allDescendants: false }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'createdAt' },
          op: 'GREATER_THAN',
          value: { timestampValue: sinceTs },
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
    },
  };
  const url = `${FS_BASE}/${parentPath}:runQuery?key=${FIREBASE_API_KEY}`;
  const r = await fetch(url, { method: 'POST', headers: fsHeaders(idToken), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Firestore runQuery ${collectionId}: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return (rows || []).filter((x) => x.document).map((x) => decodeDoc(x.document));
}

async function fsPatchDoc(path, obj, idToken, updateMaskFields) {
  let url = `${FS_BASE}/${path}?key=${FIREBASE_API_KEY}`;
  if (updateMaskFields) url += updateMaskFields.map((f) => `&updateMask.fieldPaths=${encodeURIComponent(f)}`).join('');
  const r = await fetch(url, { method: 'PATCH', headers: fsHeaders(idToken), body: JSON.stringify({ fields: toFields(obj) }) });
  if (!r.ok) throw new Error(`Firestore PATCH ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fsCreateDoc(collectionPath, obj, idToken) {
  const r = await fetch(`${FS_BASE}/${collectionPath}?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: fsHeaders(idToken), body: JSON.stringify({ fields: toFields(obj) }),
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

// ─── 메타블록 파싱 (재현가능도 + 질문) ──────────────────────────────────────
function parseMeta(raw) {
  let md = raw, reproducibility = null, questions = [];
  const m = raw.match(/<!--\s*ECHO_META\s*([\s\S]*?)-->/i);
  if (m) {
    md = raw.replace(m[0], '').trim();
    try {
      const meta = JSON.parse(m[1].trim());
      if (typeof meta.reproducibility === 'number') {
        reproducibility = Math.max(0, Math.min(100, Math.round(meta.reproducibility)));
      }
      if (Array.isArray(meta.questions)) {
        questions = meta.questions.filter((q) => typeof q === 'string' && q.trim()).map((q) => q.trim());
      }
    } catch { /* 메타 파싱 실패 시 본문만 사용 */ }
  }
  return { md, reproducibility, questions };
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
    // idToken 검증 → 실제 uid (requesterUid 위조 방지)
    const uid = await verifyUid(idToken);
    if (!uid) return res.status(401).json({ error: '유효하지 않은 인증 토큰입니다. 다시 로그인해주세요.' });

    // 1. 권한 검증 — 요청자가 lead 인지 + Echo on 인지
    const projDocRaw = await fsGetDoc(`projects/${projectId}`, idToken);
    if (!projDocRaw) return res.status(404).json({ error: '워크스페이스를 찾을 수 없습니다.' });
    const proj = decodeDoc(projDocRaw);
    const leadUids = (proj.members || []).filter((m) => m.role === 'lead').map((m) => m.uid);
    if (!leadUids.includes(uid)) {
      return res.status(403).json({ error: '팀장만 Echo를 실행할 수 있습니다.' });
    }
    if (proj.echoEnabled !== true) {
      return res.status(403).json({ error: '이 워크스페이스에서 Echo가 켜져 있지 않습니다. EchoPanel에서 먼저 켜주세요.' });
    }

    // 2. 기존 캡슐 로드 (델타/머지 기준)
    const capsulePath = `projects/${projectId}/echoCapsules/${memberId}`;
    const existingRaw = await fsGetDoc(capsulePath, idToken);
    const existing = existingRaw ? decodeDoc(existingRaw) : null;
    const sinceTs = existing?.lastMessageTs || null;

    // 팀장 👎 피드백으로 쌓인 "규칙 재검토" 플래그 (Phase 3 연결)
    const pendingReviewFlags = (await fsListCollection(`${capsulePath}/reviewFlags`, idToken)).filter((f) => !f.resolved);

    // 3. 메시지 수집 — 기존 캡슐 + lastMessageTs 있으면 델타, 아니면 전체
    let analyzedMessages;
    if (existing && sinceTs) {
      const newMsgs = await fsQuerySince(`projects/${projectId}`, 'messages', sinceTs, idToken);
      analyzedMessages = newMsgs.filter((m) => m.senderUid === memberId || (memberName && m.senderName === memberName));
      // 신규 메시지가 없으면 스킵 (단, 답변된 보완질문 또는 재검토 플래그가 있으면 진행)
      const pendingAnswers = (await fsListCollection(`${capsulePath}/questions`, idToken))
        .filter((q) => q.answered && !q.merged);
      if (analyzedMessages.length === 0 && pendingAnswers.length === 0 && pendingReviewFlags.length === 0) {
        return res.status(200).json({ ok: true, skipped: true, reason: '신규 메시지/피드백 없음' });
      }
    } else {
      // 최초 생성: 전체 메시지에서 멤버 관련만
      const all = await fsListCollection(`projects/${projectId}/messages`, idToken);
      analyzedMessages = all.filter((m) => m.senderUid === memberId || (memberName && m.senderName === memberName));
    }

    // 4. 태스크/티켓(현재 상태) + 답변된 보완 질문
    const [projTasks, personalTasks, tickets, allQuestions] = await Promise.all([
      fsListCollection(`projects/${projectId}/tasks`, idToken),
      fsListCollection(`users/${memberId}/tasks`, idToken),
      fsListCollection(`projects/${projectId}/tickets`, idToken),
      fsListCollection(`${capsulePath}/questions`, idToken),
    ]);
    const myProjTasks = projTasks.filter((t) => t.assigneeUid === memberId || t.ownerUid === memberId || t.uid === memberId || (memberName && t.assigneeName === memberName));
    const myTickets = tickets.filter((t) => t.assigneeUid === memberId || (memberName && t.assigneeName === memberName));
    const answeredQuestions = allQuestions.filter((q) => q.answered && !q.merged);

    // 델타용 최신 ts 갱신 (기존값과 신규 메시지 중 최댓값)
    const newestNewTs = analyzedMessages.map((m) => m.createdAt).filter(Boolean).sort().pop() || null;
    const lastMessageTs = [sinceTs, newestNewTs].filter(Boolean).sort().pop() || null;

    // 5. Claude 컨텍스트 구성
    const msgLines = analyzedMessages.map((m) => {
      const status = m.status ? `·${m.status}` : '';
      const chosen = m.chosen ? `·선택:${m.chosen}` : '';
      return `[${m.type || 'text'}${status}${chosen}] ${m.ts || ''} ${(m.text || m.title || '').slice(0, 200)}`;
    });
    const taskLines = [...myProjTasks, ...personalTasks].map((t) => `[${t.done ? '완료' : '진행'}] ${t.title || t.text || ''}${t.due ? ` (마감:${t.due})` : ''}`);
    const ticketLines = myTickets.map((t) => `[${t.status || '열림'}] ${t.ticketTitle || t.title || ''}${t.ticketPriority ? ` · ${t.ticketPriority}` : ''}`);
    const answerLines = answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`);

    const isUpdate = !!existing;
    let userPrompt = `# 분석 대상: ${memberName || memberId} (역할: ${role || '미지정'})\n# 워크스페이스: ${proj.name || projectId}\n# 오늘: ${new Date().toISOString().slice(0, 10)}\n`;

    if (isUpdate) {
      userPrompt += `\n## 기존 캡슐 (베이스 — 이것을 유지하며 신규 정보만 머지)\n${existing.capsuleMarkdown || '(없음)'}\n`;
      userPrompt += `\n## 신규 메시지 (${msgLines.length}건 · lastMessageTs 이후)\n${msgLines.join('\n') || '없음'}\n`;
    } else {
      userPrompt += `\n## 이 멤버가 보낸 채팅/결정/컨펌 (${msgLines.length}건)\n${msgLines.join('\n') || '기록 없음'}\n`;
    }
    userPrompt += `\n## 현재 태스크 (${taskLines.length}건)\n${taskLines.join('\n') || '없음'}\n`;
    userPrompt += `\n## 담당 티켓 (${ticketLines.length}건)\n${ticketLines.join('\n') || '없음'}\n`;
    if (answerLines.length) {
      userPrompt += `\n## 팀원 미캡처 보완 답변 (${answerLines.length}건 — 캡슐에 반영하고 미캡처 영역에서 제거)\n${answerLines.join('\n\n')}\n`;
    }
    if (pendingReviewFlags.length) {
      const flagLines = pendingReviewFlags.map((f) => `- "${f.rule}"${f.comment ? ` — ${f.comment}` : ''}`).join('\n');
      userPrompt += `\n## ⚠️ 규칙 재검토 요청 (팀장 피드백 ${pendingReviewFlags.length}건)\n아래 규칙들이 실제 판단과 맞지 않다는 피드백이 있습니다. 🧠 의사결정 규칙에서 해당 항목을 재검토해 수정하거나 "⚠️ 규칙 재검토 필요" 플래그를 다세요.\n${flagLines}\n`;
    }
    userPrompt += isUpdate
      ? `\n위 기존 캡슐을 베이스로 신규 정보만 머지하여 업데이트된 전체 캡슐을 7섹션 + ECHO_META 형식으로 출력하세요.`
      : `\n위 기록으로 역할 캡슐을 7섹션 + ECHO_META 형식으로 작성하세요. 기록이 빈약하면 대부분을 🕳️ 미캡처 영역으로 정리하세요.`;

    if (userPrompt.length > MAX_CONTEXT_CHARS) userPrompt = userPrompt.slice(0, MAX_CONTEXT_CHARS) + '\n\n…(이하 생략)';

    // 6. Claude 호출
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] }),
    });
    if (!claudeRes.ok) return res.status(claudeRes.status).json({ error: 'Claude API error: ' + (await claudeRes.text()) });
    const claudeData = await claudeRes.json();
    const raw = claudeData.content?.[0]?.text || '';
    if (!raw) return res.status(502).json({ error: 'Echo 캡슐 생성 실패 (빈 응답)' });

    const { md: capsuleMarkdown, reproducibility, questions } = parseMeta(raw);

    // 7. 저장 — 캡슐 본문 + 버전 스냅샷 (Phase 1 구조 유지)
    const nowIso = new Date().toISOString();
    const createdAt = existing?.createdAt || nowIso;
    await fsPatchDoc(capsulePath, {
      memberId,
      memberName: memberName || '',
      role: role || '',
      capsuleMarkdown,
      reproducibility,                    // Phase 2: 0~100 또는 null
      lastUpdated: nowIso,
      lastMessageTs,                      // 델타 기준 갱신
      createdAt,
      analyzedMessageCount: msgLines.length,
      analyzedTaskCount: taskLines.length,
      analyzedTicketCount: ticketLines.length,
    }, idToken);

    await fsCreateDoc(`${capsulePath}/versions`, { capsuleMarkdown, reproducibility, createdAt: nowIso }, idToken);

    // 8. 미캡처 질문 upsert (중복 제거 — 질문 텍스트 기준)
    const existingQTexts = new Set(allQuestions.map((q) => q.question));
    let newQ = 0;
    for (const q of questions) {
      if (existingQTexts.has(q)) continue;
      await fsCreateDoc(`${capsulePath}/questions`, { question: q, answered: false, answer: '', merged: false, createdAt: nowIso }, idToken);
      newQ++;
    }

    // 9. 이번에 반영한 답변은 merged 처리 (다음 캡처 때 재투입 방지)
    for (const q of answeredQuestions) {
      await fsPatchDoc(`${capsulePath}/questions/${q._id}`, { merged: true }, idToken, ['merged']);
    }

    // 10. 반영한 재검토 플래그는 resolved 처리
    for (const f of pendingReviewFlags) {
      await fsPatchDoc(`${capsulePath}/reviewFlags/${f._id}`, { resolved: true }, idToken, ['resolved']);
    }

    return res.status(200).json({
      ok: true,
      mode: isUpdate ? 'merge' : 'create',
      capsuleMarkdown,
      reproducibility,
      lastUpdated: nowIso,
      stats: { newMessages: msgLines.length, mergedAnswers: answeredQuestions.length, newQuestions: newQ, reviewFlags: pendingReviewFlags.length },
    });
  } catch (err) {
    console.error('Echo capture error:', err);
    return res.status(500).json({ error: err.message });
  }
}
