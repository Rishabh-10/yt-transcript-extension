// Runs in the page's own JavaScript context, where YouTube's player objects live.
// It has no extension APIs; it answers requests from content.ts over window.postMessage.
import {
  type BridgeRequest,
  type BridgeResponse,
  CONTENT_SOURCE,
  MAIN_SOURCE,
  type MainMethod,
} from '@/lib/messages';
import { toErrorInfo, type Result } from '@/lib/types';
import { getVideoInfo } from '@/lib/youtube/player';
import { interceptTimedtext } from '@/lib/youtube/timedtext';
import { getTranscript } from '@/lib/youtube/transcript';

const handlers: { [M in MainMethod]: (args: BridgeRequest<M>['args']) => Promise<unknown> } = {
  getVideoInfo: () => getVideoInfo(),
  getTranscript: ({ trackId }) => getTranscript(trackId),
};

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    interceptTimedtext();

    window.addEventListener('message', async (event: MessageEvent) => {
      if (event.source !== window) return;
      const request = event.data as BridgeRequest | undefined;
      if (request?.source !== CONTENT_SOURCE || !(request.method in handlers)) return;

      let result: Result<unknown>;
      try {
        const handler = handlers[request.method] as (args: unknown) => Promise<unknown>;
        result = { ok: true, value: await handler(request.args ?? {}) };
      } catch (err) {
        result = { ok: false, error: toErrorInfo(err) };
      }
      const response: BridgeResponse = { source: MAIN_SOURCE, id: request.id, result };
      window.postMessage(response, location.origin);
    });
  },
});
