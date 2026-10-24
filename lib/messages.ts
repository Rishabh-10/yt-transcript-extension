import type { Result, Transcript, VideoInfo } from './types';

/**
 * Protocol between the isolated content script and the MAIN-world script,
 * carried over `window.postMessage`.
 */
export const MAIN_SOURCE = 'yt-transcript:main';
export const CONTENT_SOURCE = 'yt-transcript:content';

export interface MainMethods {
  getVideoInfo: { args: Record<string, never>; result: VideoInfo };
  getTranscript: { args: { trackId?: string }; result: Transcript };
}
export type MainMethod = keyof MainMethods;

export interface BridgeRequest<M extends MainMethod = MainMethod> {
  source: typeof CONTENT_SOURCE;
  id: number;
  method: M;
  args: MainMethods[M]['args'];
}

export interface BridgeResponse {
  source: typeof MAIN_SOURCE;
  id: number;
  result: Result<unknown>;
}

/**
 * Protocol between the side panel and the content script.
 * Requests go through `tabs.sendMessage`; pushed events go over a long-lived port.
 */
export const PANEL_PORT = 'yt-transcript-panel';

export type PanelRequest =
  | { type: 'getVideoInfo' }
  | { type: 'getTranscript'; trackId?: string }
  | { type: 'seek'; seconds: number };

export interface PanelResponses {
  getVideoInfo: Result<VideoInfo>;
  getTranscript: Result<Transcript>;
  seek: Result<null>;
}

export type PanelEvent =
  | { type: 'time'; seconds: number }
  | { type: 'videoChanged'; videoId: string | null };
