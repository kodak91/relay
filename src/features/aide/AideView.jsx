import { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import useAppStore from '../../store/appStore';
import { useTasks } from '../../hooks/useTasks';
import { useTickets } from '../../hooks/useTickets';
import { useAideMemory } from '../../hooks/useAideMemory';
import { claudeComplete } from '../../lib/claude';
import GraphCanvas from './GraphCanvas';
import { useVoiceCapture } from './voice';
import {
  fsAccessSupported, indexVault, saveVaultHandle, loadVaultHandle,
  verifyVaultPermission, requestVaultPermission,
} from './vaultIndex';
import { DEFAULT_PROFILE, COMMANDS, detectCommand, runCommand, buildAideSystemPrompt } from './tools';

function nowHM() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

export default function AideView() {
  const { activeProject, user, setActiveChannel } = useAppStore();
  const { tasks } = useTasks(activeProject);
  const { tickets } = useTickets(activeProject);
  const { memories, profile, remember, saveProfile } = useAideMemory(activeProject);

  const [dirHandle, setDirHandle] = useState(null);
  const [vault, setVault] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [vaultError, setVaultError] = useState(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const [filterKinds, setFilterKinds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);

  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', ts: nowHM(), text: `안녕하세요, ${(profile || DEFAULT_PROFILE).name}님. 무엇을 도와드릴까요?` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const scrollRef = useRef(null);

  const profileData = profile || DEFAULT_PROFILE;

  // ── vault 연결: 저장된 핸들이 있으면 조용히 권한만 확인, 없으면 버튼을 눌러야 함 ──
  useEffect(() => {
    (async () => {
      const handle = await loadVaultHandle().catch(() => null);
      if (!handle) return;
      setDirHandle(handle);
      const granted = await verifyVaultPermission(handle);
      if (granted) runIndex(handle);
      else setNeedsReconnect(true);
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatHistory]);

  async function runIndex(handle) {
    setConnecting(true);
    setVaultError(null);
    try {
      const result = await indexVault(handle);
      setVault(result);
      setFilterKinds(new Set(Object.keys(result.counts)));
      setNeedsReconnect(false);
    } catch (e) {
      setVaultError('색인 중 문제가 생겼어요: ' + e.message);
    } finally {
      setConnecting(false);
    }
  }

  async function connectVault() {
    if (!fsAccessSupported()) {
      setVaultError('이 브라우저는 폴더 접근을 지원하지 않아요. Chrome이나 Edge를 사용해주세요.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker();
      await saveVaultHandle(handle);
      setDirHandle(handle);
      await runIndex(handle);
    } catch (e) {
      if (e.name !== 'AbortError') setVaultError('폴더 접근에 실패했어요: ' + e.message);
    }
  }

  async function reconnectVault() {
    if (!dirHandle) return connectVault();
    const ok = await requestVaultPermission(dirHandle);
    if (ok) runIndex(dirHandle);
    else setVaultError('권한을 허용해야 vault를 읽을 수 있어요.');
  }

  const voiceCap = useVoiceCapture({
    disabled: loading,
    onTranscript: (text) => {
      if (text) { handleSend(text); return; }
      setChatHistory((h) => [...h, {
        role: 'ai', ts: nowHM(),
        text: '🎙 녹음과 무음 감지는 됐지만, 아직 음성을 글자로 바꾸는 엔진이 연결되어 있지 않아요. 화면 카드로만 계속 도와드릴게요.',
      }]);
    },
  });

  const filteredNodes = useMemo(
    () => (vault ? vault.nodes.filter((n) => filterKinds.has(n.kind)) : []),
    [vault, filterKinds]
  );
  const filteredIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => (vault ? vault.edges.filter((e) => filteredIds.has(e.source) && filteredIds.has(e.target)) : []),
    [vault, filteredIds]
  );

  const selectedNote = selectedId && vault ? vault.notesById.get(selectedId) : null;

  const toolCtx = { vault, tasks, tickets, rememberFn: remember };

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setChatHistory((h) => [...h, { role: 'user', text, ts: nowHM() }]);
    setLoading(true);

    try {
      const parsed = detectCommand(text);
      if (parsed) {
        const result = await runCommand(parsed.cmd, parsed.arg, toolCtx);
        setChatHistory((h) => [...h, { role: 'ai', ts: nowHM(), text: result.speech, card: result.card }]);
      } else {
        const history = chatHistory.slice(-10)
          .map((m) => `${m.role === 'user' ? '사용자' : '비서'}: ${m.text}`).join('\n');
        const memoryDigest = memories.slice(0, 10).map((m) => `- ${m.text}`).join('\n');
        const prompt = `${history ? `=== 최근 대화 ===\n${history}\n\n` : ''}${memoryDigest ? `=== 기억해둔 것 ===\n${memoryDigest}\n\n` : ''}사용자: ${text}`;
        const res = await claudeComplete(prompt, buildAideSystemPrompt(profileData), 'claude-haiku-4-5-20251001');
        setChatHistory((h) => [...h, { role: 'ai', ts: nowHM(), text: res }]);
      }
    } catch (err) {
      setChatHistory((h) => [...h, { role: 'ai', ts: nowHM(), text: `연결에 실패했어요: ${err.message}`, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  if (!activeProject) {
    return (
      <main className="col-main" style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <div style={{ color: 'var(--ink-mute)', fontSize: 14 }}>워크스페이스를 먼저 선택하세요.</div>
      </main>
    );
  }
  if (user?.role !== 'lead') {
    return (
      <main className="col-main" style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
        <div style={{ color: 'var(--ink-mute)', fontSize: 14 }}>개인 비서는 팀장 전용 화면입니다.</div>
      </main>
    );
  }

  return (
    <main className="col-main aide-view">
      <div className="chat-head" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-line)' }}>
        <button className="btn ghost sm" onClick={() => setActiveChannel('chat')} title="채팅으로">←</button>
        <span className="ai-dot" />
        <span style={{ fontWeight: 700, color: 'var(--accent)', marginLeft: 8 }}>개인 비서</span>
        <span style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.7, marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
          {profileData.name}님 전용
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {vault && (
            <span style={{ fontSize: 11, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>
              노트 {vault.nodes.length} · 링크 {vault.edges.length}
            </span>
          )}
          <button className="btn ghost sm" onClick={() => setShowProfileEditor((v) => !v)}>⚙ 프로필</button>
        </span>
      </div>

      {showProfileEditor && (
        <ProfileEditor profile={profileData} onSave={(d) => { saveProfile(d); setShowProfileEditor(false); }} onClose={() => setShowProfileEditor(false)} />
      )}

      <div className="aide-body">
        <aside className="aide-left">
          {selectedNote ? (
            <div className="aide-inspector">
              <div className="aide-inspector-label">INSPECTOR</div>
              <strong>{selectedNote.title}</strong>
              <div className="aide-inspector-path">{selectedNote.path}</div>
              <div className="aide-tag-row">
                {selectedNote.tags.map((t) => <span key={t} className="tag-chip">#{t}</span>)}
              </div>
              <div className="aide-inspector-text">{(selectedNote.text || '').slice(0, 600) || '(내용 없음 — PDF는 미리보기를 지원하지 않아요)'}</div>
            </div>
          ) : (
            <div className="aide-inspector muted">그래프에서 노트를 클릭하면 여기에 열립니다.</div>
          )}

          {vault && (
            <div className="aide-hubs">
              <div className="aide-inspector-label">TOP HUBS</div>
              {vault.topHubs.map((n) => (
                <div key={n.id} className="aide-hub-row" onClick={() => setSelectedId(n.id)}>
                  <span>{n.title}</span>
                  <span className="aide-hub-count">{n.degree}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="aide-center">
          {!vault ? (
            <VaultConnectPrompt
              connecting={connecting}
              error={vaultError}
              needsReconnect={needsReconnect}
              onConnect={connectVault}
              onReconnect={reconnectVault}
            />
          ) : (
            <GraphCanvas nodes={filteredNodes} edges={filteredEdges} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>

        <aside className="aide-right">
          <div className="aide-inspector-label">FILTER</div>
          {vault ? Object.entries(vault.counts).map(([kind, count]) => (
            <label key={kind} className="aide-filter-row">
              <input
                type="checkbox"
                checked={filterKinds.has(kind)}
                onChange={() => setFilterKinds((prev) => {
                  const n = new Set(prev);
                  n.has(kind) ? n.delete(kind) : n.add(kind);
                  return n;
                })}
              />
              <span>{kind}</span>
              <span className="aide-hub-count">{count}</span>
            </label>
          )) : <div className="muted" style={{ fontSize: 12 }}>vault 연결 후 표시됩니다.</div>}

          <div className="aide-status">
            <span className={'aide-status-dot ' + (voiceCap.recording ? 'listening' : loading ? 'thinking' : 'idle')} />
            <span>{voiceCap.recording ? '듣는 중' : loading ? '생각 중' : '대기'}</span>
          </div>
          {voiceCap.recording && (
            <div className="aide-level-bar"><div style={{ width: `${Math.min(100, voiceCap.level * 400)}%` }} /></div>
          )}
          {voiceCap.error && <div className="aide-notice">{voiceCap.error}</div>}
        </aside>
      </div>

      <div className="ai-chat-scroll aide-chat" ref={scrollRef} style={{ maxHeight: 220 }}>
        {chatHistory.map((msg, i) => (
          <div key={i} className={'ai-msg ' + msg.role}>
            {msg.role === 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div className="av" style={{ width: 24, height: 24, background: 'oklch(0.45 0.20 280)', fontSize: 10 }}>✦</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>비서</span>
                <span className="ai-msg-ts">{msg.ts}</span>
              </div>
            )}
            <div className={'ai-msg-bubble' + (msg.error ? ' error' : '')} style={msg.error ? { background: 'var(--rose-bg)', color: 'var(--rose)', border: '1px solid var(--rose-line)' } : {}}>
              {msg.role === 'ai' && !msg.error
                ? <div className="md-content ai-md"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{msg.text}</ReactMarkdown></div>
                : <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.text}</pre>}
            </div>
            {msg.card && <ToolCard card={msg.card} onOpenNote={setSelectedId} />}
          </div>
        ))}
        {loading && <span className="ai-typing"><span /><span /><span /></span>}
      </div>

      <div className="ai-commands">
        {COMMANDS.map((c) => (
          <button key={c.cmd} className="ai-cmd-chip" onClick={() => !c.needsArg && handleSend(c.cmd)} title={c.desc}>
            {c.cmd}
          </button>
        ))}
      </div>

      <div className="ai-composer">
        <button
          className={'btn sm' + (voiceCap.recording ? ' accent' : ' ghost')}
          onClick={voiceCap.toggle}
          title="마이크 (스페이스/ESC로 중지)"
        >
          🎙
        </button>
        <input
          placeholder="질문하거나 /노트찾기, /오늘브리핑 같은 명령을 써보세요…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={loading}
        />
        <button className="btn accent" onClick={() => handleSend()} disabled={!input.trim() || loading}>전송</button>
      </div>
    </main>
  );
}

function VaultConnectPrompt({ connecting, error, needsReconnect, onConnect, onReconnect }) {
  return (
    <div className="aide-connect">
      <p>옵시디언 vault 폴더를 선택하면 노트를 그래프로 색인해요.<br />폴더 내용은 이 브라우저 안에만 있고, 서버로 올라가지 않아요.</p>
      {needsReconnect ? (
        <button className="btn accent" onClick={onReconnect} disabled={connecting}>{connecting ? '연결 중…' : '다시 연결'}</button>
      ) : (
        <button className="btn accent" onClick={onConnect} disabled={connecting}>{connecting ? '색인 중…' : '옵시디언 폴더 선택'}</button>
      )}
      {error && <div className="aide-notice">{error}</div>}
    </div>
  );
}

function ToolCard({ card, onOpenNote }) {
  if (!card) return null;
  if (card.type === 'notice') return <div className="aide-card notice">{card.text}</div>;
  if (card.type === 'notes') return (
    <div className="aide-card">
      {card.items.map((h) => (
        <div key={h.path} className="aide-card-row" onClick={() => onOpenNote(h.path)}>
          <strong>{h.title}</strong>
          <span className="aide-card-path">{h.path}</span>
          {h.snippet && <div className="aide-card-snippet">…{h.snippet}…</div>}
        </div>
      ))}
    </div>
  );
  if (card.type === 'briefing') return (
    <div className="aide-card">
      <div>{card.date}</div>
      {card.overdueTasks.map((t) => <div key={t.id} className="aide-card-row rose">⏰ {t.title}</div>)}
      {card.todayTasks.map((t) => <div key={t.id} className="aide-card-row">📅 {t.title}</div>)}
      {card.openTickets.map((t) => <div key={t.id} className="aide-card-row">🎫 {t.title} ({t.status})</div>)}
    </div>
  );
  if (card.type === 'plan') return (
    <div className="aide-card">
      {card.items.map((it, i) => (
        <div key={i} className="aide-card-row">
          {i + 1}. {it.title} {it.reason && <span className="aide-card-tag">{it.reason}</span>}
        </div>
      ))}
    </div>
  );
  return null;
}

function ProfileEditor({ profile, onSave, onClose }) {
  const [form, setForm] = useState(profile);
  return (
    <div className="aide-profile-editor">
      {['name', 'business', 'products', 'customers', 'tone'].map((key) => (
        <label key={key} className="aide-profile-field">
          <span>{key}</span>
          <input value={form[key] || ''} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn accent sm" onClick={() => onSave(form)}>저장</button>
        <button className="btn ghost sm" onClick={onClose}>취소</button>
      </div>
    </div>
  );
}
