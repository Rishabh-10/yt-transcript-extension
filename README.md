# YouTube Transcript

A Chrome extension (Manifest V3) that shows the transcript of the YouTube video you're watching in the browser side panel. You can:

- click any line to jump to that moment
- follow along as the current line is highlighted
- search the transcript
- switch caption languages
- copy the transcript, or download it as `.txt`, `.srt`, `.vtt` or `.md`

Built with [WXT](https://wxt.dev) and TypeScript. It has no runtime dependencies.

## Development

```sh
npm install
npm run dev      # opens a Chrome window with the extension loaded and live reload
npm test         # unit tests (Vitest)
npm run compile  # type-check
npm run build    # production build in .output/chrome-mv3
npm run zip      # zip for the Chrome Web Store
```

To load a build by hand, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.

After you install or reload the extension, reload any YouTube tabs that were already open. Chrome doesn't add content scripts to pages that are already loaded.

## How it works

```
youtube.com tab
  main-world.content.ts   page context: reads YouTube's player data, fetches the transcript
        ▲ window.postMessage ▼
  content.ts              isolated content script: relays requests, pushes time/navigation events
        ▲ tabs.sendMessage / port ▼
sidepanel/                the UI
background.ts             makes the toolbar icon open the side panel
```

YouTube has no public transcript API, so `lib/youtube/transcript.ts` tries three methods in order:

1. **innertube**: `POST /youtubei/v1/get_transcript`, the same request YouTube's own "Show transcript" button makes.
2. **timedtext**: the caption track URLs from the player response (`fmt=json3`). YouTube often requires a proof-of-origin token (`pot`) on these URLs. To get one, the page script records the player's own caption requests. If none has been recorded, it turns captions on briefly so the player makes one.
3. **dom**: opens YouTube's transcript panel and reads it.

The panel footer shows which method succeeded. When all three fail, the page's DevTools console logs the reasons under `[yt-transcript]`.

## Project layout

| Path | Purpose |
|---|---|
| `entrypoints/` | Extension entry points: background, content scripts, side panel |
| `lib/youtube/` | Code that runs inside the YouTube page: reading the player, the three fetch methods |
| `lib/parse.ts` | Turns raw YouTube responses into `Segment[]` |
| `lib/format.ts` | Exports to plain text, SRT, WebVTT and Markdown |
| `lib/segments.ts` | Finding the current line and search helpers |
| `tests/` | Unit tests. The fixtures in `tests/fixtures/` are hand-written to match YouTube's response shapes. |
| `scripts/generate-icons.mjs` | Regenerates `public/icon/*.png` |

## Manual test checklist

YouTube changes its internals often, so run through this list before each release:

- [ ] Video with uploaded captions
- [ ] Video with only auto-generated captions
- [ ] Video with several languages: switching language works
- [ ] Video with no captions: shows "doesn't have captions"
- [ ] Live stream or premiere
- [ ] Age-restricted video, signed in
- [ ] Clicking from video to video, including autoplay and playlists: the panel follows
- [ ] Full page reload while the panel is open
- [ ] Switching between YouTube and non-YouTube tabs
- [ ] Signed in and signed out
- [ ] Footer shows `via innertube`. If it shows another method, check whether innertube broke.
