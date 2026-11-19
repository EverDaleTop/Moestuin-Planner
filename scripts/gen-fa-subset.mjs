// Genereert een minimale Font Awesome-CSS + een subset van het solid-font
// met alleen de iconen die de app echt gebruikt.
// Gebruik: node scripts/gen-fa-subset.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const faDir = path.join(root, "node_modules", "@fortawesome", "fontawesome-free");
const css = fs.readFileSync(path.join(faDir, "css", "all.min.css"), "utf8");

// 1. Verzamel alle gebruikte fa-* klassen uit de broncode.
const used = new Set();
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?|css)$/.test(ent.name)) {
      const txt = fs.readFileSync(p, "utf8");
      for (const m of txt.matchAll(/fa-[a-z0-9-]+/g)) used.add(m[0]);
    }
  }
};
walk(srcDir);

// 2. Lees de glyph-codepoints uit Font Awesome (regels als `.a,.b{--fa:"\f787"}`).
//    Font Awesome gebruikt zowel hex-escapes (\f787) als letterlijke escapes (\+).
const unescapeCss = (v) => {
  let out = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== "\\") {
      out += v[i];
      continue;
    }
    i++;
    const rest = v.slice(i);
    const m = /^[0-9a-fA-F]{1,6}\s?/.exec(rest);
    if (m) {
      out += String.fromCodePoint(parseInt(m[0].trim(), 16));
      i += m[0].length - 1;
    } else {
      out += v[i];
    }
  }
  return out;
};
const glyphs = new Map();
for (const m of css.matchAll(/([^{}]+)\{--fa:"((?:\\.|[^"])*)"\}/g)) {
  const raw = m[2];
  const text = unescapeCss(raw);
  for (const sel of m[1].split(",")) {
    const cls = sel.trim().replace(/^\./, "");
    if (cls && !glyphs.has(cls)) glyphs.set(cls, { raw, text });
  }
}

// 3. Basisregels (exact overgenomen uit FA7).
const base = `
.fa,.fa-solid{--_fa-family:var(--fa-family,var(--fa-style-family,"Font Awesome 7 Free"));-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;display:var(--fa-display,inline-block);font-family:var(--_fa-family);font-feature-settings:normal;font-style:normal;font-synthesis:none;font-variant:normal;font-weight:var(--fa-style,900);line-height:1;text-align:center;text-rendering:auto;width:var(--fa-width,1.25em)}
:is(.fa-solid,.fa):before{content:var(--fa)/""}
@supports not (content:""/""){:is(.fa-solid,.fa):before{content:var(--fa)}}
:root{--fa-family-classic:"Font Awesome 7 Free";--fa-style-family-classic:var(--fa-family-classic)}
.fa-solid{--fa-family:var(--fa-family-classic);--fa-style:900}
.fa-spin{animation-name:fa-spin;animation-duration:var(--fa-animation-duration,2s);animation-iteration-count:var(--fa-animation-iteration-count,infinite);animation-timing-function:var(--fa-animation-timing,linear)}
@keyframes fa-spin{0%{transform:rotate(0)}to{transform:rotate(360deg)}}
`.trim();

// 4. Alleen de gebruikte iconen.
const iconRules = [];
const chars = [];
for (const cls of [...used].sort()) {
  const decl = glyphs.get(cls);
  if (!decl) continue;
  iconRules.push(`.${cls}{--fa:"${decl.raw}"}`);
  chars.push(decl.text);
}

// 5. Subset het solid-font tot precies deze glyphs.
const fontDir = path.join(srcDir, "assets", "fonts");
fs.mkdirSync(fontDir, { recursive: true });
const source = fs.readFileSync(path.join(faDir, "webfonts", "fa-solid-900.woff2"));
const subset = await subsetFont(source, chars.join(""), { targetFormat: "woff2" });
fs.writeFileSync(path.join(fontDir, "fa-solid-subset.woff2"), subset);

const fontFace = `@font-face{font-family:"Font Awesome 7 Free";font-style:normal;font-weight:900;font-display:block;src:url("./assets/fonts/fa-solid-subset.woff2") format("woff2")}`;

const out = `/* Gegenereerd door scripts/gen-fa-subset.mjs — niet handmatig aanpassen. */\n${fontFace}\n${base}\n${iconRules.join("\n")}\n`;
fs.writeFileSync(path.join(srcDir, "fontawesome-subset.css"), out);

console.log(
  `Font Awesome subset: ${iconRules.length} iconen, font ${Math.round(source.length / 1024)} KB -> ${Math.round(subset.length / 1024)} KB, css ${Math.round(out.length / 1024)} KB`
);
const missing = [...used].filter((c) => !glyphs.has(c)).sort();
console.log(`Zonder glyph (basis/utility of onbekend): ${missing.join(", ")}`);
