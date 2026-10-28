import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
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
const samples = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  const grab = document.querySelector(".pd-modal-grabzone");
  const gb = grab.getBoundingClientRect();
  const target = document.elementFromPoint(gb.left + 40, gb.top + 2);
  const out = [];
  return new Promise((res) => {
    let y = gb.top + 2;
    let started = false;
    const fire = (type, cy) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", clientX: gb.left + 40, clientY: cy }));
    const tick = () => {
      if (!started) { fire("pointerdown", y); started = true; requestAnimationFrame(tick); return; }
      if (y >= gb.top + 130) {
        requestAnimationFrame(() => {
          out.push({ modalTop: Math.round(modal.getBoundingClientRect().top), barTop: Math.round(document.querySelector(".main-scrollbar").getBoundingClientRect().top) });
          fire("pointerup", y);
          res(out);
        });
        return;
      }
      y += 4;
      fire("pointermove", y);
      requestAnimationFrame(() => {
        out.push({ modalTop: Math.round(modal.getBoundingClientRect().top), barTop: Math.round(document.querySelector(".main-scrollbar").getBoundingClientRect().top) });
        requestAnimationFrame(tick);
      });
    };
    requestAnimationFrame(tick);
  });
});
const diffs = samples.map((s) => s.barTop - s.modalTop);
console.log("ALIGNED SAMPLES:", samples.length, "offset min/max:", Math.min(...diffs), Math.max(...diffs));
console.log("LAST:", JSON.stringify(samples.slice(-3)));
await browser.close();
