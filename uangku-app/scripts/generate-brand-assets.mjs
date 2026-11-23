/**
 * Rasterizes the brand sources in scripts/brand/ into the files the web app serves.
 *
 * Run after editing any source SVG: `node scripts/generate-brand-assets.mjs`.
 * sharp is already a dependency, so this needs no extra install.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(here, '..', 'static');
const brandDir = path.join(here, 'brand');

/**
 * Width of one text run, in pixels, with the rasterizer's own font fallback.
 * The share card is rasterized on a host without Instrument Sans, and the fallback
 * (DejaVu Sans) is wider, so a string that fits in the browser can still be clipped here.
 */
async function textWidth(text, size, weight) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="300"><rect width="1400" height="300" fill="#000"/><text x="20" y="200" font-family="DejaVu Sans" font-size="${size}" font-weight="${weight}" fill="#fff">${text.replace(/&/g, '&amp;')}</text></svg>`;
	const png = await sharp(Buffer.from(svg)).png().toBuffer();
	const { info } = await sharp(png).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
	return info.width;
}

/** Every text run on the share card, with the width it has to stay inside. */
const cardTexts = [
	['Uangku', 104, 'bold', 660],
	['Catat keuangan tanpa ribet.', 36, 'normal', 660],
	['Offline-first', 30, 'bold', 200],
	['Rupiah', 30, 'bold', 136],
	['TOTAL SALDO BERSIH', 24, 'bold', 316],
	['Rp 12.480.000', 38, 'bold', 316],
	['Dompet & kategori', 24, 'normal', 316],
	['akularping.my.id', 26, 'normal', 400]
];

for (const [text, size, weight, limit] of cardTexts) {
	const width = await textWidth(text, size, weight);
	const state = width > limit ? 'OVERFLOW' : 'ok';
	console.log(`og text ${state.padEnd(8)} ${width}px / ${limit}px  "${text}"`);
	if (width > limit) throw new Error(`Text overflows its box in scripts/brand/og.svg: "${text}"`);
}

const mark = await readFile(path.join(brandDir, 'mark.svg'));
const maskable = await readFile(path.join(brandDir, 'maskable.svg'));
const og = await readFile(path.join(brandDir, 'og.svg'));

/** @param {Buffer} svg @param {number} size */
const png = (svg, size) =>
	sharp(svg, { density: 384 })
		.resize(size, size, { fit: 'contain' })
		.png({ compressionLevel: 9 })
		.toBuffer();

const targets = [
	// `any`: the full mark, transparent corners, drawn edge to edge.
	['icon-192.png', await png(mark, 192)],
	['icon-512.png', await png(mark, 512)],
	['favicon-32.png', await png(mark, 32)],
	// `maskable` and iOS: full-bleed square, mark inside the safe zone.
	['icon-maskable-192.png', await png(maskable, 192)],
	['icon-maskable-512.png', await png(maskable, 512)],
	['apple-touch-icon.png', await png(maskable, 180)],
	// Share card, 1200x630: what each network crops from. Flat art, so a palette keeps it small.
	[
		'og-image.png',
		await sharp(og, { density: 384 })
			.resize(1200, 630, { fit: 'contain' })
			.png({ compressionLevel: 9, palette: true, effort: 10 })
			.toBuffer()
	]
];

for (const [name, data] of targets) {
	await writeFile(path.join(staticDir, name), data);
	console.log(`${name.padEnd(24)} ${(data.length / 1024).toFixed(1)} kB`);
}

// The favicon is the same artwork, so it cannot drift from the PNGs.
await writeFile(path.join(staticDir, 'favicon.svg'), mark);
console.log('favicon.svg              (copy of scripts/brand/mark.svg)');
