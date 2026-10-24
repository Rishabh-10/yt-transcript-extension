// Generates public/icon/{16,32,48,128}.png: a rounded square with "transcript lines".
// Run with `node scripts/generate-icons.mjs`. No dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [79, 70, 229]; // #4f46e5
const FG = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Coverage (0..1) of pixel (x, y) by a rounded rect, sampled 4x4 for anti-aliasing. */
function coverage(x, y, rect) {
  let hits = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4;
      const py = y + (sy + 0.5) / 4;
      const { x0, y0, x1, y1, r } = rect;
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      const cx = Math.max(x0 + r, Math.min(px, x1 - r));
      const cy = Math.max(y0 + r, Math.min(py, y1 - r));
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) hits++;
    }
  }
  return hits / 16;
}

function render(size) {
  const s = size / 128;
  const bg = { x0: 4 * s, y0: 4 * s, x1: 124 * s, y1: 124 * s, r: 26 * s };
  const h = Math.max(1.5, 10 * s);
  const lines = [
    [28, 34, 100],
    [28, 59, 84],
    [28, 84, 92],
  ].map(([x0, y, x1]) => ({ x0: x0 * s, y0: y * s, x1: x1 * s, y1: y * s + h, r: h / 2 }));

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0 + RGBA
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, bg);
      const f = Math.max(...lines.map((l) => coverage(x, y, l)));
      const rgb = BG.map((c, i) => Math.round(c + (FG[i] - c) * f));
      row.set([...rgb, Math.round(a * 255)], 1 + x * 4);
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/icon/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`${size}.png`, outDir), render(size));
}
console.log('Wrote icons to public/icon/');
