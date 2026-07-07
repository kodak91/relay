import { useState, useRef, useCallback, useEffect } from 'react';

// 회의 녹음 + 실시간 받아쓰기 훅.
// - MediaRecorder: 마이크 오디오를 녹음 → 종료 시 Blob 반환 (회의록에 파일 저장용)
// - Web Speech API: 실시간 한국어 받아쓰기 → 최종 인식 문장을 onFinalText 로 콜백
//   (인식된 문장이 기존 transcript 로 들어가 회의록 AI 생성에 그대로 활용됨)
// 브라우저 지원(Chrome 계열)에서만 동작. 미지원 시 supported=false.
const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function useMeetingRecorder({ onFinalText } = {}) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinalText);
  const wantRef = useRef(false); // 사용자가 녹음 유지를 원하는지 (자동 재시작 판단)

  useEffect(() => { onFinalRef.current = onFinalText; }, [onFinalText]);

  const speechSupported = !!SpeechRecognition;

  const stop = useCallback(() => {
    wantRef.current = false;
    setInterim('');
    setRecording(false);
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // 녹음 시작 → 오디오 스트림 + (지원 시)받아쓰기 시작. onStopped(blob) 로 최종 Blob 전달.
  const start = useCallback(async (onStopped) => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        onStopped?.(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      wantRef.current = true;
      setRecording(true);

      // 실시간 받아쓰기 (지원 브라우저)
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.lang = 'ko-KR';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e) => {
          let interimTxt = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) {
              const t = r[0].transcript.trim();
              if (t) onFinalRef.current?.(t);
            } else {
              interimTxt += r[0].transcript;
            }
          }
          setInterim(interimTxt);
        };
        // continuous 인식이 침묵/타임아웃으로 끊기면 사용자가 원하는 한 자동 재시작
        rec.onend = () => {
          if (wantRef.current) { try { rec.start(); } catch { /* noop */ } }
          else setInterim('');
        };
        rec.onerror = (ev) => {
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            setError('마이크/음성 인식 권한이 필요합니다.');
            wantRef.current = false;
          }
        };
        recognitionRef.current = rec;
        try { rec.start(); } catch { /* noop */ }
      }
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? '마이크 권한이 거부되었습니다.' : (e.message || '녹음을 시작할 수 없습니다.'));
      setRecording(false);
    }
  }, []);

  // 언마운트 정리
  useEffect(() => () => {
    wantRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { recording, interim, error, speechSupported, start, stop };
}
