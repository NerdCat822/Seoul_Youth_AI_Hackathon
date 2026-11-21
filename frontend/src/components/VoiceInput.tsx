import { useEffect, useRef, useState } from 'react';
import { ApiError, transcribeAudio } from '../api';
import { Icon } from './Icon';
import './voice-input.css';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_MS = 60_000;
// 말을 멈춘 지 이만큼 지나면 말이 끝난 것으로 보고 녹음을 마친다.
const SILENCE_MS = 1_000;
// 처음 이만큼은 주변 소음의 크기를 잰다.
const CALIBRATE_MS = 300;
// 이만큼은 소리가 나야 말을 시작한 것으로 본다. 컵 내려놓는 소리 같은 짧은 소리는 넘긴다.
const MIN_SPEECH_MS = 250;
// 이만큼 기다려도 말소리가 없으면 녹음을 그만둔다.
const NO_SPEECH_MS = 8_000;
const MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'video/webm',
];

type Phase = 'idle' | 'permission' | 'recording' | 'transcribing';
interface Capture {
  controller: AbortController;
  onBusyChange?: (busy: boolean) => void;
  transcribeOnStop?: boolean;
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: number;
  meter?: number;
  context?: AudioContext;
}

function releaseMicrophone(capture: Capture) {
  window.clearTimeout(capture.timer);
  window.clearInterval(capture.meter);
  capture.meter = undefined;
  capture.context?.close().catch(() => undefined);
  capture.context = undefined;
  const recorder = capture.recorder;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== 'inactive') recorder.stop();
  }
  capture.stream?.getTracks().forEach((track) => track.stop());
  capture.recorder = undefined;
  capture.stream = undefined;
}

function microphoneError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      return '브라우저의 사이트 설정에서 마이크 사용을 허용한 뒤 다시 눌러주세요.';
    if (error.name === 'NotFoundError') return '마이크를 연결한 뒤 다시 눌러주세요.';
  }
  return '마이크를 열지 못했어요. 연결 상태를 확인하고 다시 눌러주세요.';
}

export function VoiceInput({
  disabled = false,
  onTranscript,
  onBusyChange,
  buttonClassName = 'chat-round',
  microphoneIcon,
}: {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onBusyChange?: (busy: boolean) => void;
  buttonClassName?: string;
  microphoneIcon?: import('react').ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const active = useRef<Capture | null>(null);

  useEffect(() => {
    return () => {
      const capture = active.current;
      if (capture) {
        active.current = null;
        capture.controller.abort();
        releaseMicrophone(capture);
        capture.onBusyChange?.(false);
      }
    };
  }, []);

  function finish(capture: Capture, message = '') {
    if (active.current !== capture) return;
    active.current = null;
    capture.controller.abort();
    releaseMicrophone(capture);
    setPhase('idle');
    setError(message);
    capture.onBusyChange?.(false);
  }

  function stopRecording(capture: Capture) {
    if (active.current !== capture || capture.recorder?.state !== 'recording') return;
    capture.transcribeOnStop = true;
    setPhase('transcribing');
    capture.recorder.stop();
  }

  // 마이크 소리 크기를 0.1초마다 잰다. 말을 시작한 뒤 1초 동안 조용하면 녹음을 마친다.
  function watchSilence(capture: Capture, stream: MediaStream) {
    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return; // 소리 크기를 잴 수 없으면 '완료' 버튼으로만 마친다.
    const context = new AudioContextClass();
    capture.context = context;
    context.resume().catch(() => undefined);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let last = startedAt;
    let noise = 0;
    let measured = 0;
    let voiced = 0;
    let lastVoice = startedAt;
    capture.meter = window.setInterval(() => {
      if (active.current !== capture || capture.recorder?.state !== 'recording') return;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const level = Math.sqrt(sum / samples.length);
      const now = performance.now();
      const step = now - last;
      last = now;
      if (now - startedAt < CALIBRATE_MS) {
        noise += level;
        measured += 1;
        return;
      }
      const threshold = Math.min(0.08, Math.max(0.015, (noise / Math.max(measured, 1)) * 3));
      if (level > threshold) {
        voiced += step;
        lastVoice = now;
      } else if (voiced >= MIN_SPEECH_MS && now - lastVoice >= SILENCE_MS) {
        stopRecording(capture);
      } else if (voiced < MIN_SPEECH_MS && now - startedAt >= NO_SPEECH_MS) {
        finish(capture, '말소리가 들리지 않았어요. 다시 눌러 말씀해주세요.');
      }
    }, 100);
  }

  async function start() {
    if (disabled || active.current) return;
    if (!window.isSecureContext) {
      setError('마이크를 사용하려면 HTTPS 주소나 localhost에서 열어주세요.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('이 브라우저에서는 녹음을 지원하지 않아요. 다른 브라우저에서 다시 열어주세요.');
      return;
    }
    const capture: Capture = { controller: new AbortController(), onBusyChange };
    active.current = capture;
    setError('');
    setPhase('permission');
    onBusyChange?.(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (active.current !== capture) {
        // Permission prompts can resolve after the user has closed the panel or cancelled.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      capture.stream = stream;
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      capture.recorder = recorder;
      const parts: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = ({ data }) => {
        if (!data.size || active.current !== capture) return;
        size += data.size;
        if (size > MAX_BYTES) {
          finish(capture, '녹음이 5MB를 넘었어요. 더 짧게 녹음해주세요.');
          return;
        }
        parts.push(data);
      };
      recorder.onerror = () =>
        finish(capture, '녹음이 중단됐어요. 마이크를 확인하고 다시 말씀해주세요.');
      recorder.onstop = async () => {
        if (active.current !== capture) return;
        releaseMicrophone(capture);
        if (!capture.transcribeOnStop) {
          finish(capture, '녹음이 중단됐어요. 마이크를 확인하고 다시 말씀해주세요.');
          return;
        }
        if (!parts.length) {
          finish(capture, '녹음된 소리가 없어요. 다시 말씀해주세요.');
          return;
        }
        const type = parts[0].type || recorder.mimeType;
        if (!MIME_TYPES.includes(type.split(';', 1)[0].trim().toLowerCase())) {
          finish(capture, '지원하지 않는 녹음 형식이에요. 다른 브라우저에서 다시 시도해주세요.');
          return;
        }
        setPhase('transcribing');
        try {
          const { text } = await transcribeAudio(
            new Blob(parts, { type }),
            capture.controller.signal,
          );
          if (active.current !== capture) return;
          const spoken = text.trim();
          if (spoken) onTranscript(spoken);
          finish(capture, spoken ? '' : '말소리를 알아듣지 못했어요. 다시 말씀해주세요.');
        } catch (reason) {
          finish(
            capture,
            reason instanceof ApiError
              ? reason.message
              : '음성을 글로 바꾸지 못했어요. 다시 시도해주세요.',
          );
        }
      };
      recorder.start(1000);
      capture.timer = window.setTimeout(() => stopRecording(capture), MAX_DURATION_MS);
      watchSilence(capture, stream);
      setPhase('recording');
    } catch (reason) {
      finish(capture, microphoneError(reason));
    }
  }

  const recording = phase === 'recording';
  const label = {
    idle: '음성 입력 시작',
    permission: '마이크 권한 확인 중',
    recording: '녹음 완료',
    transcribing: '음성 변환 중',
  }[phase];
  const status = {
    idle: error,
    permission: '브라우저에서 마이크 사용을 허용해주세요.',
    recording: '듣고 있어요 · 말을 멈추면 1초 뒤 자동으로 보내요',
    transcribing: '말씀하신 내용을 글로 바꾸고 있어요…',
  }[phase];

  return (
    <>
      <span className="voice-actions">
        <button
          type="button"
          className={recording ? buttonClassName + ' voice-finish' : buttonClassName}
          disabled={disabled || phase === 'permission' || phase === 'transcribing'}
          aria-label={label}
          title={label}
          onClick={() => {
            if (active.current) stopRecording(active.current);
            else void start();
          }}
        >
          {recording ? (
            <>
              <span aria-hidden="true" className="voice-square" />
              완료
            </>
          ) : (
            (microphoneIcon ?? <Icon name="mic" size={18} />)
          )}
        </button>
      </span>
      <div className="voice-feedback" hidden={!status}>
        <span role="status">{status}</span>
        {phase !== 'idle' && (
          <button
            type="button"
            aria-label="음성 입력 취소"
            onClick={() => active.current && finish(active.current)}
          >
            취소
          </button>
        )}
      </div>
    </>
  );
}
