import type { ExperimentInput } from '../types';
import { addDays, asDate } from './dates.ts';

// The form stays editable. Resolve only date expressions with an explicit local meaning.
export function parseDraft(
  text: string,
  today: string,
): Omit<ExperimentInput, 'actionType' | 'targetMenuCode'> {
  const notes = text.trim();
  const explicitDates = Array.from(
    notes.matchAll(/(\d{4}-\d{2}-\d{2})|(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/g),
    (match) => ({
      day: validDay(
        match[1] ??
          [
            match[2] ?? today.slice(0, 4),
            match[3]?.padStart(2, '0'),
            match[4]?.padStart(2, '0'),
          ].join('-'),
      ),
      until: /^\s*까지/.test(notes.slice(match.index + match[0].length)),
    }),
  );
  const past = notes.match(/지난\s*(\d{1,3})\s*일(?:간|동안)?/);
  const duration = notes.match(/(\d{1,3})\s*(일|주)\s*(?:동안|간|해볼|해볼게|해보)/);
  const sunday = addDays(today, (7 - asDate(today).getUTCDay()) % 7);
  let startDate = today;
  let endDate: string;

  const first = explicitDates[0];
  if (first && (!first.until || explicitDates.length > 1)) {
    startDate = first.day;
  } else if (past && Number(past[1]) > 0) {
    startDate = addDays(today, -Number(past[1]));
  } else if (/어제부터/.test(notes)) {
    startDate = addDays(today, -1);
  } else if (/내일부터/.test(notes)) {
    startDate = addDays(today, 1);
  } else if (/다음\s*주부터/.test(notes)) {
    startDate = addDays(sunday, 1);
  } else if (/이번\s*주부터/.test(notes)) {
    startDate = addDays(sunday, -6);
  }

  if (explicitDates[1]) {
    endDate = explicitDates[1].day;
  } else if (first?.until) {
    endDate = first.day;
  } else if (/다음\s*주까지/.test(notes)) {
    endDate = addDays(sunday, 7);
  } else if (/이번\s*주까지/.test(notes)) {
    endDate = sunday;
  } else if (/오늘까지/.test(notes)) {
    endDate = today;
  } else if (past) {
    endDate = addDays(today, -1);
  } else {
    const days = duration ? Number(duration[1]) * (duration[2] === '주' ? 7 : 1) : 14;
    endDate = startDate && days > 0 ? addDays(startDate, days - 1) : '';
  }

  const category = /홍보|광고|소식|전단|쿠폰|인스타/.test(notes)
    ? 'MARKETING'
    : /영업시간|좌석|동선|대기|입구|진열|테이블|배치/.test(notes)
      ? 'OPERATION'
      : 'MENU';
  const firstSentence = notes.split(/[.!?\n]/)[0].trim();
  return { title: (firstSentence || notes).slice(0, 80), category, startDate, endDate, notes };
}

function validDay(value: string): string {
  const date = asDate(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : '';
}
