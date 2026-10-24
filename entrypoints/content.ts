// Isolated-world content script: relays between the side panel and the MAIN-world script,
// and pushes playback time / navigation events to any connected panel.
import { browser, type Browser } from 'wxt/browser';
import {
  type BridgeRequest,
  type BridgeResponse,
  CONTENT_SOURCE,
  MAIN_SOURCE,
  type MainMethod,
  type MainMethods,
  PANEL_PORT,
  type PanelEvent,
  type PanelRequest,
} from '@/lib/messages';
import type { Result } from '@/lib/types';
import { videoIdFromUrl } from '@/lib/util';

const MAIN_TIMEOUT_MS = 30_000;

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  main(ctx) {
    const pending = new Map<number, (result: Result<unknown>) => void>();
    let nextId = 1;

    ctx.addEventListener(window, 'message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const response = event.data as BridgeResponse | undefined;
      if (response?.source !== MAIN_SOURCE) return;
      pending.get(response.id)?.(response.result);
      pending.delete(response.id);
    });

    function callMain<M extends MainMethod>(
      method: M,
      args: MainMethods[M]['args'],
    ): Promise<Result<MainMethods[M]['result']>> {
      return new Promise((resolve) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: { code: 'TIMEOUT', message: 'The YouTube page did not respond.' } });
        }, MAIN_TIMEOUT_MS);
        pending.set(id, (result) => {
          clearTimeout(timer);
          resolve(result as Result<MainMethods[M]['result']>);
        });
        const request: BridgeRequest<M> = { source: CONTENT_SOURCE, id, method, args };
        window.postMessage(request, location.origin);
      });
    }

    function seek(seconds: number): Result<null> {
      const video = document.querySelector<HTMLVideoElement>('#movie_player video');
      if (!video) return { ok: false, error: { code: 'FETCH_FAILED', message: 'No video player found.' } };
      video.currentTime = seconds;
      return { ok: true, value: null };
    }

    browser.runtime.onMessage.addListener((message: PanelRequest, _sender, sendResponse) => {
      const reply = (async () => {
        switch (message.type) {
          case 'getVideoInfo':
            return callMain('getVideoInfo', {});
          case 'getTranscript':
            return callMain('getTranscript', { trackId: message.trackId });
          case 'seek':
            return seek(message.seconds);
        }
      })();
      reply.then(sendResponse);
      return true; // Keep the channel open for the async reply.
    });

    // Panels connect while open; only then do we bother sending time updates.
    const ports = new Set<Browser.runtime.Port>();
    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== PANEL_PORT) return;
      ports.add(port);
      port.onDisconnect.addListener(() => ports.delete(port));
    });
    const broadcast = (event: PanelEvent) => ports.forEach((port) => port.postMessage(event));

    // Media events don't bubble, but they can be caught in the capture phase.
    ctx.addEventListener(
      document,
      'timeupdate',
      (event: Event) => {
        if (ports.size === 0) return;
        const video = event.target;
        if (video instanceof HTMLVideoElement && video.closest('#movie_player')) {
          broadcast({ type: 'time', seconds: video.currentTime });
        }
      },
      { capture: true },
    );

    // YouTube is a single-page app; this fires after each in-app navigation.
    ctx.addEventListener(document, 'yt-navigate-finish', () => {
      broadcast({ type: 'videoChanged', videoId: videoIdFromUrl(location.href) });
    });
  },
});
