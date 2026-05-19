import useAppStore from '../../store/appStore';

export default function TagBar({ messages = [] }) {
  const { activeTag, setActiveTag } = useAppStore();

  // Build unique tags from actual message data only
  const tagMap = {};
  messages.forEach((m) => {
    (m.tags || []).forEach((t) => {
      if (t) tagMap[t] = (tagMap[t] || 0) + 1;
    });
  });
  const tags = Object.keys(tagMap);

  if (tags.length === 0) return null;

  return (
    <div className="tag-bar">
      <span className="label">태그</span>
      {tags.map((t) => (
        <button
          key={t}
          className={'tag' + (activeTag === t ? ' on' : '')}
          onClick={() => setActiveTag(activeTag === t ? 'all' : t)}
        >
          <span>{t}</span>
          <span className="count">{tagMap[t]}</span>
        </button>
      ))}
    </div>
  );
}
