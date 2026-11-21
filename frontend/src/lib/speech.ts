import { synthesizeSpeech } from '../api';

// 에이전트의 답을 소리로 읽는다. 화면 전체에서 소리 하나만 낸다.
// 휴대폰 브라우저는 사용자가 누른 순간에만 소리를 허락하므로, 마이크를 누를 때 unlock()으로 미리 연다.

type Listener = (speaking: boolean) => void;

// 0.05초짜리 무음 WAV. 재생 권한을 미리 얻는 데만 쓴다.
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

let audio: HTMLAudioElement | null = null;
let current: { controller: AbortController; url?: string } | null = null;
const listeners = new Set<Listener>();

function player() {
  audio ??= new Audio();
  return audio;
}

function notify(speaking: boolean) {
  listeners.forEach((listener) => listener(speaking));
}

export function onSpeakingChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 사용자가 버튼을 누른 순간에 불러 소리 재생 권한을 얻는다. */
export function unlockAudio() {
  const element = player();
  if (current) return;
  element.src = SILENCE;
  element.play().catch(() => undefined);
}

export function stopSpeaking() {
  const playing = current;
  if (!playing) return;
  current = null;
  playing.controller.abort();
  const element = player();
  element.pause();
  element.removeAttribute('src');
  element.load();
  if (playing.url) URL.revokeObjectURL(playing.url);
  notify(false);
}

/** 글을 소리로 읽는다. 앞서 읽던 것은 멈춘다. 읽기가 끝나거나 멈추면 끝난다. */
export async function speak(text: string): Promise<void> {
  stopSpeaking();
  const words = text.trim();
  if (!words) return;
  const playing: { controller: AbortController; url?: string } = {
    controller: new AbortController(),
  };
  current = playing;
  notify(true);
  try {
    const sound = await synthesizeSpeech(words, playing.controller.signal);
    if (current !== playing) return;
    playing.url = URL.createObjectURL(sound);
    const element = player();
    element.src = playing.url;
    await new Promise<void>((resolve, reject) => {
      element.onended = () => resolve();
      element.onerror = () => reject(new Error('재생하지 못했어요.'));
      playing.controller.signal.addEventListener('abort', () => resolve(), { once: true });
      element.play().catch(reject);
    });
  } finally {
    if (current === playing) stopSpeaking();
  }
}
