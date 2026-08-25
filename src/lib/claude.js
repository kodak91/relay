// Claude Haiku API — called via Vercel serverless function (/api/claude)
// In local dev, run with `vercel dev` or set VITE_ANTHROPIC_API_KEY for direct calls
import { auth } from './firebase';

export async function claudeComplete(prompt, systemPrompt = '', model = null) {
  const idToken = await auth.currentUser?.getIdToken();   // 서버 인증용 (열린 프록시 방지)
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemPrompt, idToken, ...(model && { model }) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ? `${res.status}: ${body.error}` : 'Claude API error: ' + res.status);
  }
  const data = await res.json();
  return data.text;
}

// Slash command handlers
export const AI_COMMANDS = {
  '/오늘요약': (context) => ({
    system: '당신은 팀 업무 관리 AI입니다. 간결하고 명확하게 한국어로 답변하세요.',
    prompt: `오늘 팀 채팅 내용을 요약해주세요:\n${context}`,
  }),
  '/스케줄': (tasks) => ({
    system: '당신은 팀 업무 관리 AI입니다. 간결하고 명확하게 한국어로 답변하세요.',
    prompt: `다음 태스크 목록에서 오늘/이번 주 마감 항목을 정리해주세요:\n${tasks}`,
  }),
  '/날씨': () => ({
    system: '당신은 팀 업무 관리 AI입니다.',
    prompt: '오늘 날씨 정보를 한국어로 간략히 알려주세요. (실제 날씨 API 연동 전 임시 응답)',
  }),
};

export const AI_ACTIONS = [
  {
    id: 'polish',
    icon: '✨',
    title: '정중하게 다듬기',
    desc: '// 로 시작해도 같음',
    getPrompt: (text) => `다음 메시지를 한국어로 정중하고 자연스러운 비즈니스 톤으로 다시 써주세요. 의미는 유지하고 길이는 비슷하게. 메시지 본문만 출력:\n\n"${text}"`,
  },
  {
    id: 'shorten',
    icon: '📝',
    title: '한 줄로 요약',
    desc: '긴 글을 핵심만',
    getPrompt: (text) => `다음 메시지를 한국어로 한 줄(최대 60자)로 요약. 본문만 출력:\n\n"${text}"`,
  },
  {
    id: 'expand',
    icon: '📋',
    title: '결정 요청 형식으로',
    desc: '옵션 비교 메시지로',
    getPrompt: (text) => `다음 내용을 결정 요청 형식으로 재구성. 짧은 제목 + 2~3개 옵션 (A, B, C로):\n[제목] ...\nA. ...\nB. ...\n본문만 출력:\n\n"${text}"`,
  },
  {
    id: 'translate',
    icon: '🌐',
    title: '영어로 번역',
    desc: '자연스러운 비즈니스 영어',
    getPrompt: (text) => `다음을 자연스러운 비즈니스 영어로 번역. 영어 본문만 출력:\n\n"${text}"`,
  },
  {
    id: 'action',
    icon: '✓',
    title: '액션 아이템 뽑기',
    desc: '할 일 + 담당자 형식',
    getPrompt: (text) => `다음 메시지에서 액션 아이템을 추출해 "- [담당 추정] 할 일 (마감 추정)" 형식으로 출력:\n\n"${text}"`,
  },
];
