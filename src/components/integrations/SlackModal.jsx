import { useState } from 'react';
import { postToSlack } from '../../lib/slack';
import { useProjects } from '../../hooks/useProjects';

export default function SlackModal({ project, onClose }) {
  const { updateProject } = useProjects();
  const [url, setUrl] = useState(project?.slackWebhook || '');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setTestMsg('');
    try {
      await postToSlack(url.trim(), `🔔 *Relay 연동 테스트* — [${project?.name || '워크스페이스'}]\n/보고 메시지가 이 채널로 전송됩니다.`);
      setTestMsg('✓ 전송 성공');
    } catch (e) {
      setTestMsg('⚠️ ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!project?.id) return;
    setSaving(true);
    await updateProject(project.id, { slackWebhook: url.trim() || null });
    setSaving(false);
    onClose();
  };

  const handleDisconnect = async () => {
    if (!project?.id) return;
    await updateProject(project.id, { slackWebhook: null });
    onClose();
  };

  return (
    <div className="drive-modal-wrap" onClick={onClose}>
      <div className="slack-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drive-modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="slack-ico">S</span>
            <span>Slack 연동 설정</span>
          </div>
          <button onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Incoming Webhook URL</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12, lineHeight: 1.6 }}>
            Slack → 워크스페이스 → 앱 → Incoming Webhooks에서 URL을 생성 후 붙여넣으세요.<br />
            <b>/보고</b> 메시지 전송 시 이 채널로 자동 전달됩니다.
          </div>

          <input
            style={{
              width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)',
              padding: '8px 10px', fontSize: 13, background: 'var(--surface)',
              outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)',
            }}
            placeholder="https://hooks.slack.com/services/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />

          {testMsg && (
            <div style={{
              marginTop: 8, fontSize: 12, padding: '6px 10px', borderRadius: 'var(--r-2)',
              background: testMsg.startsWith('✓') ? 'var(--emerald-bg)' : 'var(--rose-bg)',
              color: testMsg.startsWith('✓') ? 'var(--emerald)' : 'var(--rose)',
              border: `1px solid ${testMsg.startsWith('✓') ? 'var(--emerald-line)' : 'var(--rose-line)'}`,
            }}>
              {testMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn sm" onClick={handleTest} disabled={!url.trim() || testing}>
              {testing ? '전송 중…' : '테스트'}
            </button>
            <button className="btn accent sm" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
            {project?.slackWebhook && (
              <button className="btn sm" style={{ marginLeft: 'auto', color: 'var(--rose)' }} onClick={handleDisconnect}>
                연동 해제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
