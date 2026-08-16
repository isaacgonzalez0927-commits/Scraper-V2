/**
 * Build favicon / PWA icons from public/sere-logo.png (your lockup PNG).
 * Crops the left icon mark for small icons; keeps full lockup for the app.
 */
import sharp from "sharp";
import { existsSync } from "node:fs";

const SRC = "public/sere-logo.png";

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. Add your transparent-background lockup PNG there first.`);
  process.exit(1);
}

const meta = await sharp(SRC).metadata();
const width = meta.width ?? 0;
const height = meta.height ?? 0;
const iconWidth = Math.round(width * 0.42);

const icon = await sharp(SRC)
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
console.log("Processed sere-logo.png → favicon.png, icon-192.png, icon-512.png");
