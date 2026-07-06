// Vercel serverless — Echo Phase 3: 캡슐 "가동" (에이전트 + 인수인계 문서)
// 패턴: api/echo-capture.js 와 동일 (Firestore REST + idToken 인증 + Claude).
//
// mode='agent'    : 캡슐의 의사결정 규칙 + 거래처 지식을 주입해 그 사람 스타일로 작업 초안 생성
// mode='handover' : 캡슐을 신규 입사자용 인수인계 문서로 재구성
//
// ⚠️ side-effect 절대 금지: 에이전트는 제안/초안만 생성. 실제 발주·승인·전송 등 실행 없음.
// ⚠️ 쓰기는 echoCapsules 하위(agentLogs)에만. 기존 채팅/태스크/티켓은 읽지도 쓰지도 않음.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

const MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 4096;

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
async function fsCreateDoc(collectionPath, obj, idToken) {
  const r = await fetch(`${FS_BASE}/${collectionPath}?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: fsHeaders(idToken), body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!r.ok) throw new Error(`Firestore CREATE ${collectionPath}: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return data.name ? data.name.split('/').pop() : null;     // 생성된 doc id
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

// 캡슐 MD 에서 특정 섹션(## 헤더 키워드)만 추출
function extractSection(md, keyword) {
  const lines = (md || '').split('\n');
  let capturing = false;
  const out = [];
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (capturing) break;            // 다음 ## 헤더 만나면 종료
      capturing = line.includes(keyword);
      if (capturing) { out.push(line); continue; }
    } else if (capturing) out.push(line);
  }
  return out.join('\n').trim();
}

async function callClaude(systemPrompt, userPrompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
  });
  if (!r.ok) throw new Error('Claude API error: ' + r.status + ' ' + (await r.text()));
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

function parseAgentMeta(raw) {
  let response = raw, rulesUsed = [];
  const m = raw.match(/<!--\s*AGENT_META\s*([\s\S]*?)-->/i);
  if (m) {
    response = raw.replace(m[0], '').trim();
    try {
      const meta = JSON.parse(m[1].trim());
      if (Array.isArray(meta.rulesUsed)) rulesUsed = meta.rulesUsed.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
    } catch { /* 본문만 */ }
  }
  return { response, rulesUsed };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId, memberId, memberName, mode = 'agent', task, idToken, requesterUid } = req.body || {};
  if (!projectId || !memberId) return res.status(400).json({ error: 'projectId, memberId required' });
  if (!idToken) return res.status(401).json({ error: 'idToken required' });
  if (mode === 'agent' && !task?.trim()) return res.status(400).json({ error: '작업 지시(task)가 필요합니다.' });
  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) return res.status(500).json({ error: 'Firebase config missing' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    // idToken 검증 → 실제 uid (requesterUid 위조 방지)
    const uid = await verifyUid(idToken);
    if (!uid) return res.status(401).json({ error: '유효하지 않은 인증 토큰입니다. 다시 로그인해주세요.' });

    // 권한 — lead + Echo on
    const projDocRaw = await fsGetDoc(`projects/${projectId}`, idToken);
    if (!projDocRaw) return res.status(404).json({ error: '워크스페이스를 찾을 수 없습니다.' });
    const proj = decodeDoc(projDocRaw);
    const leadUids = (proj.members || []).filter((m) => m.role === 'lead').map((m) => m.uid);
    if (!leadUids.includes(uid)) return res.status(403).json({ error: '팀장만 Echo 에이전트를 실행할 수 있습니다.' });
    if (proj.echoEnabled !== true) return res.status(403).json({ error: '이 워크스페이스에서 Echo가 켜져 있지 않습니다.' });

    // 캡슐 로드
    const capsulePath = `projects/${projectId}/echoCapsules/${memberId}`;
    const capRaw = await fsGetDoc(capsulePath, idToken);
    const capsule = capRaw ? decodeDoc(capRaw) : null;
    if (!capsule?.capsuleMarkdown) return res.status(400).json({ error: '먼저 이 멤버의 캡슐을 생성하세요.' });

    const name = memberName || capsule.memberName || memberId;
    const nowIso = new Date().toISOString();

    if (mode === 'handover') {
      const systemPrompt = `너는 인수인계 문서 작성 전문가다. 아래 "역할 캡슐"(재현용 구조)을 신규 입사자가 읽고 그대로 따라 할 수 있는 인수인계 문서(한국어 Markdown)로 재구성하라.

반드시 아래 섹션 구조로 출력:
## 📋 담당 업무 목록
## 🪜 단계별 프로세스 (따라하기)
## 📞 거래처 연락처 / 실전 팁
## ⚖️ 자주 쓰는 판단 기준
## ✅ 첫 주에 확인할 것

규칙:
- 캡슐에 없는 정보는 지어내지 말고 "확인 필요"로 표시
- 평가가 아니라 "어떻게 일하는지"를 실무자가 바로 쓰도록 구체적·실용적으로
- 머리말 없이 곧바로 첫 ## 섹션부터 출력`;
      const userPrompt = `# 대상: ${name} (역할: ${capsule.role || '미지정'})\n\n[원본 역할 캡슐]\n${capsule.capsuleMarkdown}`;
      const response = await callClaude(systemPrompt, userPrompt);
      if (!response) return res.status(502).json({ error: '인수인계 문서 생성 실패 (빈 응답)' });

      const logId = await fsCreateDoc(`${capsulePath}/agentLogs`, {
        mode: 'handover', task: '인수인계 문서 생성', responsePreview: response.slice(0, 4000),
        rulesUsed: [], rating: null, requesterUid: uid, createdAt: nowIso,
      }, idToken);

      return res.status(200).json({ ok: true, mode: 'handover', response, logId });
    }

    // mode === 'agent'
    const rulesSection = extractSection(capsule.capsuleMarkdown, '의사결정') || '(캡슐에 의사결정 규칙 없음)';
    const relationsSection = extractSection(capsule.capsuleMarkdown, '거래처') || '(캡슐에 거래처 지식 없음)';

    const systemPrompt = `너는 "${name}"의 역할 캡슐을 체화한 업무 어시스턴트다. 아래 캡슐의 의사결정 규칙과 거래처 지식에 근거해, 그 사람의 판단 스타일로 작업을 수행하라.

⚠️ 절대 규칙(중요): 너는 제안/초안만 만든다. 실제 발주·승인·결제·전송 같은 side-effect 작업을 실행했다고 말하거나 실행을 가정하지 마라. 결과물은 항상 "초안/제안"이며, 최종 실행은 사람이 확인 후 직접 한다.

응답 형식:
1) 본문 — 요청 작업에 대한 그 사람 스타일의 답변/초안
2) 마지막에 한 줄 — "📌 근거: <이 판단에 사용한 캡슐 규칙 요약>"
3) 캡슐에 근거가 없는 부분은 추측하지 말고 "이 부분은 캡슐에 없어 확인 필요"라고 명시

[캡슐 — 🧠 의사결정 규칙]
${rulesSection}

[캡슐 — 📇 외부 관계 / 거래처 지식]
${relationsSection}

응답 맨 끝에 아래 HTML 주석 한 개를 정확히 덧붙여라(사용자에게는 숨겨짐):
<!--AGENT_META {"rulesUsed":["사용한 규칙1","사용한 규칙2"]}-->`;

    const raw = await callClaude(systemPrompt, task.trim());
    if (!raw) return res.status(502).json({ error: '에이전트 응답 실패 (빈 응답)' });
    const { response, rulesUsed } = parseAgentMeta(raw);

    // 캡슐 활용 로그 기록
    const logId = await fsCreateDoc(`${capsulePath}/agentLogs`, {
      mode: 'agent', task: task.trim(), responsePreview: response.slice(0, 4000),
      rulesUsed, rating: null, requesterUid: uid, createdAt: nowIso,
    }, idToken);

    return res.status(200).json({ ok: true, mode: 'agent', response, rulesUsed, logId });
  } catch (err) {
    console.error('Echo agent error:', err);
    return res.status(500).json({ error: err.message });
  }
}
