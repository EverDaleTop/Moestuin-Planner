// Verkleint alle gewas-icoontjes naar 128×128 WebP (transparant).
// Gebruik: node scripts/optimize-crop-icons.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = path.resolve("src/assets/crop-icons");
const pngs = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f));
let before = 0;
let after = 0;

for (const file of pngs) {
  const base = file.replace(/\.png$/i, "");
  const src = path.join(dir, file);
  const out = path.join(dir, `${base}.webp`);
  await sharp(src)
    .resize(128, 128, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 86, alphaQuality: 100, effort: 6 })
    .toFile(out);
  const a = fs.statSync(src).size;
  const b = fs.statSync(out).size;
  before += a;
  after += b;
  console.log(`${base}: ${Math.round(a / 1024)} KB -> ${Math.round(b / 1024)} KB`);
}

for (const file of pngs) fs.rmSync(path.join(dir, file));
console.log(
  `Klaar: ${pngs.length} iconen, ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024).toFixed(0)} KB`
);
