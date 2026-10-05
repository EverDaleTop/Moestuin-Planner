import { chromium, type Browser, type Page } from "playwright";
import type { ProductData } from "./types.ts";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SCRAPE_TIMEOUT_MS = 25000;
const MAX_CONCURRENT_SCRAPES = 2;

interface CacheEntry {
  data: ProductData;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
let browserPromise: Promise<Browser> | null = null;
let activeScrapes = 0;
const scrapeQueue: Array<() => void> = [];

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
    });
  }
  return browserPromise;
}

async function acquireSlot(): Promise<void> {
  if (activeScrapes < MAX_CONCURRENT_SCRAPES) {
    activeScrapes++;
    return;
  }
  return new Promise((resolve) => scrapeQueue.push(resolve));
}

function releaseSlot(): void {
  activeScrapes--;
  const next = scrapeQueue.shift();
  if (next) {
    activeScrapes++;
    next();
  }
}

function extractProductId(url: URL): string {
  const host = url.hostname.toLowerCase();
  if (host.includes("temu.com")) {
    return url.searchParams.get("goods_id") ?? url.pathname;
  }
  if (host.includes("aliexpress.")) {
    const m = url.pathname.match(/\/(\d+)\.html/);
    return m?.[1] ?? url.pathname;
  }
  return url.pathname + url.search;
}

function getCache(key: string): ProductData | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: ProductData): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function detectSource(url: URL): string {
  const host = url.hostname.toLowerCase();
  if (host.includes("temu.com")) return "temu";
  if (host.includes("aliexpress.")) return "aliexpress";
  if (host.includes("bol.com")) return "bol.com";
  if (host.includes("coolblue.nl")) return "coolblue";
  if (host.includes("intratuin.nl")) return "intratuin";
  if (host.includes("gamma.nl")) return "gamma";
  if (host.includes("praxis.nl")) return "praxis";
  if (host.includes("amazon.")) return "amazon";
  return "webshop";
}

function parsePrice(text: string): { price: number; currency: string } | null {
  const eurMatch = text.match(/€\s?(\d{1,5}[.,]\d{2})/);
  if (eurMatch) {
    return { price: Number(eurMatch[1].replace(",", ".")), currency: "EUR" };
  }
  const usdMatch = text.match(/\$\s?(\d{1,5}[.,]\d{2})/);
  if (usdMatch) {
    return { price: Number(usdMatch[1].replace(",", ".")), currency: "USD" };
  }
  const numMatch = text.match(/(\d{1,5}[.,]\d{2})/);
  if (numMatch) {
    return { price: Number(numMatch[1].replace(",", ".")), currency: "EUR" };
  }
  return null;
}

async function extractFromPage(page: Page, url: URL): Promise<ProductData> {
  const source = detectSource(url);

  const jsonLdData = await page.evaluate(() => {
    const results: any[] = [];
    const doc = (globalThis as any).document;
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    scripts.forEach((script: any) => {
      try {
        const data = JSON.parse(script.textContent ?? "");
        if (Array.isArray(data)) {
          results.push(...data);
        } else {
          results.push(data);
        }
      } catch { /* ignore */ }
    });
    return results;
  });

  let title: string | undefined;
  let price: number | undefined;
  let currency: string | undefined;
  let image: string | undefined;
  let description: string | undefined;

  for (const data of jsonLdData) {
    if (data["@type"] === "Product" || data["@type"] === "Offer") {
      if (!title && data.name) title = data.name;
      if (!description && data.description) description = data.description;
      if (!image && data.image) {
        image = Array.isArray(data.image) ? data.image[0] : data.image;
      }
      const offers = data.offers ? (Array.isArray(data.offers) ? data.offers : [data.offers]) : [];
      for (const offer of offers) {
        if (offer && (offer.price || offer.lowPrice)) {
          const p = Number(String(offer.price ?? offer.lowPrice).replace(",", "."));
          if (!isNaN(p) && p > 0 && p < 100000) {
            price = p;
            currency = offer.priceCurrency ?? "EUR";
            break;
          }
        }
      }
    }
  }

  if (!title) {
    title = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle) return ogTitle.getAttribute("content")?.trim();
      const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
      if (twitterTitle) return twitterTitle.getAttribute("content")?.trim();
      return doc.title?.trim();
    }) ?? undefined;
  }

  if (!image) {
    image = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const ogImage = doc.querySelector('meta[property="og:image"]');
      if (ogImage) return ogImage.getAttribute("content")?.trim();
      const twitterImage = doc.querySelector('meta[name="twitter:image"]');
      if (twitterImage) return twitterImage.getAttribute("content")?.trim();
      return undefined;
    }) ?? undefined;
  }

  if (!description) {
    description = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const ogDesc = doc.querySelector('meta[property="og:description"]');
      if (ogDesc) return ogDesc.getAttribute("content")?.trim();
      const metaDesc = doc.querySelector('meta[name="description"]');
      if (metaDesc) return metaDesc.getAttribute("content")?.trim();
      return undefined;
    }) ?? undefined;
  }

  if (price === undefined) {
    const bodyText = await page.evaluate(() => (globalThis as any).document.body?.innerText?.slice(0, 5000) ?? "");
    const parsed = parsePrice(bodyText);
    if (parsed) {
      price = parsed.price;
      currency = parsed.currency;
    }
  }

  if (image && image.startsWith("/")) {
    image = new URL(image, url).toString();
  }

  if (title) {
    title = title.replace(/\s*[|\-–—]\s*(temu|aliexpress|bol\.com|amazon|coolblue|intratuin|gamma|praxis).*$/i, "").trim();
    if (title.length > 150) title = title.slice(0, 150);
  }

  if (!title) {
    title = url.pathname.split("/").pop()?.replace(/-/g, " ").replace(/\.html$/, "") ?? "Product";
  }

  return {
    title,
    price,
    currency,
    image,
    description: description?.slice(0, 500),
    url: url.toString(),
    source,
    cachedAt: Date.now(),
  };
}

export async function scrapeProduct(rawUrl: string): Promise<ProductData> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    throw new Error("Ongeldige productlink.");
  }

  const cacheKey = `${detectSource(url)}:${extractProductId(url)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  await acquireSlot();
  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "nl-NL",
      extraHTTPHeaders: {
        "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
      },
    });
    const page = await context.newPage();

    try {
      await page.goto(url.toString(), {
        waitUntil: "domcontentloaded",
        timeout: SCRAPE_TIMEOUT_MS,
      });

      await page.waitForTimeout(2000);

      const isBlocked = await page.evaluate(() => {
        const text = (globalThis as any).document.body?.innerText?.toLowerCase() ?? "";
        return text.includes("just a moment") || text.includes("captcha") || text.includes("are you a robot");
      });

      if (isBlocked) {
        await page.waitForTimeout(3000);
      }

      const data = await extractFromPage(page, url);
      setCache(cacheKey, data);
      return data;
    } finally {
      await context.close();
    }
  } catch (err: any) {
    throw new Error(err?.message ?? "Scrapen mislukt.");
  } finally {
    releaseSlot();
  }
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
