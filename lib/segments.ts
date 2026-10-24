import type { Segment } from './types';

/** Index of the segment playing at `time`, or -1 before the first one. Segments must be sorted. */
export function findActiveIndex(segments: Segment[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.start <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Indices of segments containing `query`, ignoring case. */
export function findMatches(segments: Segment[], query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: number[] = [];
  segments.forEach((s, i) => {
    if (s.text.toLowerCase().includes(needle)) matches.push(i);
  });
  return matches;
}

/** Splits `text` into alternating plain/matched pieces for highlighting. */
export function splitOnMatches(text: string, query: string): { text: string; match: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const pieces: { text: string; match: boolean }[] = [];
  const haystack = text.toLowerCase();
  let pos = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, pos)) {
    if (at > pos) pieces.push({ text: text.slice(pos, at), match: false });
    pieces.push({ text: text.slice(at, at + needle.length), match: true });
    pos = at + needle.length;
  }
  if (pos < text.length) pieces.push({ text: text.slice(pos), match: false });
  return pieces;
}
