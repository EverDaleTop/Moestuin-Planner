import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

const seedFn = async () => {
  const username = "mob" + Date.now();
  const reg = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "test1234" }),
  });
  const body = await reg.json();
  const token = body.token;
  const h = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const g = await fetch("/api/gardens", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: "Testtuin" }),
  }).then((r) => r.json());
  localStorage.setItem("mp_token", token);
  localStorage.setItem("mp_last_garden", g.id);
  localStorage.setItem(
    "mp_gardens_cache_v1",
    JSON.stringify({ user: body.user, userNames: {}, gardens: [g], cropCatalog: [] })
  );
};
await page.evaluate(seedFn);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.locator(".ge-nav-toggle").first().tap();
await page.waitForTimeout(400);
await page.locator(".ge-side-item", { hasText: "Gewassenlijst" }).first().tap();
await page.waitForTimeout(800);
await page.locator("button", { hasText: "Nieuw gewas" }).first().tap();
await page.waitForTimeout(1500);

const open = await page.evaluate(() => {
  const sb = document.querySelector(".main-scrollbar");
  const modal = document.querySelector(".pd-modal");
  if (!sb || !modal) return { bars: document.querySelectorAll(".main-scrollbar").length, modal: !!modal };
  const sbr = sb.getBoundingClientRect();
  const mr = modal.getBoundingClientRect();
  const thumb = document.querySelector(".main-scrollbar-thumb");
  const tr = thumb.getBoundingClientRect();
  return {
    bars: 1,
    insideRight: Math.round(mr.right - sbr.right),
    insideTop: Math.round(sbr.top - mr.top),
    insideBottom: Math.round(mr.bottom - (sbr.top + sbr.height)),
    thumbTopGap: Math.round(tr.top - sbr.top),
  };
});
console.log("OPEN:", JSON.stringify(open));
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\mob-bar4.png" });

const bottom = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  modal.scrollTop = modal.scrollHeight;
  return new Promise((res) =>
    setTimeout(() => {
      const sb = document.querySelector(".main-scrollbar").getBoundingClientRect();
      const tr = document.querySelector(".main-scrollbar-thumb").getBoundingClientRect();
      res({ bottomGap: Math.round(sb.bottom - tr.bottom) });
    }, 150)
  );
});
console.log("BOTTOM:", JSON.stringify(bottom));

const frames = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  modal.scrollTop = 0;
  const grab = document.querySelector(".pd-modal-grabzone");
  const gb = grab.getBoundingClientRect();
  const samples = [];
  const g = (el) => el.getBoundingClientRect();
  return new Promise((res) => {
    let y = gb.top + 2;
    let started = false;
    const target = document.elementFromPoint(gb.left + 40, gb.top + 2);
    const step = () => {
      y += 4;
      const ev = (type) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "touch",
            clientX: gb.left + 40,
            clientY: y,
          })
        );
      };
      if (!started) {
        ev("pointerdown");
        started = true;
      } else if (y < gb.top + 170) {
        ev("pointermove");
        samples.push({
          modalTop: Math.round(g(modal).top),
          barTop: Math.round(g(document.querySelector(".main-scrollbar")).top),
        });
      } else {
        ev("pointerup");
        res(samples);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
});
const diffs = frames.map((f) => f.barTop - f.modalTop);
console.log("DRAG:", frames.length, "offset min/max:", Math.min(...diffs), Math.max(...diffs));

await page.waitForTimeout(900);
const after = await page.evaluate(() => ({
  bars: document.querySelectorAll(".main-scrollbar").length,
  modal: !!document.querySelector(".pd-modal"),
}));
console.log("AFTER CLOSE:", JSON.stringify(after));
await browser.close();
