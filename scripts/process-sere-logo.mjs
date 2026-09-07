/**
 * Build brand assets.
 * UI lockup: public/sere-logo.png (icon + wordmark); in-app icon mark:
 * public/sere-icon.png, both derived from the uploaded lockup.
 * Home screen / PWA / favicon: the finished full-bleed app-icon tile at
 * public/sere-app-icon.png (purple background, white mark).
 */
import sharp from "sharp";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";

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
const stripZoom = 1.08;
const zoomedW = Math.round((stripMeta.width ?? 0) * stripZoom);
const zoomedH = Math.round((stripMeta.height ?? 0) * stripZoom);
const zoomedStrip = await sharp(iconStrip).resize(zoomedW, zoomedH).png().toBuffer();
const zoomMeta = await sharp(zoomedStrip).metadata();
const side = Math.max(zoomMeta.width ?? 0, zoomMeta.height ?? 0);
const padLeft = Math.floor((side - (zoomMeta.width ?? 0)) / 2);
const padTop = Math.floor((side - (zoomMeta.height ?? 0)) / 2);

await sharp({
  create: {
    width: side,
    height: side,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: zoomedStrip, left: Math.max(0, padLeft), top: Math.max(0, padTop) }])
  .png()
  .toFile(ICON_OUT);

console.log(`Icon mark: ${extractW}px wide → ${ICON_OUT} (${side}×${side})`);

/**
 * Home screen / PWA / favicon assets come from the finished full-bleed app-icon
 * tile (purple background, white mark with safe padding for maskable icons).
 * Resize the tile directly rather than re-framing the extracted mark.
 */
const APP_ICON = "public/sere-app-icon.png";

if (!existsSync(APP_ICON)) {
  console.error(`Missing ${APP_ICON}`);
  process.exit(1);
}

async function appIcon(size, out, palette = false) {
  const buf = await sharp(APP_ICON)
    .resize(size, size, { fit: "cover" })
    .png(palette ? { palette: true, colours: 256, quality: 100, dither: 1 } : {})
    .toBuffer();
  await writeFile(out, buf);
}

await appIcon(32, "public/favicon.png");
await appIcon(32, "public/favicon.ico");
await appIcon(192, "public/icon-192.png");
await appIcon(512, "public/icon-512.png");
await appIcon(192, "public/apple-touch-icon.png");
await appIcon(192, "public/apple-touch-icon-precomposed.png");
await appIcon(1024, "ios/Sere/Assets.xcassets/AppIcon.appiconset/AppIcon.png", true);
console.log("Built favicon, web home-screen icons, and the iOS AppIcon from sere-app-icon.png");
