// Tries each strategy in order of reliability until one returns segments.
import { normalizeSegments } from '../parse';
import { TranscriptError, type Segment, type Transcript, type TranscriptSource } from '../types';
import { fetchViaDom } from './dom';
import { fetchViaInnertube } from './innertube';
import { type CaptionTrack, currentVideoId, getPlayerResponse, readCaptionTracks } from './player';
import { fetchViaTimedtext } from './timedtext';

/** YouTube's default is usually the uploaded track; fall back to auto-generated. */
function defaultTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  return tracks.find((t) => !t.isAuto) ?? tracks[0] ?? null;
}

export async function getTranscript(trackId?: string): Promise<Transcript> {
  const videoId = currentVideoId();
  if (!videoId) throw new TranscriptError('NOT_WATCH_PAGE', 'Open a YouTube video to see its transcript.');

  const tracks = readCaptionTracks(await getPlayerResponse(videoId));
  const requested = trackId ? (tracks.find((t) => t.id === trackId) ?? null) : null;
  const failures: string[] = [];

  const attempt = async (
    source: TranscriptSource,
    run: () => Promise<{ segments: Segment[]; trackName: string | null }>,
  ): Promise<Transcript | null> => {
    try {
      const { segments, trackName } = await run();
      const normalized = normalizeSegments(segments);
      if (normalized.length > 0) {
        const track = tracks.find((t) => t.name === trackName) ?? null;
        return { videoId, trackId: track?.id ?? null, source, segments: normalized };
      }
      failures.push(`${source}: no segments`);
    } catch (err) {
      failures.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  };

  const timedtextTrack = requested ?? defaultTrack(tracks);
  const result =
    (await attempt('innertube', () => fetchViaInnertube(videoId, requested))) ??
    (timedtextTrack
      ? await attempt('timedtext', async () => ({
          segments: await fetchViaTimedtext(videoId, timedtextTrack),
          trackName: timedtextTrack.name,
        }))
      : null) ??
    // The page's panel only shows its default language.
    (!requested ? await attempt('dom', async () => ({ segments: await fetchViaDom(), trackName: null })) : null);

  if (result) return result;

  console.debug('[yt-transcript] all strategies failed:', failures);
  if (tracks.length === 0) {
    throw new TranscriptError('NO_CAPTIONS', "This video doesn't have captions or a transcript.");
  }
  throw new TranscriptError('FETCH_FAILED', `Couldn't load the transcript (${failures.join('; ')}).`);
}
