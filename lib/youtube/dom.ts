// Strategy C: open YouTube's own transcript panel and read it. Most fragile, so it runs last.
import { parseDomRows } from '../parse';
import type { Segment } from '../types';
import { waitFor } from '../util';

const PANEL =
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
const EXPANDED = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
const HIDDEN = 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN';

export async function fetchViaDom(): Promise<Segment[]> {
  const wasOpen = document.querySelector(PANEL)?.getAttribute('visibility') === EXPANDED;
  if (!wasOpen) {
    const button = document.querySelector<HTMLElement>(
      'ytd-video-description-transcript-section-renderer button',
    );
    if (!button) throw new Error('no "Show transcript" button on the page');
    button.click();
  }

  try {
    const rows = await waitFor(() => {
      const found = document.querySelectorAll(`${PANEL} ytd-transcript-segment-renderer`);
      return found.length > 0 ? Array.from(found) : null;
    }, 8000);
    if (!rows) throw new Error('transcript panel did not load');

    return parseDomRows(
      rows.map((row) => ({
        timestamp: row.querySelector('.segment-timestamp')?.textContent ?? '',
        text: row.querySelector('.segment-text')?.textContent ?? '',
      })),
    );
  } finally {
    if (!wasOpen) document.querySelector(PANEL)?.setAttribute('visibility', HIDDEN);
  }
}
