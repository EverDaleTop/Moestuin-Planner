import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.evaluate(() => {
  const username = "desk" + Date.now();
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
await page.waitForTimeout(1500);
await page.locator("button", { hasText: "Gewassen" }).first().click();
await page.waitForTimeout(500);
await page.locator("button", { hasText: "Nieuw gewas" }).first().click();
await page.waitForTimeout(900);
const info = await page.evaluate(() => {
  const modal = document.querySelector(".pd-modal");
  const body = document.querySelector(".pd-modal-body");
  const bar = document.querySelector(".main-scrollbar");
  const mr = modal.getBoundingClientRect();
  const br = bar ? bar.getBoundingClientRect() : null;
  return {
    modalH: Math.round(mr.height),
    modalScrolls: modal.scrollHeight > modal.clientHeight,
    bodyScrolls: body.scrollHeight > body.clientHeight,
    barInside: br ? Math.round(br.right) <= Math.round(mr.right) && Math.round(br.left) >= Math.round(mr.left) : false,
    rightGap: br ? Math.round(mr.right - br.right) : null,
    topGap: br ? Math.round(br.top - mr.top) : null,
  };
});
console.log("DESKTOP:", JSON.stringify(info));
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\desk-modal.png" });
await browser.close();
