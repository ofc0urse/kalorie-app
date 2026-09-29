// Generuje plik Y4M (sztuczna kamera dla Chromium) z kodem EAN-13.
// Użycie: node tests/fixtures/make-barcode-video.mjs 5901234123457 out.y4m
import { writeFileSync } from 'node:fs';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13Bits(code) {
  const d = code.split('').map(Number);
  let bits = '101';
  const p = PARITY[d[0]];
  for (let i = 1; i <= 6; i++) bits += (p[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  return bits;
}

const code = process.argv[2] ?? '5901234123457';
const out = process.argv[3] ?? 'barcode.y4m';
const W = 640;
const H = 480;
const bits = ean13Bits(code);
const module = 4;
const barW = bits.length * module;
const x0 = Math.floor((W - barW) / 2);
const y0 = 140;
const y1 = 340;
const Y = Buffer.alloc(W * H, 235);
for (let y = y0; y < y1; y++) {
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') for (let k = 0; k < module; k++) Y[y * W + x0 + i * module + k] = 16;
  }
}
const UV = Buffer.alloc((W / 2) * (H / 2), 128);
const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
const frames = [];
for (let f = 0; f < 10; f++) frames.push(Buffer.from('FRAME\n'), Y, UV, UV);
writeFileSync(out, Buffer.concat([header, ...frames]));
console.log(`Zapisano ${out} (${code})`);
