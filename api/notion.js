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
    let r;
    if (action === 'page') {
      r = await fetch(`${NOTION_API}/pages/${id}`, { headers });
    } else if (action === 'blocks') {
      r = await fetch(`${NOTION_API}/blocks/${id}/children?page_size=100`, { headers });
    } else if (action === 'database') {
      r = await fetch(`${NOTION_API}/databases/${id}`, { headers });
    } else if (action === 'database_query') {
      r = await fetch(`${NOTION_API}/databases/${id}/query`, {
        method: 'POST', headers,
        body: JSON.stringify({ page_size: 100 }),
      });
    } else if (action === 'update_block') {
      const { blockType, richText, checked } = req.body;
      const patch = { [blockType]: { rich_text: richText } };
      if (blockType === 'to_do') patch.to_do.checked = !!checked;
      r = await fetch(`${NOTION_API}/blocks/${id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify(patch),
      });
    } else if (action === 'append_blocks') {
      r = await fetch(`${NOTION_API}/blocks/${id}/children`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ children: req.body.children }),
      });
    } else if (action === 'delete_block') {
      r = await fetch(`${NOTION_API}/blocks/${id}`, { method: 'DELETE', headers });
      if (r.status === 200) return res.status(200).json({ ok: true });
    } else {
      return res.status(400).json({ error: '알 수 없는 action입니다.' });
    }

    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
