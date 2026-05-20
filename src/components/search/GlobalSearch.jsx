import { useState, useEffect, useMemo, useRef } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useGlobalTasks } from '../../hooks/useGlobalTasks';
import useAppStore from '../../store/appStore';

const TYPE_LABELS = {
  text: '채팅', approval: '승인', decision: '결정', vote: '투표',
  update: '보고', announce: '공지', meeting: '회의', image: '이미지', file: '파일',
};

export default function GlobalSearch({ isOpen, onClose, projects, onJumpToMessage }) {
  const { activeProject, setChatTab } = useAppStore();
  const { messages } = useMessages(activeProject);
  const { tasks } = useGlobalTasks(projects);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const q = query.trim().toLowerCase();

  const matchedMessages = useMemo(() => {
    if (!q) return [];
    return messages
      .filter((m) =>
        m.text?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q) ||
        m.senderName?.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [messages, q]);

  const matchedTasks = useMemo(() => {
    if (!q) return [];
    return tasks.filter((t) => t.title?.toLowerCase().includes(q)).slice(0, 6);
  }, [tasks, q]);

  if (!isOpen) return null;

  const handleMsgClick = (m) => {
    setChatTab('chat');
    onJumpToMessage(m.id);
    onClose();
  };

  const hasResults = matchedMessages.length > 0 || matchedTasks.length > 0;

  return (
    <div className="gsearch-overlay" onClick={onClose}>
      <div className="gsearch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gsearch-input-wrap">
          <span style={{ fontSize: 16, color: 'var(--ink-3)', flexShrink: 0 }}>⌕</span>
          <input
            ref={inputRef}
            className="gsearch-input"
            placeholder="메시지·태스크 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="gsearch-esc" onClick={onClose}>Esc</kbd>
        </div>
        <div className="gsearch-results">
          {!q && (
            <div className="gsearch-empty">검색어를 입력하세요</div>
          )}
          {q && !hasResults && (
            <div className="gsearch-empty">검색 결과가 없습니다</div>
          )}
          {matchedMessages.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-hd">💬 메시지 — {activeProject ? '현재 워크스페이스' : '워크스페이스를 선택하세요'}</div>
              {matchedMessages.map((m) => (
                <div key={m.id} className="gsearch-item" onClick={() => handleMsgClick(m)}>
                  <span className="gsearch-tag">{TYPE_LABELS[m.type] || m.type}</span>
                  <div className="gsearch-item-body">
                    <div className="gsearch-item-text">{m.title || m.text?.slice(0, 80) || '(내용 없음)'}</div>
                    <div className="gsearch-item-meta">{m.senderName}{m.ts ? ` · ${m.ts}` : ''}</div>
                  </div>
                  <span className="gsearch-item-arrow">→</span>
                </div>
              ))}
            </div>
          )}
          {matchedTasks.length > 0 && (
            <div className="gsearch-section">
              <div className="gsearch-section-hd">📋 태스크</div>
              {matchedTasks.map((t) => (
                <div key={t.id} className={'gsearch-item' + (t.done ? ' done' : '')}>
                  <span className="gsearch-tag task">태스크</span>
                  <div className="gsearch-item-body">
                    <div className="gsearch-item-text">{t.title}</div>
                    <div className="gsearch-item-meta">{t.projectName}{t.done ? ' · 완료' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="gsearch-footer">
          <span>↑↓ 탐색</span>
          <span>Enter 이동</span>
          <span>Esc 닫기</span>
        </div>
      </div>
    </div>
  );
}
