import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-title">
        채팅만으로 프로젝트와<br />태스크를 관리하세요
      </div>
      <p className="landing-sub">
        AI가 정리를 도와줍니다.
      </p>
      <div className="landing-actions">
        <button
          className="btn accent"
          style={{ padding: '12px 28px', fontSize: 15 }}
          onClick={() => navigate('/login')}
        >
          시작하기
        </button>
      </div>

      <div className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <div className="feature-title">결정만 하세요</div>
          <div className="feature-desc">승인·결정 요청이 사이드바에 자동 수집됩니다.</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🤖</div>
          <div className="feature-title">AI가 정리합니다</div>
          <div className="feature-desc">/오늘요약으로 하루를 한 번에 파악하세요.</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📚</div>
          <div className="feature-title">KB로 쌓입니다</div>
          <div className="feature-desc">파일·링크를 KB에 저장해 언제든 검색하세요.</div>
        </div>
      </div>
    </div>
  );
}
