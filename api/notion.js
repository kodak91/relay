const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VER = '2022-06-28';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, id, token } = req.body || {};
  if (!token || !id || !action) {
    return res.status(400).json({ error: 'token, id, action 파라미터가 필요합니다.' });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VER,
    'Content-Type': 'application/json',
  };

  try {
    let url;
    if (action === 'page') {
      url = `${NOTION_API}/pages/${id}`;
    } else if (action === 'blocks') {
      url = `${NOTION_API}/blocks/${id}/children?page_size=100`;
    } else {
      return res.status(400).json({ error: '알 수 없는 action입니다.' });
    }

    const r = await fetch(url, { headers });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
