import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

const seedFn = async () => {
  const username = "shot" + Date.now();
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

await page.locator(".ge-menu", { hasText: "Gewassen" }).first().hover();
await page.waitForTimeout(300);
await page.locator(".ge-menu-item", { hasText: "Gewassenlijst" }).first().click();
await page.waitForTimeout(800);
await page.locator("button", { hasText: "Nieuw gewas" }).first().click();
await page.waitForTimeout(900);

const tile = page.locator(".pd-form .icon-opt").first();
await tile.hover();
await page.waitForTimeout(300);
const hoverBg = await page.evaluate(() => {
  const el = document.querySelector(".pd-form .icon-opt");
  return el ? getComputedStyle(el).backgroundColor : null;
});
await page.mouse.down();
await page.waitForTimeout(250);
const downBg = await page.evaluate(() => {
  const el = document.querySelector(".pd-form .icon-opt");
  return el
    ? { bg: getComputedStyle(el).backgroundColor, tf: getComputedStyle(el).transform }
    : null;
});
await page.mouse.up();
console.log(JSON.stringify({ hoverBg, downBg }));
await browser.close();
