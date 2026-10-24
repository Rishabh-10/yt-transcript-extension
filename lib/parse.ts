import { findAllByKey, textOf } from './json';
import type { Segment } from './types';

export function cleanText(text: string): string {
  return text.replace(/[\s​]+/g, ' ').trim();
}

/**
 * Sorts segments, drops empty ones, and trims durations so lines don't overlap.
 * Auto-generated captions overlap heavily, which breaks "current line" highlighting.
 */
export function normalizeSegments(segments: Segment[]): Segment[] {
  const sorted = segments
    .map((s) => ({ ...s, text: cleanText(s.text) }))
    .filter((s) => s.text.length > 0 && Number.isFinite(s.start))
    .sort((a, b) => a.start - b.start);
  return sorted.map((seg, i) => {
    const next = sorted[i + 1];
    const dur = next && next.start > seg.start ? Math.min(seg.dur, next.start - seg.start) : seg.dur;
    return { ...seg, start: roundMs(seg.start), dur: roundMs(Math.max(0, dur)) };
  });
}

/** All sources are millisecond-precision; rounding hides float noise like 4.8 - 1.2. */
const roundMs = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** Parses a `/api/timedtext?fmt=json3` response. */
export function parseJson3(data: unknown): Segment[] {
  const events = (data as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const segments: Segment[] = [];
  for (const event of events) {
    if (!Array.isArray(event?.segs)) continue;
    const text = event.segs.map((s: { utf8?: string }) => s?.utf8 ?? '').join('');
    segments.push({
      start: Number(event.tStartMs ?? 0) / 1000,
      dur: Number(event.dDurationMs ?? 0) / 1000,
      text,
    });
  }
  return normalizeSegments(segments);
}

export interface TranscriptLanguage {
  title: string;
  selected: boolean;
  /** `params` for a follow-up `get_transcript` call that loads this language. */
  params: string | null;
}

/** Parses a `/youtubei/v1/get_transcript` response. */
export function parseTranscriptPanel(data: unknown): {
  segments: Segment[];
  languages: TranscriptLanguage[];
} {
  const segments: Segment[] = [];
  for (const renderer of findAllByKey(data, 'transcriptSegmentRenderer')) {
    const r = renderer as { startMs?: string; endMs?: string; snippet?: unknown };
    const startMs = Number(r.startMs);
    const endMs = Number(r.endMs);
    if (!Number.isFinite(startMs)) continue;
    segments.push({
      start: startMs / 1000,
      dur: Number.isFinite(endMs) ? Math.max(0, endMs - startMs) / 1000 : 0,
      text: textOf(r.snippet),
    });
  }

  const menu = findAllByKey(data, 'subMenuItems', 1)[0];
  const languages: TranscriptLanguage[] = Array.isArray(menu)
    ? menu.map((item) => {
        const params = item?.continuation?.reloadContinuationData?.continuation;
        return {
          title: textOf(item?.title),
          selected: item?.selected === true,
          params: typeof params === 'string' ? params : null,
        };
      })
    : [];

  return { segments: normalizeSegments(segments), languages };
}

/** Parses "1:02:03", "2:03" or "0:05" into seconds. Returns NaN if malformed. */
export function parseTimestamp(text: string): number {
  const parts = text.trim().split(':');
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** Builds segments from rows scraped out of YouTube's own transcript panel. */
export function parseDomRows(rows: { timestamp: string; text: string }[], lastDur = 5): Segment[] {
  const starts = rows.map((r) => parseTimestamp(r.timestamp));
  const segments: Segment[] = [];
  rows.forEach((row, i) => {
    const start = starts[i]!;
    if (Number.isNaN(start)) return;
    const next = starts.slice(i + 1).find((s) => !Number.isNaN(s));
    segments.push({ start, dur: next !== undefined ? next - start : lastDur, text: row.text });
  });
  return normalizeSegments(segments);
}
