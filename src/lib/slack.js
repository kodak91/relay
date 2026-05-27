// Normalize text before sending to Slack — handles Tiptap markdown hard breaks and literal \n sequences
function normalizeSlackText(text) {
  return (text || '')
    .replace(/\\\n/g, '\n')  // markdown hard break (backslash + newline) → plain newline
    .replace(/\\n/g, '\n');  // literal two-char sequence \n → actual newline
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
