/**
 * Presentation helpers shared across server components.
 *
 * Everything here is deterministic and locale-independent so server and client
 * output always match.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "just now", "12 minutes ago", "3 days ago", then an absolute date. */
export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const delta = now.getTime() - value.getTime();

  if (Number.isNaN(value.getTime())) return '';
  if (delta < 45_000) return 'just now';
  if (delta < HOUR) {
    const minutes = Math.round(delta / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (delta < DAY) {
    const hours = Math.round(delta / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (delta < WEEK) {
    const days = Math.round(delta / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (delta < 90 * DAY) {
    const weeks = Math.round(delta / WEEK);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  return absoluteDate(value);
}

/** "14 March 2026" */
export function absoluteDate(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

/** "14 Mar 2026, 21:40" */
export function dateTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(value);
}

/** "21:40" — used inside message threads where the date is implied. */
export function clockTime(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(value);
}

/** "Thursday, 14 March" */
export function longDay(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(value);
}

/** "in 3 days", "in 2 hours", "starting now", "2 days ago" */
export function countdown(date: Date | string, now: Date = new Date()): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const delta = value.getTime() - now.getTime();
  const magnitude = Math.abs(delta);

  const phrase = (amount: number, unit: string) => {
    const plural = amount === 1 ? unit : `${unit}s`;
    return `${amount} ${plural}`;
  };

  if (magnitude < MINUTE) return delta >= 0 ? 'starting now' : 'just finished';
  if (magnitude < HOUR) {
    const n = Math.round(magnitude / MINUTE);
    return delta >= 0 ? `in ${phrase(n, 'minute')}` : `${phrase(n, 'minute')} ago`;
  }
  if (magnitude < DAY) {
    const n = Math.round(magnitude / HOUR);
    return delta >= 0 ? `in ${phrase(n, 'hour')}` : `${phrase(n, 'hour')} ago`;
  }
  const n = Math.round(magnitude / DAY);
  return delta >= 0 ? `in ${phrase(n, 'day')}` : `${phrase(n, 'day')} ago`;
}

/** All timestamps are rendered in UTC and labelled as such in the interface. */
export const DISPLAY_TIMEZONE_NOTE = 'Times shown in UTC';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '◈';
  if (parts.length === 1) return [...parts[0]!][0]!.toUpperCase();
  return ([...parts[0]!][0]! + [...parts[parts.length - 1]!][0]!).toUpperCase();
}

/** Renders a rating as filled and empty stars, to one decimal place. */
export function starString(rating: number): { filled: string; empty: string; hasHalf: boolean } {
  const rounded = Math.round(rating * 2) / 2;
  const full = Math.floor(rounded);
  const hasHalf = rounded - full >= 0.5;
  return { filled: '★'.repeat(full), empty: '☆'.repeat(5 - full - (hasHalf ? 1 : 0)), hasHalf };
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

const GREEK = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon',
  'Phi', 'Chi', 'Psi', 'Omega',
];

const ROMAN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];

/**
 * Archive volume designators.
 *
 * Catalogue numbers in The Archive carry a volume designation derived from the
 * object number, which is a piece of the archive's texture rather than a
 * functional field.
 */
export function volumeDesignator(number: number): string {
  const index = Math.max(1, Math.floor(number / 100));
  if (index <= GREEK.length) return `Vol. ${GREEK[index - 1]}`;
  const overflow = index - GREEK.length;
  if (overflow <= ROMAN.length) return `Vol. ${ROMAN[overflow - 1]}`;
  return `Vol. ${index}`;
}

/** Combining diacritical marks, stripped after NFKD decomposition. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function slugify(input: string, maxLength = 120): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/** Truncates on a word boundary where possible. */
export function excerpt(text: string, maxLength = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const slice = clean.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

export function firstSentence(text: string, maxLength = 140): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  const candidate = match ? match[1]! : text;
  return excerpt(candidate, maxLength);
}

export function pluralLabel(count: number, singular: string, plural?: string): string {
  return `${formatCount(count)} ${pluralise(count, singular, plural)}`;
}