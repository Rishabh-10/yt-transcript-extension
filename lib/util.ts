export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns a non-null value or `timeoutMs` passes. */
export async function waitFor<T>(
  check: () => T | null | undefined,
  timeoutMs: number,
  intervalMs = 150,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== null && value !== undefined) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

/** The video ID if the URL is a watch page, otherwise null. */
export function videoIdFromUrl(url: string | URL): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'www.youtube.com' || parsed.pathname !== '/watch') return null;
  return parsed.searchParams.get('v');
}
