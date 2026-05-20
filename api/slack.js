// Proxy Slack incoming webhooks — keeps webhook URL server-side only
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { webhookUrl, text } = req.body;
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
