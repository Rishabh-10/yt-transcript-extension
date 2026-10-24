/**
 * Collects every value stored under `key` anywhere inside `root`, in document order.
 *
 * YouTube's JSON is deeply nested and its paths shift often, so searching by
 * renderer name is far more durable than hard-coding the full path.
 */
export function findAllByKey(root: unknown, key: string, limit = Infinity): unknown[] {
  const found: unknown[] = [];
  const stack: unknown[] = [root];
  while (stack.length > 0 && found.length < limit) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    const children = Array.isArray(node) ? node : Object.values(node);
    if (!Array.isArray(node) && key in node) {
      found.push((node as Record<string, unknown>)[key]);
    }
    // Push in reverse so children are visited in their original order.
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return found;
}

/** Reads YouTube's two text shapes: `{ simpleText }` and `{ runs: [{ text }] }`. */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object') return '';
  const v = value as { simpleText?: unknown; runs?: unknown };
  if (typeof v.simpleText === 'string') return v.simpleText;
  if (Array.isArray(v.runs)) {
    return v.runs.map((run) => (typeof run?.text === 'string' ? run.text : '')).join('');
  }
  return '';
}
