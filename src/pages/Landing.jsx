import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-title">
        팀장의 인지 부하를<br />줄이는 업무 OS
      </div>
      <p className="landing-sub">
        카카오톡의 편의성 + 노션의 구조화.<br />
        채팅으로 시작해 결정으로 끝내세요.
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
