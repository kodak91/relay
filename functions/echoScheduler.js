// Firebase Cloud Functions — Echo 자동 실행 스케줄러 (Phase 2)
// 3일마다 Echo가 켜진 워크스페이스의 전체 멤버 캡슐을 델타 업데이트.
//
// api/echo-capture.js 와 동일한 로직을 admin SDK 로 구현(보안 규칙 우회 — 백엔드 크론).
// ⚠️ SYSTEM_PROMPT / parseMeta / 머지·델타 규칙은 api/echo-capture.js 와 동일하게 유지할 것.
//
// 배포 전 확인:
//   1) firebase use <project>  (프로젝트 연결)
//   2) firebase functions:secrets:set ANTHROPIC_API_KEY
//   3) REGION 이 기존 Firestore 리전과 동일한지 확인 (기본 asia-northeast3 / 서울)
//   4) firebase deploy --only functions

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const REGION = 'asia-northeast3';     // ⚠️ 기존 프로젝트 리전과 동일하게 유지
const MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 4096;

// ⚠️ api/echo-capture.js 의 SYSTEM_PROMPT 와 동일하게 유지
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

function parseMeta(raw) {
  let md = raw, reproducibility = null, questions = [];
  const m = raw.match(/<!--\s*ECHO_META\s*([\s\S]*?)-->/i);
  if (m) {
    md = raw.replace(m[0], '').trim();
    try {
      const meta = JSON.parse(m[1].trim());
      if (typeof meta.reproducibility === 'number') reproducibility = Math.max(0, Math.min(100, Math.round(meta.reproducibility)));
      if (Array.isArray(meta.questions)) questions = meta.questions.filter((q) => typeof q === 'string' && q.trim()).map((q) => q.trim());
    } catch { /* 본문만 사용 */ }
  }
  return { md, reproducibility, questions };
}

async function callClaude(userPrompt, apiKey) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_OUTPUT_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userPrompt }] }),
  });
  if (!r.ok) throw new Error('Claude API error: ' + r.status + ' ' + (await r.text()));
  const data = await r.json();
  return data.content?.[0]?.text || '';
}

const tsToIso = (t) => (t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null);

// 멤버 1명 델타 캡처. { skipped } 또는 { ok, newQuestions, mergedAnswers } 반환.
async function captureMember(projectId, proj, member, apiKey) {
  const memberId = member.uid;
  const memberName = member.name || '';
  const capsuleRef = db.doc(`projects/${projectId}/echoCapsules/${memberId}`);
  const existingSnap = await capsuleRef.get();
  const existing = existingSnap.exists ? existingSnap.data() : null;
  const sinceTs = existing?.lastMessageTs || null;

  const isMine = (m) => m.senderUid === memberId || (memberName && m.senderName === memberName);

  // 팀장 👎 피드백 → 규칙 재검토 플래그 (Phase 3 연결)
  const pendingReviewFlags = (await capsuleRef.collection('reviewFlags').get())
    .docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.resolved);

  // 메시지: 델타 or 전체
  let analyzedMessages;
  const msgsCol = db.collection(`projects/${projectId}/messages`);
  if (existing && sinceTs) {
    const snap = await msgsCol.where('createdAt', '>', admin.firestore.Timestamp.fromDate(new Date(sinceTs))).orderBy('createdAt').get();
    analyzedMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isMine);
    const pendingAnswers = (await capsuleRef.collection('questions').where('answered', '==', true).get())
      .docs.map((d) => ({ id: d.id, ...d.data() })).filter((q) => !q.merged);
    if (analyzedMessages.length === 0 && pendingAnswers.length === 0 && pendingReviewFlags.length === 0) return { skipped: true };
  } else {
    const snap = await msgsCol.get();
    analyzedMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isMine);
  }

  const [projTasksSnap, personalTasksSnap, ticketsSnap, questionsSnap] = await Promise.all([
    db.collection(`projects/${projectId}/tasks`).get(),
    db.collection(`users/${memberId}/tasks`).get(),
    db.collection(`projects/${projectId}/tickets`).get(),
    capsuleRef.collection('questions').get(),
  ]);
  const projTasks = projTasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.assigneeUid === memberId || t.ownerUid === memberId || t.uid === memberId || (memberName && t.assigneeName === memberName));
  const personalTasks = personalTasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const tickets = ticketsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.assigneeUid === memberId || (memberName && t.assigneeName === memberName));
  const allQuestions = questionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const answeredQuestions = allQuestions.filter((q) => q.answered && !q.merged);

  // 델타 기준 ts 갱신
  const newestNewTs = analyzedMessages.map((m) => tsToIso(m.createdAt)).filter(Boolean).sort().pop() || null;
  const lastMessageTs = [sinceTs, newestNewTs].filter(Boolean).sort().pop() || null;

  // 컨텍스트
  const msgLines = analyzedMessages.map((m) => {
    const status = m.status ? `·${m.status}` : '';
    const chosen = m.chosen ? `·선택:${m.chosen}` : '';
    return `[${m.type || 'text'}${status}${chosen}] ${m.ts || ''} ${(m.text || m.title || '').slice(0, 200)}`;
  });
  const taskLines = [...projTasks, ...personalTasks].map((t) => `[${t.done ? '완료' : '진행'}] ${t.title || t.text || ''}${t.due ? ` (마감:${t.due})` : ''}`);
  const ticketLines = tickets.map((t) => `[${t.status || '열림'}] ${t.ticketTitle || t.title || ''}${t.ticketPriority ? ` · ${t.ticketPriority}` : ''}`);
  const answerLines = answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`);

  const isUpdate = !!existing;
  let userPrompt = `# 분석 대상: ${memberName || memberId} (역할: ${member.role || '미지정'})\n# 워크스페이스: ${proj.name || projectId}\n# 오늘: ${new Date().toISOString().slice(0, 10)}\n`;
  if (isUpdate) {
    userPrompt += `\n## 기존 캡슐 (베이스 — 유지하며 신규 정보만 머지)\n${existing.capsuleMarkdown || '(없음)'}\n`;
    userPrompt += `\n## 신규 메시지 (${msgLines.length}건 · lastMessageTs 이후)\n${msgLines.join('\n') || '없음'}\n`;
  } else {
    userPrompt += `\n## 이 멤버가 보낸 채팅/결정/컨펌 (${msgLines.length}건)\n${msgLines.join('\n') || '기록 없음'}\n`;
  }
  userPrompt += `\n## 현재 태스크 (${taskLines.length}건)\n${taskLines.join('\n') || '없음'}\n`;
  userPrompt += `\n## 담당 티켓 (${ticketLines.length}건)\n${ticketLines.join('\n') || '없음'}\n`;
  if (answerLines.length) userPrompt += `\n## 팀원 미캡처 보완 답변 (${answerLines.length}건 — 반영 후 미캡처 영역에서 제거)\n${answerLines.join('\n\n')}\n`;
  if (pendingReviewFlags.length) {
    const flagLines = pendingReviewFlags.map((f) => `- "${f.rule}"${f.comment ? ` — ${f.comment}` : ''}`).join('\n');
    userPrompt += `\n## ⚠️ 규칙 재검토 요청 (팀장 피드백 ${pendingReviewFlags.length}건)\n아래 규칙들이 실제 판단과 맞지 않다는 피드백이 있습니다. 🧠 의사결정 규칙에서 재검토해 수정하거나 "⚠️ 규칙 재검토 필요" 플래그를 다세요.\n${flagLines}\n`;
  }
  userPrompt += isUpdate
    ? `\n위 기존 캡슐을 베이스로 신규 정보만 머지하여 업데이트된 전체 캡슐을 7섹션 + ECHO_META 형식으로 출력하세요.`
    : `\n위 기록으로 역할 캡슐을 7섹션 + ECHO_META 형식으로 작성하세요. 기록이 빈약하면 대부분을 🕳️ 미캡처 영역으로 정리하세요.`;

  const raw = await callClaude(userPrompt, apiKey);
  if (!raw) throw new Error('빈 응답');
  const { md: capsuleMarkdown, reproducibility, questions } = parseMeta(raw);

  const nowIso = new Date().toISOString();
  const createdAt = existing?.createdAt || nowIso;

  await capsuleRef.set({
    memberId, memberName, role: member.role || '',
    capsuleMarkdown, reproducibility,
    lastUpdated: nowIso, lastMessageTs, createdAt,
    analyzedMessageCount: msgLines.length,
    analyzedTaskCount: taskLines.length,
    analyzedTicketCount: ticketLines.length,
  }, { merge: true });

  await capsuleRef.collection('versions').add({ capsuleMarkdown, reproducibility, createdAt: nowIso });

  // 미캡처 질문 upsert (중복 제거)
  const existingQTexts = new Set(allQuestions.map((q) => q.question));
  let newQuestions = 0;
  for (const q of questions) {
    if (existingQTexts.has(q)) continue;
    await capsuleRef.collection('questions').add({ question: q, answered: false, answer: '', merged: false, createdAt: nowIso });
    newQuestions++;
  }
  // 반영된 답변 merged 처리
  for (const q of answeredQuestions) {
    await capsuleRef.collection('questions').doc(q.id).update({ merged: true });
  }
  // 반영된 재검토 플래그 resolved 처리
  for (const f of pendingReviewFlags) {
    await capsuleRef.collection('reviewFlags').doc(f.id).update({ resolved: true });
  }

  return { ok: true, newQuestions, mergedAnswers: answeredQuestions.length, reviewFlags: pendingReviewFlags.length };
}

// 3일마다 실행 (서울 시간 기준)
exports.echoScheduler = onSchedule(
  {
    region: REGION,
    schedule: 'every 72 hours',
    timeZone: 'Asia/Seoul',
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const apiKey = ANTHROPIC_API_KEY.value();
    const projectsSnap = await db.collection('projects').get();
    // Echo 기능이 켜진(미설정=기본 on) + 삭제되지 않은 워크스페이스만
    const projects = projectsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.echoEnabled !== false && p.status !== '삭제됨');

    let members = 0, captured = 0, skipped = 0, errors = 0;
    for (const proj of projects) {
      for (const member of (proj.members || []).filter((m) => m.uid)) {
        members++;
        try {
          const r = await captureMember(proj.id, proj, member, apiKey);
          if (r.skipped) skipped++; else captured++;
        } catch (e) {
          errors++;
          logger.error('Echo capture failed', { project: proj.id, member: member.uid, error: e.message });
        }
      }
    }

    // 무료 tier 모니터링: 멤버 수 × 빈도 (3일마다 → 월 약 10회)
    logger.info('Echo scheduler complete', {
      workspaces: projects.length,
      members,
      captured,        // 실제 Claude 호출 수 (= 과금/호출 비용 추정 기준)
      skipped,
      errors,
      estMonthlyClaudeCalls: captured * 10,
    });
  }
);
