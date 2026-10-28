// Genereert voor elk gewas-icoon een PNG-afbeelding in src/assets/crop-icons/.
// Gebruik: node scripts/gen-crop-icons.mjs
//
// Rendert via headless Edge: de emoji wordt met het systeem-emoji-font
// getekend (zelfde beeld als in de app), 128x128 met transparante achtergrond.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src", "assets", "crop-icons");

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const edge = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!edge) {
  console.error("Edge niet gevonden; PNG's kunnen niet gerenderd worden.");
  process.exit(1);
}

// Zelfde lijst als src/cropIcons.ts (CROP_ICONS), maar hier alleen key+emoji.
const ICONS = [
  ["wortel", "🥕"], ["tomaat", "🍅"], ["aardappel", "🥔"], ["komkommer", "🥒"],
  ["paprika", "🫑"], ["peper-heet", "🌶️"], ["jalapeno", "🌶️"], ["cayennepeper", "🌶️"],
  ["adjuma-caribische-peper", "🌶️"], ["habanero", "🌶️"], ["rawit-lombok", "🌶️"], ["mais", "🌽"],
  ["aubergine", "🍆"], ["pompoen", "🎃"], ["broccoli", "🥦"], ["bladgroente", "🥬"],
  ["sla", "🥗"], ["ui", "🧅"], ["knoflook", "🧄"], ["bonen", "🫘"],
  ["erwten", "🫛"], ["biet-knol", "🍠"], ["paddenstoel", "🍄"], ["noten", "🥜"],
  ["zonnebloem", "🌻"], ["kiemplant", "🌱"], ["kruiden", "🌿"], ["graan", "🌾"],
  ["aardbei", "🍓"], ["bessen", "🫐"], ["druiven", "🍇"], ["meloen", "🍈"],
  ["citroen", "🍋"], ["sinaasappel", "🍊"], ["peer", "🍐"], ["perzik", "🍑"],
  ["kers", "🍒"], ["olijf", "🫒"], ["radijs", "🌱"], ["avocado", "🥑"],
  ["mango", "🥭"], ["ananas", "🍍"], ["watermeloen", "🍉"], ["ei", "🥚"],
  ["kokos", "🥥"], ["appel", "🍎"], ["kiwi", "🥝"], ["banaan", "🍌"],
  ["citrus", "🍋"], ["blad", "🍃"], ["rijst", "🍚"], ["specerij", "🧂"],
  ["tulp-bloem", "🌷"], ["kropsla", "🥬"], ["partje", "🍊"], ["graanpot", "🌾"],
  ["witte-kool", "🥬"], ["andijvie", "🥬"], ["rucola", "🥬"], ["boerenkool", "🥬"],
  ["prei", "🧅"], ["venkel", "🧅"], ["pastinaak", "🥕"], ["schorseneer", "🥕"],
  ["mierikswortel", "🥕"], ["raap-koolraap", "🥔"], ["knolselderij", "🥔"], ["artisjok", "🌼"],
  ["asperge", "🌱"], ["bleekselderij", "🌿"], ["pruim", "🍒"], ["bloemkool", "🥦"],
  ["spruitjes", "🥬"], ["augurk", "🥒"], ["courgette", "🥒"], ["spinazie", "🥬"],
];

const SIZE = 128;
const tmpHtml = path.join(os.tmpdir(), "crop-icon-shot.html");
const profileDir = path.join(os.tmpdir(), "crop-icon-shot-profile");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

function html(emoji) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center;font-size:100px;line-height:1}</style></head><body>${emoji}</body></html>`;
}

let written = 0;
for (const [key, emoji] of ICONS) {
  const out = path.join(outDir, `${key}.png`);
  fs.writeFileSync(tmpHtml, html(emoji), "utf8");
  const url = "file:///" + tmpHtml.replace(/\\/g, "/");
  execFileSync(
    edge,
    [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}`,
      `--window-size=${SIZE},${SIZE}`,
      "--default-background-color=00000000",
      `--screenshot=${out}`,
      url,
    ],
    { timeout: 30000, stdio: "pipe" }
  );
  const bytes = fs.statSync(out).size;
  if (bytes < 500) throw new Error(`${key}: screenshot mislukt (${bytes} bytes)`);
  written += 1;
  if (written % 20 === 0) console.log(`${written}/${ICONS.length}...`);
}

fs.rmSync(tmpHtml, { force: true });
console.log(`${written} PNG's geschreven naar ${path.relative(root, outDir)}`);
console.log("Extra afbeeldingen die je zelf in die map zet worden automatisch getoond.");
