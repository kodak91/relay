// Vercel Cron: every Tuesday 09:00 KST (Monday 00:00 UTC)
// Reads 'update' type messages from the past week, summarizes via Claude, stores in weeklyReports/{yyyyWW}
//
// ⚠️ 서버 전용 배치 작업이라 사용자 idToken 이 없다. Firebase Admin SDK(서비스 계정)로 접근해
//    보안 규칙을 우회(권한 있는 서버 접근)한다. — 기존 REST+API키 방식은 규칙에 막혀 동작 불가였음.
//
// 필요한 환경변수(Vercel):
//   FIREBASE_SERVICE_ACCOUNT — 서비스 계정 키 JSON 전문(문자열). Firebase 콘솔 > 프로젝트 설정 >
//     서비스 계정 > 새 비공개 키 생성 으로 받은 JSON 을 그대로 붙여넣기.
//   ANTHROPIC_API_KEY, (선택) CRON_SECRET

import admin from 'firebase-admin';

const CRON_SECRET = process.env.CRON_SECRET;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Admin SDK 초기화 — 서버리스 재호출 간 중복 초기화 방지
function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 설정되지 않았습니다.');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

function getWeekLabel(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}W${String(week).padStart(2, '0')}`;
}

// createdAt 이 Firestore Timestamp 이든 ISO 문자열이든 ISO 문자열로 정규화
function toIso(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString(); // Timestamp
  return '';
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

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const now = new Date();
  const weekLabel = getWeekLabel(now);
  const endDate = now.toISOString();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const db = getDb();

    // 1. 전체 워크스페이스
    const projectsSnap = await db.collection('projects').get();

    // 2. 지난 한 주간 'update' 타입 메시지 수집
    const updates = [];
    for (const p of projectsSnap.docs) {
      const projectName = p.get('name') || '';
      try {
        const msgsSnap = await db
          .collection(`projects/${p.id}/messages`)
          .where('type', '==', 'update')
          .get();
        for (const m of msgsSnap.docs) {
          const createdAt = toIso(m.get('createdAt'));
          if (createdAt && createdAt >= startDate && createdAt <= endDate) {
            updates.push({
              project: projectName,
              sender: m.get('senderName') || '',
              text: m.get('text') || '',
              ts: m.get('ts') || '',
            });
          }
        }
      } catch { /* 개별 워크스페이스 쿼리 실패는 건너뜀 */ }
    }

    if (updates.length === 0) {
      return res.status(200).json({ ok: true, weekLabel, message: '이번 주 중간보고 없음' });
    }

    // 3. Claude 요약
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

    // 4. 결과 저장 — weeklyReports/{yyyyWW}
    await db.collection('weeklyReports').doc(weekLabel).set({
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
