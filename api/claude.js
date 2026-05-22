// Vercel serverless function — proxies Claude API
// Keeps the Anthropic API key server-side only

const MAX_INPUT_CHARS = 60000;
const MAX_OUTPUT_TOKENS = 4096;
const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, systemPrompt, model } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  if (prompt.length > MAX_INPUT_CHARS) {
    return res.status(413).json({
      error: `입력이 너무 깁니다. 최대 ${MAX_INPUT_CHARS.toLocaleString()}자까지 허용됩니다 (현재 ${prompt.length.toLocaleString()}자).`,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const selectedModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt || '당신은 팀 협업 툴 Relay의 AI 어시스턴트입니다. 항상 한국어로 간결하게 답변하세요.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
