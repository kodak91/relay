import { useEffect, useRef, useState } from 'react';

// 이 상수 하나가 "한 번 말하면 계속 듣는다"의 핵심 — 이 시간만큼 조용하면 한 차례를 끝낸다.
const SILENCE_MS = 900;
const LEVEL_INTERVAL_MS = 100; // 소리 크기 감시는 setInterval로 — RAF는 탭이 뒤로 가면 멈춘다.
const SILENCE_RMS = 0.02;

// STT 엔진 연결 지점. 지금은 녹음 → 무음 감지 → 정지까지만 동작하고 실제 "글자로 바꾸기"는
// 아직 없다. 브라우저 내 WASM Whisper를 붙이려면 40~150MB 모델을 새로 내려받는 의존성이
// 필요해서 — 절대 규칙 "말하지 않은 걸 설치하기 전에 먼저 물어봐라"에 따라 지금은 비워둔다.
// 안 되면 조용히 실패하지 않고 engineReady=false로 화면에 그대로 알린다.
async function transcribe(/* blob */) {
  return null;
}

export function useVoiceCapture({ onTranscript, disabled } = {}) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);
  const silentSinceRef = useRef(null);
  const cancelledRef = useRef(false);

  const cleanup = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close();
    audioCtxRef.current = null;
    setLevel(0);
    setRecording(false);
  };

  const stop = (cancelled = false) => {
    cancelledRef.current = cancelled;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanup();
    }
  };

  const start = async () => {
    if (disabled || recording) return; // 말하는 동안(TTS 재생 중)엔 마이크를 열지 않는다.
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저는 마이크 입력을 지원하지 않아요.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      cancelledRef.current = false;
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        chunksRef.current = [];
        cleanup();
        if (cancelledRef.current) return;
        const text = await transcribe(blob);
        onTranscript?.(text, blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      silentSinceRef.current = null;

      const data = new Uint8Array(analyser.frequencyBinCount);
      intervalRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / data.length);
        setLevel(rms);
        if (rms < SILENCE_RMS) {
          if (silentSinceRef.current === null) silentSinceRef.current = Date.now();
          else if (Date.now() - silentSinceRef.current > SILENCE_MS) stop(false);
        } else {
          silentSinceRef.current = null;
        }
      }, LEVEL_INTERVAL_MS);
    } catch {
      setError('마이크 권한을 확인해주세요.');
    }
  };

  // 끊는 건 마이크 버튼, 스페이스, ESC.
  useEffect(() => {
    const onKey = (e) => {
      if (!recording) return;
      if (e.code === 'Space') { e.preventDefault(); stop(false); }
      if (e.key === 'Escape') stop(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => () => cleanup(), []);

  return {
    recording,
    level,
    error,
    engineReady: false, // STT 엔진 미연결 — 화면에 배지로 그대로 알린다
    toggle: () => (recording ? stop(false) : start()),
    cancel: () => stop(true),
  };
}
