/**
 * Renders the app icons into public/icons/.
 *
 * Run with `npm run icons`. The output PNGs are committed, so a normal build
 * and a Netlify deploy never need this script — it only runs when the icon
 * design changes.
 *
 * The wordmark font is decompressed straight out of the @fontsource woff2 the
 * app itself ships, so the icon and the in-app wordmark can never drift apart.
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';

import { INK, PAPER, markup } from './icon.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');

const WOFF2 = resolve(root, 'node_modules/@fontsource/sniglet/files/sniglet-latin-800-normal.woff2');

/** resvg reads ttf/otf, @fontsource ships woff2 only. */
async function snigletTtf() {
  const ttf = await decompress(await readFile(WOFF2));
  const path = join(await mkdtemp(join(tmpdir(), 'ootd-icons-')), 'sniglet.ttf');
  await writeFile(path, ttf);
  return path;
}

function render(svg, fontFile, size) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { fontFiles: [fontFile], loadSystemFonts: false, defaultFontFamily: 'Sniglet' },
  })
    .render()
    .asPng();
}

const icons = [
  // Standard icons: generous margin, per spec.
  { file: 'icon-192.png', size: 192, inset: 0.62 },
  { file: 'icon-512.png', size: 512, inset: 0.62 },
  { file: 'icon-1024.png', size: 1024, inset: 0.62 },
  // iOS home screen. iOS applies its own corner radius and does not respect
  // transparency, so this is the same opaque square.
  { file: 'apple-touch-icon.png', size: 180, inset: 0.62 },
  // Maskable: Android may crop to a circle, so the wordmark sits well inside
  // the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, inset: 0.46 },
  // Dark-mode favicon companion; browsers pick whichever matches.
  { file: 'favicon-32.png', size: 32, inset: 0.72 },
];

await mkdir(outDir, { recursive: true });
const fontFile = await snigletTtf();

for (const { file, size, inset } of icons) {
  const svg = markup({ size, inset, ground: PAPER, ink: INK });
  await writeFile(resolve(outDir, file), render(svg, fontFile, size));
  console.log(`icons/${file}  ${size}×${size}`);
}

// Keep an SVG alongside for the browser tab, which renders it far more sharply
// than a 32px PNG. Inlines nothing — falls back to the PNG where unsupported.
await writeFile(resolve(outDir, 'icon.svg'), markup({ size: 512, inset: 0.62 }));
console.log('icons/icon.svg');
