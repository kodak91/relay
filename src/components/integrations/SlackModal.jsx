import { useState } from 'react';
import { postToSlack } from '../../lib/slack';
import { useProjects } from '../../hooks/useProjects';

export default function SlackModal({ project, onClose }) {
  const { updateProject } = useProjects();
  const [url, setUrl] = useState(project?.slackWebhook || '');
  const [botToken, setBotToken] = useState(project?.slackBotToken || '');
  const [botChannel, setBotChannel] = useState(project?.slackChannel || '');
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
    await updateProject(project.id, {
      slackWebhook: url.trim() || null,
      slackBotToken: botToken.trim() || null,
      slackChannel: botChannel.trim() || null,
    });
    setSaving(false);
    onClose();
  };

  const handleDisconnect = async () => {
    if (!project?.id) return;
    await updateProject(project.id, { slackWebhook: null, slackBotToken: null, slackChannel: null });
    onClose();
  };

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-2)',
    padding: '8px 10px', fontSize: 13, background: 'var(--surface)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)',
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

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Incoming Webhook URL</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8, lineHeight: 1.6 }}>
              Slack → 앱 → Incoming Webhooks에서 URL 생성 후 붙여넣으세요.<br />
              <b>/보고</b> 전송 시 이 채널로 자동 전달됩니다.
            </div>
            <input
              style={inputStyle}
              placeholder="https://hooks.slack.com/services/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Bot Token (편집·삭제 동기화)</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8, lineHeight: 1.6 }}>
              Slack Bot Token (<code>xoxb-…</code>)을 입력하면 Relay에서 편집·삭제 시 Slack 메시지도 자동으로 반영됩니다.
            </div>
            <input
              style={{ ...inputStyle, marginBottom: 8 }}
              placeholder="xoxb-..."
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              type="password"
              autoComplete="off"
            />
            <input
              style={inputStyle}
              placeholder="채널 ID (예: C1234567890)"
              value={botChannel}
              onChange={(e) => setBotChannel(e.target.value)}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              채널 ID는 Slack에서 채널 이름 우클릭 → 채널 세부정보에서 확인
            </div>
          </div>

          {testMsg && (
            <div style={{
              fontSize: 12, padding: '6px 10px', borderRadius: 'var(--r-2)',
              background: testMsg.startsWith('✓') ? 'var(--emerald-bg)' : 'var(--rose-bg)',
              color: testMsg.startsWith('✓') ? 'var(--emerald)' : 'var(--rose)',
              border: `1px solid ${testMsg.startsWith('✓') ? 'var(--emerald-line)' : 'var(--rose-line)'}`,
            }}>
              {testMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={handleTest} disabled={!url.trim() || testing}>
              {testing ? '전송 중…' : '테스트'}
            </button>
            <button className="btn accent sm" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
            {(project?.slackWebhook || project?.slackBotToken) && (
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
