import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.evaluate(() => {
  const username = "mob" + Date.now();
  return fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "test1234" }) })
    .then((r) => r.json())
    .then(async (body) => {
      const h = { "Content-Type": "application/json", Authorization: "Bearer " + body.token };
      const g = await fetch("/api/gardens", { method: "POST", headers: h, body: JSON.stringify({ name: "Testtuin" }) }).then((r) => r.json());
      localStorage.setItem("mp_token", body.token);
      localStorage.setItem("mp_last_garden", g.id);
      localStorage.setItem("mp_gardens_cache_v1", JSON.stringify({ user: body.user, userNames: {}, gardens: [g], cropCatalog: [] }));
    });
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator(".ge-nav-toggle").first().tap();
await page.waitForTimeout(400);
await page.locator(".ge-side-item", { hasText: "Gewassenlijst" }).first().tap();
await page.waitForTimeout(800);
await page.locator("button", { hasText: "Nieuw gewas" }).first().tap();
await page.waitForTimeout(1200);
const m = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  const body = document.querySelector(".pd-modal-body");
  const bars = Array.from(document.querySelectorAll(".main-scrollbar")).map((b) => b.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), h: Math.round(r.height) }));
  return {
    bars: bars.length,
    barRects: bars,
    modalOverflowY: getComputedStyle(modal).overflowY,
    bodyOverflowY: getComputedStyle(body).overflowY,
    modalScroll: modal.scrollHeight - modal.clientHeight,
    bodyScroll: body.scrollHeight - body.clientHeight,
  };
});
console.log(JSON.stringify(m, null, 1));
await page.evaluate(() => { const b = document.querySelector(".pd-modal-body"); b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(400);
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\mob-full.png" });
await browser.close();
