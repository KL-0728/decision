import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public", { recursive: true });
const original = "assets/decision-icon-cute-fork-v2.png";
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
])
  await sharp(original).resize(size, size).png().toFile(`public/${name}`);
await sharp(original)
  .resize(410, 410)
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#d4e8c5" })
  .png()
  .toFile("public/icon-maskable.png");
await sharp(original)
  .resize(1000, 1000)
  .webp({ quality: 85 })
  .toFile("public/illustration.webp");
