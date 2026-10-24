// Runs in the page's MAIN world: reads YouTube's own player objects.
import { textOf } from '../json';
import { TranscriptError, type TrackInfo, type VideoInfo } from '../types';
import { videoIdFromUrl, waitFor } from '../util';

export interface CaptionTrack extends TrackInfo {
  baseUrl: string;
}

interface YtPlayerElement extends HTMLElement {
  getPlayerResponse?: () => any;
}

export function getPlayer(): YtPlayerElement | null {
  return document.getElementById('movie_player') as YtPlayerElement | null;
}

export function currentVideoId(): string | null {
  return videoIdFromUrl(location.href);
}

/**
 * The player response for `videoId`. After in-app navigation `window.ytInitialPlayerResponse`
 * still describes the first video loaded, so prefer the live player and wait for it to catch up.
 */
export async function getPlayerResponse(videoId: string, timeoutMs = 5000): Promise<any | null> {
  return waitFor(() => {
    const candidates = [getPlayer()?.getPlayerResponse?.(), (window as any).ytInitialPlayerResponse];
    return candidates.find((pr) => pr?.videoDetails?.videoId === videoId) ?? null;
  }, timeoutMs);
}

export function readCaptionTracks(playerResponse: any): CaptionTrack[] {
  const raw = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => typeof t?.baseUrl === 'string')
    .map((t) => {
      const isAuto = t.kind === 'asr';
      return {
        id: typeof t.vssId === 'string' ? t.vssId : `${isAuto ? 'a' : ''}.${t.languageCode}`,
        languageCode: String(t.languageCode ?? ''),
        name: textOf(t.name) || String(t.languageCode ?? 'Unknown'),
        isAuto,
        baseUrl: t.baseUrl,
      };
    });
}

export async function getVideoInfo(): Promise<VideoInfo> {
  const videoId = currentVideoId();
  if (!videoId) throw new TranscriptError('NOT_WATCH_PAGE', 'Open a YouTube video to see its transcript.');
  const pr = await getPlayerResponse(videoId);
  if (!pr) throw new TranscriptError('FETCH_FAILED', 'Could not read video details from the page.');
  const details = pr.videoDetails ?? {};
  return {
    videoId,
    title: String(details.title ?? ''),
    author: String(details.author ?? ''),
    lengthSeconds: Number(details.lengthSeconds) || 0,
    isLive: details.isLive === true,
    tracks: readCaptionTracks(pr).map(({ baseUrl: _, ...track }) => track),
  };
}
