// Strategy B: the caption track URLs from the player response (`/api/timedtext`).
// YouTube often requires a proof-of-origin token (`pot`) on these URLs, which only the
// player can mint. We record the player's own caption requests so we can reuse its token.
import { parseJson3 } from '../parse';
import type { Segment } from '../types';
import { waitFor } from '../util';
import type { CaptionTrack } from './player';

/** Most recent token-bearing timedtext URL the player requested, per video ID. */
const capturedUrls = new Map<string, URL>();

function record(input: unknown) {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, location.origin);
    if (url.pathname !== '/api/timedtext' || !url.searchParams.has('pot')) return;
    const videoId = url.searchParams.get('v');
    if (videoId) capturedUrls.set(videoId, url);
  } catch {
    // Not a URL we care about.
  }
}

/** Must run at document_start, before the player makes its first caption request. */
export function interceptTimedtext() {
  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    record(input);
    return originalFetch.call(this, input, init);
  } as typeof fetch;

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    record(args[1]);
    return (originalOpen as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;
}

async function fetchJson3(url: URL): Promise<Segment[]> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return [];
  const body = await res.text();
  if (!body.trim()) return [];
  try {
    return parseJson3(JSON.parse(body));
  } catch {
    return [];
  }
}

/**
 * Makes the player fetch captions by briefly turning them on, then restores the
 * user's setting. Only used when we have no captured token for this video yet.
 */
async function captureByTogglingCaptions(videoId: string): Promise<URL | null> {
  const button = document.querySelector<HTMLElement>('#movie_player .ytp-subtitles-button');
  if (!button || button.getAttribute('aria-pressed') === 'true') return null;
  button.click();
  try {
    return await waitFor(() => capturedUrls.get(videoId), 4000);
  } finally {
    if (button.getAttribute('aria-pressed') === 'true') button.click();
  }
}

export async function fetchViaTimedtext(videoId: string, track: CaptionTrack): Promise<Segment[]> {
  const url = new URL(track.baseUrl, location.origin);
  url.searchParams.set('fmt', 'json3');

  const direct = await fetchJson3(url);
  if (direct.length > 0) return direct;

  const tokenUrl = capturedUrls.get(videoId) ?? (await captureByTogglingCaptions(videoId));
  if (!tokenUrl) throw new Error('caption URL needs a PO token and none could be captured');
  for (const key of ['pot', 'potc', 'c', 'cver']) {
    const value = tokenUrl.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  const withToken = await fetchJson3(url);
  if (withToken.length === 0) throw new Error('caption URL returned no segments');
  return withToken;
}
