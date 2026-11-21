import { useEffect, useRef, useState } from 'react';
import { ApiError, transcribeAudio } from '../api';
import { Icon } from './Icon';
import './voice-input.css';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_MS = 60_000;
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
}

function releaseMicrophone(capture: Capture) {
  window.clearTimeout(capture.timer);
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
    recording: '녹음 중 · 최대 1분',
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
