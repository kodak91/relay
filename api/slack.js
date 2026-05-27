// Proxy for Slack API — keeps tokens server-side only
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, webhookUrl, botToken, channel, ts, text } = req.body;

  // Bot token actions: post (returns ts), update, delete
  if (action === 'post') {
    if (!botToken || !channel || !text) return res.status(400).json({ error: 'botToken, channel, text required' });
    try {
      const r = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ channel, text, mrkdwn: true }),
      });
      const data = await r.json();
      if (!data.ok) return res.status(400).json({ error: data.error || 'Slack API error' });
      return res.status(200).json({ ok: true, ts: data.ts });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'update') {
    if (!botToken || !channel || !ts || !text) return res.status(400).json({ error: 'botToken, channel, ts, text required' });
    try {
      const r = await fetch('https://slack.com/api/chat.update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ channel, ts, text, mrkdwn: true }),
      });
      const data = await r.json();
      if (!data.ok) return res.status(400).json({ error: data.error || 'Slack API error' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'delete') {
    if (!botToken || !channel || !ts) return res.status(400).json({ error: 'botToken, channel, ts required' });
    try {
      const r = await fetch('https://slack.com/api/chat.delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ channel, ts }),
      });
      const data = await r.json();
      if (!data.ok) return res.status(400).json({ error: data.error || 'Slack API error' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Default: incoming webhook (no ts tracking)
  if (!webhookUrl || !text) return res.status(400).json({ error: 'webhookUrl and text required' });
  if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
    return res.status(400).json({ error: 'Invalid Slack webhook URL' });
  }

  try {
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Slack error: ' + (await r.text()) });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
