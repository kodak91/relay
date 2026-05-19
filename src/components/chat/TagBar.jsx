import useAppStore from '../../store/appStore';

const DEFAULT_TAGS = [
  { id: 'all', name: '전체' },
  { id: 'print', name: '#인쇄' },
  { id: 'design', name: '#디자인' },
  { id: 'logi', name: '#물류' },
  { id: 'money', name: '#발주' },
  { id: 'meet', name: '#회의' },
];

export default function TagBar({ messages = [] }) {
  const { activeTag, setActiveTag } = useAppStore();

  // Build tag counts from actual messages
  const tagCounts = {};
  messages.forEach((m) => {
    (m.tags || []).forEach((t) => {
      const found = DEFAULT_TAGS.find((dt) => dt.name === t);
      if (found) tagCounts[found.id] = (tagCounts[found.id] || 0) + 1;
    });
  });

  const tags = DEFAULT_TAGS.map((t) => ({
    ...t,
    count: t.id === 'all' ? messages.length : (tagCounts[t.id] || 0),
  }));

  return (
    <div className="tag-bar">
      <span className="label">태그 필터</span>
      {tags.map((t) => (
        <button key={t.id} className={'tag' + (activeTag === t.id ? ' on' : '')} onClick={() => setActiveTag(t.id)}>
          <span>{t.name}</span>
          <span className="count">{t.count}</span>
        </button>
      ))}
      <span className="kbd-hint" style={{ marginLeft: 'auto' }}>
        <kbd>최신순</kbd>
      </span>
    </div>
  );
}
