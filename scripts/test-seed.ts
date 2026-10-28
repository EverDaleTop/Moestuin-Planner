/**
 * Handmatige check van de zaadpagina-interpretratie: haal één echte pagina op
 * en print ruw de specs/groeitekst plus het interpretatieresultaat.
 * Gebruik:  npx tsx scripts/test-seed.ts <url>
 */
import { scrapeProduct } from "../server/scraper.ts";
import { interpretSeedPage } from "../src/seedLookup.ts";

const url = process.argv[2];
if (!url) {
  console.error("gebruik: npx tsx scripts/test-seed.ts <url>");
  process.exit(1);
}

const page = await scrapeProduct(url);
console.log("TITEL:", page.title);
console.log("\nSPECS:");
for (const s of page.specs ?? []) console.log(`  ${s.label} = ${s.value}`);
console.log("\nGROEITEKST:\n", (page.growText ?? "").slice(0, 600));
console.log("\nRESULTAAT:");
console.log(JSON.stringify(interpretSeedPage(page), null, 2));