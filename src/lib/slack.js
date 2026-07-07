// Tiptap/CommonMark 마크다운 → Slack mrkdwn 변환.
// Slack 은 #헤딩 / **볼드** / [링크](url) 를 지원하지 않으므로 mrkdwn 문법으로 바꾼다.
// 또한 Tiptap 직렬화가 넣는 백슬래시 이스케이프(\#, \*, 1\. 등)를 제거한다.
const BOLD_MARK = String.fromCharCode(1); // **볼드** → *볼드* 변환용 임시 마커(사용자 입력에 없는 제어문자)

function normalizeSlackText(text) {
  let t = (text || '')
    .replace(/\\\n/g, '\n')   // 마크다운 하드브레이크(백슬래시+개행) → 개행
    .replace(/\\n/g, '\n')    // 리터럴 "\n" 2글자 → 개행
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1'); // 직렬화 이스케이프 제거

  t = t
    .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, BOLD_MARK + '$1' + BOLD_MARK) // #헤딩 → 굵게(임시 마커)
    .replace(/~~(.+?)~~/g, '~$1~')                                // ~~취소선~~ → ~취소선~
    .replace(/\*\*(.+?)\*\*/g, BOLD_MARK + '$1' + BOLD_MARK)      // **굵게** → 임시 마커
    .replace(/__(.+?)__/g, BOLD_MARK + '$1' + BOLD_MARK)          // __굵게__ → 임시 마커
    .replace(/\*([^*\n]+?)\*/g, '_$1_')                           // *기울임* → _기울임_
    .replace(new RegExp(BOLD_MARK, 'g'), '*')                     // 임시 마커 → *굵게*(mrkdwn)
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')                          // 불릿 → •
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');              // [텍스트](url) → <url|텍스트>
  return t;
}

export async function postToSlack(webhookUrl, text) {
  const res = await fetch('/api/slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl, text: normalizeSlackText(text) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Slack 전송 실패');
  }
  return true;
}

// Bot token based: post (returns ts), update, delete
export async function slackBotPost(botToken, channel, text) {
  const res = await fetch('/api/slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'post', botToken, channel, text: normalizeSlackText(text) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Slack 전송 실패');
  }
  const data = await res.json();
  return data.ts;
}

export async function slackBotUpdate(botToken, channel, ts, text) {
  const res = await fetch('/api/slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update', botToken, channel, ts, text: normalizeSlackText(text) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Slack 업데이트 실패');
  }
  return true;
}

export async function slackBotDelete(botToken, channel, ts) {
  const res = await fetch('/api/slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', botToken, channel, ts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Slack 삭제 실패');
  }
  return true;
}
