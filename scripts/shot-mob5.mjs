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

const info = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  const bar = document.querySelector(".main-scrollbar");
  const mr = modal.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  return {
    parentIsModal: bar.parentElement === modal,
    topGap: Math.round(br.top - mr.top),
    rightGap: Math.round(mr.right - br.right),
    bottomGap: Math.round(mr.bottom - br.bottom),
    contentRightGap: Math.round(mr.right - document.querySelector(".pd-form input").getBoundingClientRect().right),
  };
});
console.log("OPEN:", JSON.stringify(info));

const scrolled = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  modal.scrollTop = 300;
  return new Promise((res) => setTimeout(() => {
    const mr = modal.getBoundingClientRect();
    const br = document.querySelector(".main-scrollbar").getBoundingClientRect();
    res({ topGapAfterScroll: Math.round(br.top - mr.top) });
  }, 120));
});
console.log("SCROLLED:", JSON.stringify(scrolled));

const sameFrame = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  modal.scrollTop = 0;
  const grab = document.querySelector(".pd-modal-grabzone");
  const gb = grab.getBoundingClientRect();
  const target = document.elementFromPoint(gb.left + 40, gb.top + 2);
  const fire = (type, cy) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", clientX: gb.left + 40, clientY: cy }));
  fire("pointerdown", gb.top + 2);
  const out = [];
  for (let i = 1; i <= 10; i += 1) {
    fire("pointermove", gb.top + 2 + i * 10);
    const mr = modal.getBoundingClientRect();
    const br = document.querySelector(".main-scrollbar").getBoundingClientRect();
    out.push(Math.round(br.top - mr.top));
  }
  const mid = modal.getBoundingClientRect().top;
  fire("pointerup", gb.top + 102);
  return { gaps: out, midTop: Math.round(mid) };
});
console.log("SAME-FRAME DRAG GAPS:", JSON.stringify(sameFrame));
await browser.close();
