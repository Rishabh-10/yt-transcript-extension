import { browser, type Browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { type ExportFormat, exportTranscript, fileNameFor, formatClock } from '@/lib/format';
import { PANEL_PORT, type PanelEvent, type PanelRequest, type PanelResponses } from '@/lib/messages';
import { findActiveIndex, findMatches, splitOnMatches } from '@/lib/segments';
import type { ErrorInfo, Transcript, VideoInfo } from '@/lib/types';
import { sleep } from '@/lib/util';
import './style.css';

const showTimestampsPref = storage.defineItem<boolean>('local:showTimestamps', { fallback: true });
const followVideoPref = storage.defineItem<boolean>('local:followVideo', { fallback: true });

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  title: byId<HTMLHeadingElement>('title'),
  author: byId<HTMLParagraphElement>('author'),
  track: byId<HTMLSelectElement>('track'),
  copy: byId<HTMLButtonElement>('copy'),
  downloadMenu: byId<HTMLDetailsElement>('download-menu'),
  search: byId<HTMLInputElement>('search'),
  matchCount: byId<HTMLSpanElement>('match-count'),
  prevMatch: byId<HTMLButtonElement>('prev-match'),
  nextMatch: byId<HTMLButtonElement>('next-match'),
  optTimestamps: byId<HTMLInputElement>('opt-timestamps'),
  optFollow: byId<HTMLInputElement>('opt-follow'),
  status: byId<HTMLDivElement>('status'),
  list: byId<HTMLOListElement>('segments'),
  footer: byId<HTMLElement>('footer'),
};

/** Don't auto-scroll for this long after the user scrolls the list themselves. */
const MANUAL_SCROLL_GRACE_MS = 4000;

let windowId: number | undefined;
let tabId: number | null = null;
let port: Browser.runtime.Port | null = null;
let video: VideoInfo | null = null;
let transcript: Transcript | null = null;
let rowEls: HTMLButtonElement[] = [];
let textEls: HTMLSpanElement[] = [];
let activeIndex = -1;
let matches: number[] = [];
let matchPos = -1;
let lastManualScroll = 0;
/** Incremented per load so responses for a superseded request are ignored. */
let loadToken = 0;
const cache = new Map<string, Transcript>();
const prefs = { timestamps: true, follow: true };

// ---------- Messaging ----------

async function send<R extends PanelRequest>(request: R): Promise<PanelResponses[R['type']]> {
  const target = tabId;
  // The content script may not be injected yet right after a page load, so retry briefly.
  for (let attempt = 0; target !== null; attempt++) {
    try {
      const response = await browser.tabs.sendMessage(target, request);
      if (response) return response;
    } catch {
      // No receiver in the tab (yet).
    }
    if (attempt >= 2) break;
    await sleep(500);
  }
  return {
    ok: false,
    error: { code: 'NO_CONTENT_SCRIPT', message: 'Reload the YouTube tab to start using the extension.' },
  } as PanelResponses[R['type']];
}

function connectPort() {
  if (tabId === null) return;
  const p = browser.tabs.connect(tabId, { name: PANEL_PORT });
  p.onMessage.addListener((event: PanelEvent) => {
    if (event.type === 'time') updateActive(event.seconds);
    else void loadVideo();
  });
  p.onDisconnect.addListener(() => {
    void browser.runtime.lastError; // Expected when the tab navigates away; don't log it.
    if (port === p) port = null;
  });
  port = p;
}

// ---------- Tab tracking ----------

async function attachToActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, windowId });
  attach(tab?.id ?? null, tab?.url);
}

function attach(id: number | null, url: string | undefined) {
  if (id !== tabId) {
    port?.disconnect();
    port = null;
    tabId = id;
  }
  // `url` is only visible for YouTube tabs (our host permission), which is all we need.
  if (!url?.startsWith('https://www.youtube.com/')) {
    resetVideo();
    showStatus('Open a YouTube video to see its transcript.');
    return;
  }
  void loadVideo();
}

// ---------- Loading ----------

async function loadVideo() {
  const token = ++loadToken;
  showStatus('Loading…');
  const info = await send({ type: 'getVideoInfo' });
  if (token !== loadToken) return;
  if (!info.ok) {
    resetVideo();
    showError(info.error);
    return;
  }
  if (!port) connectPort();
  video = info.value;
  renderHeader(video);
  await loadTranscript();
}

async function loadTranscript(trackId?: string) {
  if (!video) return;
  const token = ++loadToken;
  const videoId = video.videoId;
  const key = `${videoId}|${trackId ?? ''}`;
  let result = cache.get(key);
  if (!result) {
    setTranscriptControlsEnabled(false);
    showStatus('Loading transcript…');
    const response = await send({ type: 'getTranscript', trackId });
    if (token !== loadToken) return;
    if (!response.ok) {
      showError(response.error);
      return;
    }
    // The user navigated to another video while this was loading.
    if (response.value.videoId !== videoId) return;
    result = response.value;
    cache.set(key, result);
  }
  transcript = result;
  renderTranscript(result);
}

// ---------- Rendering ----------

function showStatus(message: string, action?: { label: string; run: () => void }) {
  const text = document.createElement('p');
  text.textContent = message;
  els.status.replaceChildren(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', action.run);
    els.status.append(button);
  }
  els.status.hidden = false;
  els.list.hidden = true;
}

function showError(error: ErrorInfo) {
  switch (error.code) {
    case 'NOT_WATCH_PAGE':
    case 'NO_CAPTIONS':
      showStatus(error.message);
      break;
    case 'NO_CONTENT_SCRIPT':
      showStatus(error.message, {
        label: 'Reload tab',
        run: () => tabId !== null && void browser.tabs.reload(tabId),
      });
      break;
    default:
      showStatus(error.message, { label: 'Try again', run: () => void loadVideo() });
  }
}

function resetVideo() {
  video = null;
  transcript = null;
  rowEls = [];
  textEls = [];
  els.list.replaceChildren();
  els.title.textContent = 'YT transcriber';
  els.author.textContent = '';
  els.track.hidden = true;
  els.footer.textContent = '';
  setTranscriptControlsEnabled(false);
}

function renderHeader(info: VideoInfo) {
  els.title.textContent = info.title || 'Untitled video';
  els.author.textContent = info.author;
  els.track.replaceChildren(
    ...info.tracks.map((track) => new Option(track.name, track.id)),
  );
  els.track.hidden = info.tracks.length === 0;
}

function renderTranscript(t: Transcript) {
  const fragment = document.createDocumentFragment();
  rowEls = [];
  textEls = [];
  t.segments.forEach((segment, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'segment';
    row.dataset.index = String(i);
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = formatClock(segment.start);
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = segment.text;
    row.append(ts, text);
    const item = document.createElement('li');
    item.append(row);
    fragment.append(item);
    rowEls.push(row);
    textEls.push(text);
  });
  els.list.replaceChildren(fragment);
  els.status.hidden = true;
  els.list.hidden = false;
  activeIndex = -1;
  matches = [];
  if (t.trackId) els.track.value = t.trackId;
  els.footer.textContent = `${t.segments.length} lines · via ${t.source}`;
  setTranscriptControlsEnabled(true);
  applySearch();
}

function setTranscriptControlsEnabled(enabled: boolean) {
  for (const el of [els.copy, els.search, els.prevMatch, els.nextMatch, els.track]) {
    el.disabled = !enabled;
  }
  els.downloadMenu.querySelector('summary')!.setAttribute('aria-disabled', String(!enabled));
  if (!enabled) els.downloadMenu.open = false;
}

function updateActive(seconds: number) {
  if (!transcript) return;
  const index = findActiveIndex(transcript.segments, seconds);
  if (index === activeIndex) return;
  rowEls[activeIndex]?.classList.remove('active');
  rowEls[index]?.classList.add('active');
  activeIndex = index;

  const searching = els.search.value.trim() !== '';
  const userScrolling = Date.now() - lastManualScroll < MANUAL_SCROLL_GRACE_MS;
  if (prefs.follow && !searching && !userScrolling) {
    rowEls[index]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// ---------- Search ----------

function renderText(index: number, query: string) {
  const el = textEls[index];
  const segment = transcript?.segments[index];
  if (!el || !segment) return;
  el.replaceChildren(
    ...splitOnMatches(segment.text, query).map((piece) => {
      if (!piece.match) return document.createTextNode(piece.text);
      const mark = document.createElement('mark');
      mark.textContent = piece.text;
      return mark;
    }),
  );
}

function applySearch() {
  if (!transcript) return;
  const query = els.search.value;
  const previous = matches;
  matches = findMatches(transcript.segments, query);
  // Only re-render rows whose highlighting changed.
  for (const i of new Set([...previous, ...matches])) renderText(i, query);
  goToMatch(matches.length > 0 ? 0 : -1);
}

function goToMatch(pos: number) {
  rowEls[matches[matchPos] ?? -1]?.classList.remove('current-match');
  matchPos = pos;
  const row = rowEls[matches[pos] ?? -1];
  row?.classList.add('current-match');
  row?.scrollIntoView({ block: 'center' });
  const query = els.search.value.trim();
  els.matchCount.textContent = query ? `${matches.length ? pos + 1 : 0}/${matches.length}` : '';
}

function stepMatch(delta: number) {
  if (matches.length === 0) return;
  goToMatch((matchPos + delta + matches.length) % matches.length);
}

// ---------- Actions ----------

function flash(button: HTMLButtonElement, label: string) {
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => (button.textContent = original), 1500);
}

function download(format: ExportFormat) {
  if (!transcript || !video) return;
  const { content, mimeType } = exportTranscript(format, transcript.segments, video, {
    timestamps: prefs.timestamps,
  });
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameFor(video.title, format);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyPrefs() {
  els.optTimestamps.checked = prefs.timestamps;
  els.optFollow.checked = prefs.follow;
  document.body.classList.toggle('hide-timestamps', !prefs.timestamps);
}

function bindUi() {
  els.list.addEventListener('click', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.segment');
    const segment = transcript?.segments[Number(row?.dataset.index)];
    if (segment) void send({ type: 'seek', seconds: segment.start });
  });
  for (const type of ['wheel', 'touchmove'] as const) {
    els.list.parentElement!.addEventListener(type, () => (lastManualScroll = Date.now()), { passive: true });
  }

  els.track.addEventListener('change', () => void loadTranscript(els.track.value));

  els.copy.addEventListener('click', async () => {
    if (!transcript || !video) return;
    const { content } = exportTranscript('txt', transcript.segments, video, { timestamps: prefs.timestamps });
    try {
      await navigator.clipboard.writeText(content.trimEnd());
      flash(els.copy, 'Copied!');
    } catch {
      flash(els.copy, 'Copy failed');
    }
  });

  els.downloadMenu.addEventListener('click', (event) => {
    const format = (event.target as HTMLElement).closest<HTMLElement>('[data-format]')?.dataset.format;
    if (!format) return;
    download(format as ExportFormat);
    els.downloadMenu.open = false;
  });
  document.addEventListener('click', (event) => {
    if (!els.downloadMenu.contains(event.target as Node)) els.downloadMenu.open = false;
  });

  els.search.addEventListener('input', applySearch);
  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      stepMatch(event.shiftKey ? -1 : 1);
    }
  });
  els.prevMatch.addEventListener('click', () => stepMatch(-1));
  els.nextMatch.addEventListener('click', () => stepMatch(1));

  els.optTimestamps.addEventListener('change', () => {
    prefs.timestamps = els.optTimestamps.checked;
    applyPrefs();
    void showTimestampsPref.setValue(prefs.timestamps);
  });
  els.optFollow.addEventListener('change', () => {
    prefs.follow = els.optFollow.checked;
    void followVideoPref.setValue(prefs.follow);
  });
}

async function init() {
  [prefs.timestamps, prefs.follow] = await Promise.all([
    showTimestampsPref.getValue(),
    followVideoPref.getValue(),
  ]);
  applyPrefs();
  bindUi();
  resetVideo();

  windowId = (await browser.windows.getCurrent()).id;
  browser.tabs.onActivated.addListener((info) => {
    if (info.windowId === windowId) void attachToActiveTab();
  });
  browser.tabs.onUpdated.addListener((id, change, tab) => {
    // In-app navigation is reported over the port; this catches full page loads,
    // where the old content script (and its port) went away.
    if (id === tabId && change.status === 'complete' && !port) attach(id, tab.url);
  });
  await attachToActiveTab();
}

void init();
