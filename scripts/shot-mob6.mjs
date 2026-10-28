import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
const seedFn = async () => {
  const username = "mob" + Date.now();
  const reg = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "test1234" }) });
  const body = await reg.json();
  const token = body.token;
  const h = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const g = await fetch("/api/gardens", { method: "POST", headers: h, body: JSON.stringify({ name: "Testtuin" }) }).then((r) => r.json());
  localStorage.setItem("mp_token", token);
  localStorage.setItem("mp_last_garden", g.id);
  localStorage.setItem("mp_gardens_cache_v1", JSON.stringify({ user: body.user, userNames: {}, gardens: [g], cropCatalog: [] }));
};
await page.evaluate(seedFn);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator(".ge-nav-toggle").first().tap();
await page.waitForTimeout(400);
await page.locator(".ge-side-item", { hasText: "Gewassenlijst" }).first().tap();
await page.waitForTimeout(800);
await page.locator("button", { hasText: "Nieuw gewas" }).first().tap();
await page.waitForTimeout(1400);
const measure = () => {
  const modal = document.querySelector(".pd-modal");
  const bar = document.querySelector(".main-scrollbar");
  const thumb = document.querySelector(".main-scrollbar-thumb");
  const mr = modal.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  const tr = thumb.getBoundingClientRect();
  return {
    barW: Math.round(br.width),
    thumbW: Math.round(tr.width),
    topGap: Math.round(br.top - mr.top),
    rightGap: Math.round(mr.right - br.right),
    thumbTopGap: Math.round(tr.top - br.top),
    scrollTop: Math.round(modal.scrollTop),
  };
};
console.log("OPEN:", JSON.stringify(await page.evaluate(measure)));
await page.evaluate(() => { document.querySelector(".pd-modal").scrollTop = 200; });
await page.waitForTimeout(150);
console.log("SCROLL 200:", JSON.stringify(await page.evaluate(measure)));
await page.evaluate(() => { document.querySelector(".pd-modal").scrollTop = 10000; });
await page.waitForTimeout(150);
console.log("SCROLL END:", JSON.stringify(await page.evaluate(measure)));
await page.evaluate(() => { document.querySelector(".pd-modal").scrollTop = 0; });
await page.waitForTimeout(150);
console.log("SCROLL 0:", JSON.stringify(await page.evaluate(measure)));
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\mob-final.png" });

const drag = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  const grab = document.querySelector(".pd-modal-grabzone");
  const gb = grab.getBoundingClientRect();
  const target = document.elementFromPoint(gb.left + 40, gb.top + 2);
  const fire = (type, cy) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", clientX: gb.left + 40, clientY: cy }));
  fire("pointerdown", gb.top + 2);
  const out = [];
  for (let i = 1; i <= 8; i += 1) {
    fire("pointermove", gb.top + 2 + i * 8);
    const mr = modal.getBoundingClientRect();
    const br = document.querySelector(".main-scrollbar").getBoundingClientRect();
    out.push(Math.round(br.top - mr.top));
  }
  fire("pointerup", gb.top + 66);
  return out;
});
console.log("DRAG SAME-FRAME GAPS:", JSON.stringify(drag));
await browser.close();
