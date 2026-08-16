/**
 * Normalize public/sere-logo.png from the uploaded asset, then build favicons.
 * Accepts public/sere.logo.PNG (GitHub upload) or existing sere-logo.png.
 */
import sharp from "sharp";
import { existsSync, copyFileSync } from "node:fs";

const UPLOAD = "public/sere.logo.PNG";
const OUT = "public/sere-logo.png";

if (existsSync(UPLOAD)) {
  await sharp(UPLOAD).trim({ threshold: 1 }).png().toFile(OUT);
  console.log(`Normalized ${UPLOAD} → ${OUT}`);
} else if (!existsSync(OUT)) {
  console.error(
    `Missing logo. Upload your PNG as public/sere.logo.PNG or public/sere-logo.png`
  );
  process.exit(1);
}

const meta = await sharp(OUT).metadata();
const width = meta.width ?? 0;
const height = meta.height ?? 0;
const iconWidth = Math.round(width * 0.42);

const icon = await sharp(OUT)
  .extract({ left: 0, top: 0, width: iconWidth, height })
  .png()
  .toBuffer();

async function onLavender(size, out) {
  const bg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${size * 0.23}" fill="#F5F1FF"/></svg>`
  );
  const mark = await sharp(icon).resize(Math.round(size * 0.72)).png().toBuffer();
  const m = await sharp(mark).metadata();
  const left = Math.round((size - m.width) / 2);
  const top = Math.round((size - m.height) / 2);
  await sharp(bg).composite([{ input: mark, left, top }]).png().toFile(out);
}

await sharp(icon).resize(32, 32).png().toFile("public/favicon.png");
await onLavender(192, "public/icon-192.png");
await onLavender(512, "public/icon-512.png");
console.log("Built favicon.png, icon-192.png, icon-512.png");
