// Vercel Cron: every Tuesday 09:00 KST (Monday 00:00 UTC)
// Reads /보고 messages from the past week, summarizes via Claude, stores in weeklyReports/{yyyyWW}

const CRON_SECRET = process.env.CRON_SECRET;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;

function getWeekLabel(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}W${String(week).padStart(2, '0')}`;
}

async function firestoreGet(path) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}?key=${FIREBASE_API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Firestore GET ${path}: ${r.status}`);
  return r.json();
}

async function firestoreQuery(collectionPath, filters = []) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: collectionPath.split('/').pop(), allDescendants: false }],
      where: filters.length === 1 ? filters[0] : (filters.length > 1 ? {
        compositeFilter: { op: 'AND', filters },
      } : undefined),
    },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Firestore query ${collectionPath}: ${r.status}`);
  return r.json();
}

async function firestoreSet(path, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}?key=${FIREBASE_API_KEY}`;
  // Convert JS object to Firestore document fields
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map((s) => ({ stringValue: String(s) })) } };
    }
  }
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Firestore set ${path}: ${r.status}`);
  return r.json();
}

function extractString(fieldVal) {
  if (!fieldVal) return '';
  return fieldVal.stringValue || fieldVal.integerValue || '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret if configured
  if (CRON_SECRET) {
    const provided = req.headers['x-cron-secret'] || req.query?.secret;
    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY) {
    return res.status(500).json({ error: 'Firebase config missing (VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_API_KEY)' });
  }
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const now = new Date();
  const weekLabel = getWeekLabel(now);

  // Date range: past 7 days
  const endDate = now.toISOString();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. List all projects
    const projectsDoc = await firestoreGet('projects');
    const projects = projectsDoc.documents || [];

    // 2. Collect all 'update' type messages from the past week
    const updates = [];
    for (const p of projects) {
      const projectId = p.name?.split('/').pop();
      const projectName = extractString(p.fields?.name);
      if (!projectId) continue;
      try {
        const msgs = await firestoreQuery(`projects/${projectId}/messages`, [
          {
            fieldFilter: {
              field: { fieldPath: 'type' },
              op: 'EQUAL',
              value: { stringValue: 'update' },
            },
          },
        ]);
        for (const doc of msgs) {
          if (!doc.document) continue;
          const fields = doc.document.fields || {};
          const createdAt = extractString(fields.createdAt);
          if (createdAt >= startDate && createdAt <= endDate) {
            updates.push({
              project: projectName,
              sender: extractString(fields.senderName),
              text: extractString(fields.text),
              ts: extractString(fields.ts),
            });
          }
        }
      } catch { /* skip project if query fails */ }
    }

    if (updates.length === 0) {
      return res.status(200).json({ ok: true, weekLabel, message: '이번 주 중간보고 없음' });
    }

    // 3. Summarize with Claude
    const context = updates
      .map((u) => `[${u.project}] ${u.sender} (${u.ts}): ${u.text}`)
      .join('\n\n');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: '당신은 팀 업무 주간 보고서를 작성하는 AI입니다. 한국어로 간결하고 구조화된 요약을 작성하세요.',
        messages: [{
          role: 'user',
          content: `다음은 지난 한 주간의 팀 중간보고 목록입니다. 프로젝트별로 주요 진행사항을 요약하고 핵심 성과와 이슈를 정리해주세요:\n\n${context}`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      throw new Error('Claude API error: ' + claudeRes.status);
    }
    const claudeData = await claudeRes.json();
    const summary = claudeData.content?.[0]?.text || '';

    // 4. Store result in weeklyReports/{yyyyWW}
    await firestoreSet(`weeklyReports/${weekLabel}`, {
      weekLabel,
      summary,
      updateCount: updates.length,
      generatedAt: now.toISOString(),
    });

    return res.status(200).json({ ok: true, weekLabel, updateCount: updates.length });
  } catch (err) {
    console.error('Weekly report error:', err);
    return res.status(500).json({ error: err.message });
  }
}
