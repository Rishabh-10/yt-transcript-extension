// Strategy A: the `get_transcript` endpoint behind YouTube's own "Show transcript" button.
// Runs in the MAIN world so requests carry the page's cookies and client config.
import { findAllByKey } from '../json';
import { parseTranscriptPanel } from '../parse';
import type { Segment } from '../types';
import type { CaptionTrack } from './player';

function ytcfg(key: string): any {
  const cfg = (window as any).ytcfg;
  return cfg?.get?.(key) ?? cfg?.data_?.[key];
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name.replace(/[$.]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/** The header YouTube's web client sends for signed-in requests. Null when signed out. */
async function sapisidHash(): Promise<string | null> {
  const sapisid = readCookie('SAPISID') ?? readCookie('__Secure-3PAPISID');
  if (!sapisid) return null;
  const ts = Math.floor(Date.now() / 1000);
  const input = new TextEncoder().encode(`${ts} ${sapisid} ${location.origin}`);
  const digest = await crypto.subtle.digest('SHA-1', input);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `SAPISIDHASH ${ts}_${hex}`;
}

async function innertubePost(endpoint: 'next' | 'get_transcript', body: object): Promise<any> {
  const context = ytcfg('INNERTUBE_CONTEXT');
  if (!context) throw new Error('INNERTUBE_CONTEXT not found on page');

  const url = new URL(`/youtubei/v1/${endpoint}`, location.origin);
  url.searchParams.set('prettyPrint', 'false');
  const apiKey = ytcfg('INNERTUBE_API_KEY');
  if (apiKey) url.searchParams.set('key', apiKey);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Youtube-Client-Name': String(ytcfg('INNERTUBE_CONTEXT_CLIENT_NAME') ?? 1),
    'X-Youtube-Client-Version': String(ytcfg('INNERTUBE_CLIENT_VERSION') ?? context.client?.clientVersion ?? ''),
    'X-Origin': location.origin,
  };
  const sessionIndex = ytcfg('SESSION_INDEX');
  if (sessionIndex !== undefined && sessionIndex !== null) headers['X-Goog-AuthUser'] = String(sessionIndex);
  const payload = JSON.stringify({ context, ...body });

  // Signed-in first (needed for members-only / age-restricted videos), then anonymous.
  const auth = await sapisidHash();
  if (auth) {
    const res = await fetch(url, { method: 'POST', headers: { ...headers, Authorization: auth }, body: payload });
    if (res.ok) return res.json();
  }
  const res = await fetch(url, { method: 'POST', headers, body: payload });
  if (!res.ok) throw new Error(`${endpoint} returned HTTP ${res.status}`);
  return res.json();
}

function transcriptParamsIn(data: unknown): string | null {
  const endpoint = findAllByKey(data, 'getTranscriptEndpoint', 1)[0] as { params?: unknown } | undefined;
  return typeof endpoint?.params === 'string' ? endpoint.params : null;
}

async function findTranscriptParams(videoId: string): Promise<string | null> {
  // `ytInitialData` is only current for the first video the tab loaded.
  const initial = (window as any).ytInitialData;
  if (initial?.currentVideoEndpoint?.watchEndpoint?.videoId === videoId) {
    const params = transcriptParamsIn(initial);
    if (params) return params;
  }
  return transcriptParamsIn(await innertubePost('next', { videoId }));
}

export async function fetchViaInnertube(
  videoId: string,
  track: CaptionTrack | null,
): Promise<{ segments: Segment[]; trackName: string | null }> {
  const params = await findTranscriptParams(videoId);
  if (!params) throw new Error('no transcript endpoint for this video');

  let panel = parseTranscriptPanel(await innertubePost('get_transcript', { params }));
  let selected = panel.languages.find((l) => l.selected) ?? null;

  if (track && selected?.title !== track.name) {
    const wanted = panel.languages.find((l) => l.title === track.name);
    if (!wanted?.params) throw new Error(`"${track.name}" is not in the transcript language menu`);
    panel = parseTranscriptPanel(await innertubePost('get_transcript', { params: wanted.params }));
    selected = wanted;
  }

  if (panel.segments.length === 0) throw new Error('response had no segments');
  return { segments: panel.segments, trackName: selected?.title ?? null };
}
