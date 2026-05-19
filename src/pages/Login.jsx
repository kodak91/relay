import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import useAppStore from '../store/appStore';

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { loginWithEmail, loginWithGoogle, register } = useAuth();
  const { user, authLoading } = useAppStore();

  // 이미 로그인된 상태면 앱으로
  useEffect(() => {
    if (!authLoading && user) navigate('/app', { replace: true });
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await loginWithEmail(email, password);
      } else {
        if (!name.trim()) { setError('이름을 입력해주세요.'); setSubmitting(false); return; }
        await register(email, password, name, role);
      }
      navigate('/app', { replace: true });
    } catch (err) {
      const map = {
        'auth/user-not-found':        '등록되지 않은 이메일입니다.',
        'auth/wrong-password':        '비밀번호가 틀렸습니다.',
        'auth/invalid-credential':    '이메일 또는 비밀번호가 올바르지 않습니다.',
        'auth/email-already-in-use':  '이미 사용 중인 이메일입니다.',
        'auth/weak-password':         '비밀번호는 6자 이상이어야 합니다.',
        'auth/invalid-email':         '올바른 이메일 형식이 아닙니다.',
        'auth/too-many-requests':     '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        'auth/operation-not-allowed': 'Firebase 콘솔에서 이메일/비밀번호 로그인을 활성화해주세요.',
      };
      setError(map[err.code] || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      await loginWithGoogle();
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card fadein">
        <div className="login-title">Relay</div>
        <p className="login-sub">팀 업무를 채팅으로 정리하세요</p>

        <div className="role-switch" style={{ marginBottom: 20 }}>
          <button className={tab === 'login' ? 'on' : ''} onClick={() => setTab('login')}>로그인</button>
          <button className={tab === 'register' ? 'on' : ''} onClick={() => setTab('register')}>회원가입</button>
        </div>

        <button className="google-btn" onClick={handleGoogle} disabled={submitting}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Google로 계속하기
        </button>

        <div className="divider">또는</div>

        <form onSubmit={handleSubmit}>
          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label">이름</label>
              <input className="form-input" placeholder="홍길동" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">이메일</label>
            <input className="form-input" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <input className="form-input" type="password" placeholder="6자 이상" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label">역할</label>
              <div className="role-switch" style={{ width: 'fit-content' }}>
                <button type="button" className={role === 'lead' ? 'on' : ''} onClick={() => setRole('lead')}>팀장</button>
                <button type="button" className={role === 'member' ? 'on' : ''} onClick={() => setRole('member')}>팀원</button>
              </div>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="btn accent" style={{ width: '100%', marginTop: 8, padding: '11px' }} disabled={submitting}>
            {submitting ? '처리 중…' : tab === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        <button className="btn ghost" style={{ width: '100%', marginTop: 10, fontSize: 12 }} onClick={() => navigate('/')}>
          ← 홈으로
        </button>
      </div>
    </div>
  );
}
