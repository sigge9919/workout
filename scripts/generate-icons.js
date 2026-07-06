// Generates the PWA icon set as flat PNGs with no external dependencies
// (hand-rolled PNG encoder + simple pixel-distance shape drawing).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// ---- tiny PNG encoder ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgbaBuffer.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- shape drawing ----
function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : (apx * abx + apy * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx, cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawIcon(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const colorA = [79, 209, 197];   // #4fd1c5 teal
  const colorB = [124, 156, 255];  // #7c9cff blue-violet
  const cx = size / 2, cy = size / 2;

  // Checkmark scaled into the safe zone for maskable icons.
  const scale = maskable ? 0.62 : 0.82;
  const s = size * scale;
  const ox = cx - s / 2, oy = cy - s / 2;
  const p1 = [ox + s * 0.16, oy + s * 0.52];
  const p2 = [ox + s * 0.42, oy + s * 0.76];
  const p3 = [ox + s * 0.86, oy + s * 0.22];
  const strokeR = s * 0.09;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x / size + y / size) / 2;
      let r = lerp(colorA[0], colorB[0], t);
      let g = lerp(colorA[1], colorB[1], t);
      let b = lerp(colorA[2], colorB[2], t);

      // subtle radial highlight top-left
      const hl = Math.max(0, 1 - Math.hypot((x - size * 0.25) / size, (y - size * 0.2) / size) * 1.4);
      r = Math.min(255, r + hl * 25);
      g = Math.min(255, g + hl * 25);
      b = Math.min(255, b + hl * 15);

      const d1 = distToSegment(x, y, p1[0], p1[1], p2[0], p2[1]);
      const d2 = distToSegment(x, y, p2[0], p2[1], p3[0], p3[1]);
      const d = Math.min(d1, d2);
      const edge = strokeR - d;
      const mix = Math.max(0, Math.min(1, edge + 0.5));

      buf[i] = Math.round(lerp(r, 255, mix));
      buf[i + 1] = Math.round(lerp(g, 255, mix));
      buf[i + 2] = Math.round(lerp(b, 255, mix));
      buf[i + 3] = 255;
    }
  }
  return buf;
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const t of targets) {
  const buf = drawIcon(t.size, { maskable: t.maskable });
  const png = encodePNG(t.size, t.size, buf);
  writeFileSync(join(outDir, t.file), png);
  console.log('wrote', t.file, `${png.length} bytes`);
}
