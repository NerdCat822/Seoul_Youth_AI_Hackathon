import { asDate } from '../lib/dates';
import type { Experiment } from '../types';

export function ui() {
  return window.App;
}

export function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error('화면을 열지 못했어요. 새로고침한 뒤 다시 시도해 주세요.');
  return node;
}

export function recordUrl(page: string, id: string, options: Record<string, string> = {}) {
  return page + '.html?' + new URLSearchParams({ id, ...options });
}

export function recordDestination(record: Experiment) {
  return recordUrl(record.status === 'COMPLETED' ? 'result' : 'record', record.id);
}

export function daysBetween(start: string, end: string) {
  return Math.round((asDate(end).getTime() - asDate(start).getTime()) / 86400000);
}

export function notice(message: string, href = 'records.html', label = '내 기록으로') {
  const { esc } = ui();
  el('main').innerHTML =
    `<section class="container-main"><p class="note" role="status">${esc(message)}</p>
    <a class="btn btn-lg btn-neutral mt-5" href="${esc(href)}">${esc(label)}</a></section>`;
}
