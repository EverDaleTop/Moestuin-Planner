import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
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
  const cs = (el) => { const s = getComputedStyle(el); return { transform: s.transform, filter: s.filter, willChange: s.willChange, backdrop: s.backdropFilter, pos: s.position }; };
  const modal = document.querySelector(".pd-modal");
  const chain = [];
  let el = modal.parentElement;
  while (el && el !== document.body) { chain.push(el.tagName + "." + el.className.toString().slice(0, 60) + " " + JSON.stringify(cs(el))); el = el.parentElement; }
  const ov = document.querySelector(".pd-modal-overlay");
  const or = ov.getBoundingClientRect();
  const mr = modal.getBoundingClientRect();
  const bar = document.querySelector(".main-scrollbar").getBoundingClientRect();
  return {
    viewport: { w: innerWidth, h: innerHeight },
    overlay: { top: Math.round(or.top), h: Math.round(or.height), bottom: Math.round(or.bottom) },
    ovStyle: cs(ov),
    modal: { top: Math.round(mr.top), h: Math.round(mr.height), bottom: Math.round(mr.bottom) },
    modalMaxH: getComputedStyle(modal).maxHeight,
    bar: { top: Math.round(bar.top), h: Math.round(bar.height), bottom: Math.round(bar.bottom), w: Math.round(bar.width) },
    chain,
    dvh: CSS.supports("max-height: 86dvh"),
  };
});
console.log(JSON.stringify(m, null, 1));
await page.evaluate(() => { const b = document.querySelector(".pd-modal-body"); b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(300);
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\mob-small.png" });
await browser.close();
