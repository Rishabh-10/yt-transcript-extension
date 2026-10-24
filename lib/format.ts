import type { Segment } from './types';

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** "m:ss", or "h:mm:ss" past an hour — the style YouTube uses. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "HH:MM:SS,mmm" for SRT, or "HH:MM:SS.mmm" for WebVTT. */
export function formatCueTime(seconds: number, separator: ',' | '.'): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

/** Minimum on-screen time for a cue whose duration is zero. */
const MIN_CUE = 1;
const cueEnd = (seg: Segment) => seg.start + Math.max(seg.dur, MIN_CUE);

export interface TextOptions {
  timestamps: boolean;
}

export function toPlainText(segments: Segment[], { timestamps }: TextOptions): string {
  if (!timestamps) return segments.map((s) => s.text).join(' ');
  return segments.map((s) => `[${formatClock(s.start)}] ${s.text}`).join('\n');
}

export function toSrt(segments: Segment[]): string {
  return segments
    .map(
      (s, i) =>
        `${i + 1}\n${formatCueTime(s.start, ',')} --> ${formatCueTime(cueEnd(s), ',')}\n${s.text}\n`,
    )
    .join('\n');
}

export function toVtt(segments: Segment[]): string {
  const cues = segments.map(
    (s) => `${formatCueTime(s.start, '.')} --> ${formatCueTime(cueEnd(s), '.')}\n${s.text}\n`,
  );
  return ['WEBVTT\n', ...cues].join('\n');
}

export function watchUrl(videoId: string, atSeconds?: number): string {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return atSeconds === undefined ? base : `${base}&t=${Math.floor(atSeconds)}s`;
}

export function toMarkdown(
  segments: Segment[],
  meta: { title: string; videoId: string },
  { timestamps }: TextOptions,
): string {
  const header = `# ${meta.title}\n\n${watchUrl(meta.videoId)}\n\n`;
  if (!timestamps) return header + toPlainText(segments, { timestamps: false }) + '\n';
  const lines = segments.map(
    (s) => `- [${formatClock(s.start)}](${watchUrl(meta.videoId, s.start)}) ${s.text}`,
  );
  return header + lines.join('\n') + '\n';
}

export type ExportFormat = 'txt' | 'srt' | 'vtt' | 'md';

export function exportTranscript(
  format: ExportFormat,
  segments: Segment[],
  meta: { title: string; videoId: string },
  options: TextOptions,
): { content: string; mimeType: string } {
  switch (format) {
    case 'txt':
      return { content: toPlainText(segments, options) + '\n', mimeType: 'text/plain' };
    case 'srt':
      return { content: toSrt(segments), mimeType: 'application/x-subrip' };
    case 'vtt':
      return { content: toVtt(segments), mimeType: 'text/vtt' };
    case 'md':
      return { content: toMarkdown(segments, meta, options), mimeType: 'text/markdown' };
  }
}

/** Turns a video title into a safe file name. */
export function fileNameFor(title: string, format: ExportFormat): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${(base || 'transcript').slice(0, 120)}.${format}`;
}
