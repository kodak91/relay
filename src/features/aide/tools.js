// 개인 비서의 6개 도구. Relay의 기존 AIChannel처럼 슬래시 커맨드로 명시적으로 호출한다 —
// 자연어 키워드로 추측하지 않는다. 그래야 "안녕"에 검색 결과로 답하는 실수가 안 생긴다.
// 모든 도구는 { speech, card }를 함께 돌려준다. speech는 소리 낼 한두 문장(요약),
// card는 화면에 띄울 근거 — 둘의 내용은 같으면 안 된다는 원칙을 그대로 지킨다.

export const DEFAULT_PROFILE = {
  name: '주인',
  business: '탈모 증상 완화 기능성 젤라또 샴푸팩을 파는 비건 헤어케어 브랜드 힐링스쿱 운영',
  products: '힐링스쿱 젤라또 샴푸팩 — 1개 단품 / 3개 세트 / 6개 세트 묶음 판매',
  customers: '20~50대 여성. 여행·출장·스포츠·임산부 등 간편함이 필요한 상황',
  tone: '존댓말, 다정한 ~요체, 간결하게',
};

export const COMMANDS = [
  { cmd: '/노트찾기', desc: 'vault에서 사실 찾기 (뒤에 검색어)', needsArg: true },
  { cmd: '/웹조사', desc: '외부 정보 조사 (뒤에 질문)', needsArg: true },
  { cmd: '/받은편지', desc: '메일함 확인' },
  { cmd: '/오늘브리핑', desc: '일정·안읽은 것·밀린 것' },
  { cmd: '/기억하기', desc: '사실 하나 기억 (뒤에 내용)', needsArg: true },
  { cmd: '/하루계획', desc: '오늘 할 일 다섯 개 — 돈 순서' },
];

const MONEY_KEYWORDS = ['발주', '결제', '입금', '배송', '계약', '정산', '환불'];

function todayKR() {
  return new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

// 1. 노트찾기 — vault에서 사실을 꺼낸다. 어느 파일인지 반드시 말한다.
function findNotes(query, ctx) {
  if (!ctx.vault) {
    return {
      speech: '아직 vault가 연결되지 않았어요. 위에서 옵시디언 폴더를 먼저 선택해주세요.',
      card: { type: 'notice', text: 'vault 미연결' },
    };
  }
  const q = (query || '').trim().toLowerCase();
  if (!q) return { speech: '무엇을 찾을지 뒤에 검색어를 붙여주세요. 예: /노트찾기 힐링스쿱 가격', card: null };

  const hits = ctx.vault.notes
    .map((n) => {
      const inTitle = n.title.toLowerCase().includes(q);
      const inTags = n.tags.some((t) => t.toLowerCase().includes(q));
      const textIdx = n.text ? n.text.toLowerCase().indexOf(q) : -1;
      if (!inTitle && !inTags && textIdx === -1) return null;
      const snippet = textIdx > -1 ? n.text.slice(Math.max(0, textIdx - 30), textIdx + 60).trim() : '';
      const score = (inTitle ? 3 : 0) + (inTags ? 2 : 0) + (textIdx > -1 ? 1 : 0);
      return { path: n.path, title: n.title, kind: n.kind, snippet, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (hits.length === 0) {
    return { speech: `"${query}"는 노트에서 찾을 수 없었어요.`, card: { type: 'notice', text: '검색 결과 없음' } };
  }
  const names = hits.slice(0, 3).map((h) => h.path).join(', ');
  return {
    speech: `${names}${hits.length > 3 ? ` 외 ${hits.length - 3}건` : ''}에서 찾았어요.`,
    card: { type: 'notes', items: hits },
  };
}

// 2. 웹조사 — 밖에서 찾아온 정보를 내 상황에 붙여 말한다. 지금은 외부 검색 API가
// 연결되어 있지 않다. 없는 걸 있는 척 답하면 절대 규칙 위반이라 정직하게 알린다.
function webResearch(query) {
  return {
    speech: '웹조사 도구는 아직 외부 검색 API가 연결되어 있지 않아요. 지어내지 않고 그대로 말씀드려요.',
    card: {
      type: 'notice',
      text: `"${query || ''}" 관련 외부 조사가 필요합니다. 네이버 검색 API 또는 다른 검색 API 연결이 필요해요 — 진행할까요?`,
    },
  };
}

// 3. 받은편지 — 읽기만 한다. 지금은 Gmail 연동이 없다.
function inbox() {
  return {
    speech: '받은편지함 도구는 아직 메일 연동이 되어 있지 않아요.',
    card: { type: 'notice', text: 'Gmail 연동이 필요합니다 — 연결하면 누가/무슨 용건인지, 그리고 vault·고객 기록에 이미 있는 사람인지까지 확인해드려요.' },
  };
}

// 4. 오늘브리핑 — 일정, 안 읽은 것, 밀린 것. Relay의 실제 태스크/티켓 데이터를 쓴다.
function todayBriefing(ctx) {
  const { tasks = [], tickets = [] } = ctx;
  const overdueTasks = tasks.filter((t) => !t.done && t.due && t.due < todayISO());
  const todayTasks = tasks.filter((t) => !t.done && t.due === todayISO());
  const openTickets = tickets.filter((t) => t.status !== '완료' && t.status !== '닫힘');

  const parts = [];
  if (overdueTasks.length) parts.push(`기한 지난 태스크 ${overdueTasks.length}건`);
  if (todayTasks.length) parts.push(`오늘 마감 ${todayTasks.length}건`);
  if (openTickets.length) parts.push(`열린 티켓 ${openTickets.length}건`);

  const speech = parts.length
    ? `${todayKR()}, ${parts.join(', ')} 있어요.`
    : `${todayKR()}, 밀린 건 없어요.`;

  return {
    speech,
    card: {
      type: 'briefing',
      date: todayKR(),
      overdueTasks, todayTasks, openTickets,
    },
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// 5. 기억하기 — 사실 하나당 날짜 붙은 문서 하나. 무엇을 적었는지 소리 내어 말한다.
async function remember(text, ctx) {
  if (!text?.trim()) return { speech: '뒤에 기억할 내용을 붙여주세요. 예: /기억하기 6개 세트는 재구매 고객 비중이 높다', card: null };
  await ctx.rememberFn(text.trim());
  return {
    speech: `기억했습니다: "${text.trim()}"`,
    card: { type: 'notice', text: `저장됨 · ${new Date().toLocaleString('ko-KR')}` },
  };
}

// 6. 하루계획 — 다섯 개까지만. 돈이 움직이는 순서로.
function dayPlan(ctx) {
  const { tasks = [], tickets = [] } = ctx;
  const open = [
    ...tasks.filter((t) => !t.done).map((t) => ({ title: t.title, due: t.due, kind: '태스크' })),
    ...tickets.filter((t) => t.status !== '완료' && t.status !== '닫힘').map((t) => ({ title: t.title, due: t.dueDate, kind: '티켓' })),
  ];

  const scored = open.map((item) => {
    const isMoney = MONEY_KEYWORDS.some((k) => item.title.includes(k));
    const isToday = item.due === todayISO();
    const isOverdue = item.due && item.due < todayISO();
    const bucket = isMoney ? 0 : isOverdue ? 1 : isToday ? 2 : 3;
    const reason = isMoney ? '💰 돈이 움직이는 항목' : isOverdue ? '⏰ 기한 지남' : isToday ? '📅 오늘 마감' : '';
    return { ...item, bucket, reason };
  }).sort((a, b) => a.bucket - b.bucket || (a.due || '9999').localeCompare(b.due || '9999'));

  const top5 = scored.slice(0, 5);
  if (top5.length === 0) return { speech: '오늘 계획에 넣을 열린 태스크·티켓이 없어요.', card: { type: 'notice', text: '열린 항목 없음' } };

  return {
    speech: `오늘은 "${top5[0].title}"부터 시작하는 게 좋겠어요. 총 ${top5.length}개 준비했어요.`,
    card: { type: 'plan', items: top5 },
  };
}

export function detectCommand(text) {
  const trimmed = text.trim();
  const found = COMMANDS.find((c) => trimmed === c.cmd || trimmed.startsWith(c.cmd + ' '));
  if (!found) return null;
  const arg = trimmed.slice(found.cmd.length).trim();
  return { cmd: found.cmd, arg };
}

export async function runCommand(cmd, arg, ctx) {
  switch (cmd) {
    case '/노트찾기': return findNotes(arg, ctx);
    case '/웹조사': return webResearch(arg);
    case '/받은편지': return inbox();
    case '/오늘브리핑': return todayBriefing(ctx);
    case '/기억하기': return remember(arg, ctx);
    case '/하루계획': return dayPlan(ctx);
    default: return { speech: '알 수 없는 명령이에요.', card: null };
  }
}

export function buildAideSystemPrompt(profile) {
  return `당신은 ${profile.name}님의 개인 비서입니다. ${profile.name}님은 ${profile.business}.
파는 것: ${profile.products}
주요 고객: ${profile.customers}
말투: ${profile.tone}

기본은 대화입니다. "안녕", "들려?", "어떻게 생각해?" 같은 건 도구 없이 그냥 대화로 받으세요.
검색이 필요한 사실 질문에는 vault에 없는 숫자·날짜·이름을 지어내지 말고, 모르면 모른다고 말하세요.
계산한 숫자는 조건을 빼먹지 마세요 (예: 절반만 입금된 걸 할인이라 부르지 않기).
항상 한국어로, 위에 정한 말투로 간결하게 답하세요.`;
}
