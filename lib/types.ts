/** One line of a transcript. Times are in seconds. */
export interface Segment {
  start: number;
  dur: number;
  text: string;
}

/** A caption track as listed in the player response. */
export interface TrackInfo {
  /** YouTube's `vssId`, e.g. ".en" (uploaded) or "a.en" (auto-generated). */
  id: string;
  languageCode: string;
  /** Display name, e.g. "English (auto-generated)". */
  name: string;
  isAuto: boolean;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  lengthSeconds: number;
  isLive: boolean;
  tracks: TrackInfo[];
}

/** Which strategy produced the transcript; shown in the panel footer to help debug breakage. */
export type TranscriptSource = 'innertube' | 'timedtext' | 'dom';

export interface Transcript {
  videoId: string;
  /** The track the transcript came from, when it could be identified. */
  trackId: string | null;
  source: TranscriptSource;
  segments: Segment[];
}

export type ErrorCode =
  | 'NOT_WATCH_PAGE'
  | 'NO_CAPTIONS'
  | 'FETCH_FAILED'
  | 'TIMEOUT'
  | 'NO_CONTENT_SCRIPT';

export interface ErrorInfo {
  code: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorInfo };

export class TranscriptError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriptError';
  }
}

export function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof TranscriptError) return { code: err.code, message: err.message };
  return { code: 'FETCH_FAILED', message: err instanceof Error ? err.message : String(err) };
}
