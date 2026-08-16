/**
 * Build icon-only assets for favicon / home screen from the lockup PNG.
 * UI uses public/sere-logo.png (icon + wordmark). PWA uses icon mark only.
 */
import sharp from "sharp";
import { existsSync } from "node:fs";

const UPLOAD = "public/sere.logo.PNG";
const LOCKUP = "public/sere-logo.png";
const ICON_OUT = "public/sere-icon.png";

if (existsSync(UPLOAD)) {
  await sharp(UPLOAD).trim({ threshold: 1 }).png().toFile(LOCKUP);
  console.log(`Normalized ${UPLOAD} → ${LOCKUP}`);
} else if (!existsSync(LOCKUP)) {
  console.error("Missing public/sere-logo.png or public/sere.logo.PNG");
  process.exit(1);
}

/** Find where the ribbon mark ends before the wordmark gap. */
async function detectIconWidth(path) {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  let lastContent = 0;
  for (let x = 0; x < w; x++) {
    let opaque = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 20) opaque++;
    }
    if (opaque > 12) lastContent = x;
    else if (lastContent > 30 && opaque < 3) return lastContent + 1;
  }
  return lastContent + 1;
}

const lockupW = (await sharp(LOCKUP).metadata()).width ?? 0;
const iconW = await detectIconWidth(LOCKUP);
const extractW = Math.min(lockupW, Math.max(iconW + 4, Math.round(lockupW * 0.28)));

const iconStrip = await sharp(LOCKUP)
  .extract({ left: 0, top: 0, width: extractW, height: (await sharp(LOCKUP).metadata()).height ?? 0 })
  .trim({ threshold: 1 })
  .png()
  .toBuffer();

const stripMeta = await sharp(iconStrip).metadata();
const side = Math.max(stripMeta.width ?? 0, stripMeta.height ?? 0);
const padLeft = Math.floor((side - (stripMeta.width ?? 0)) / 2);
const padTop = Math.floor((side - (stripMeta.height ?? 0)) / 2);

await sharp({
  create: {
    width: side,
    height: side,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: iconStrip, left: padLeft, top: padTop }])
  .png()
  .toFile(ICON_OUT);

console.log(`Icon mark: ${extractW}px wide → ${ICON_OUT} (${side}×${side})`);

async function onLavender(size, out) {
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${size * 0.23}" fill="#F5F1FF"/></svg>`
  );
  const mark = await sharp(ICON_OUT).resize(Math.round(size * 0.68)).png().toBuffer();
  const m = await sharp(mark).metadata();
  const left = Math.round((size - m.width) / 2);
  const top = Math.round((size - m.height) / 2);
  await sharp(bg).composite([{ input: mark, left, top }]).png().toFile(out);
}

await sharp(ICON_OUT).resize(32, 32).png().toFile("public/favicon.png");
await onLavender(192, "public/icon-192.png");
await onLavender(512, "public/icon-512.png");
console.log("Built favicon.png, icon-192.png, icon-512.png (icon mark only)");
