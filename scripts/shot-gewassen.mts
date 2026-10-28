import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

await page.evaluate(async () => {
  const username = "shot" + Date.now();
  const reg = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "test1234" }),
  });
  const body = await reg.json();
  const token = body.token as string;
  const h = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const g = await (
    await fetch("/api/gardens", { method: "POST", headers: h, body: JSON.stringify({ name: "Testtuin" }) })
  ).json();
  const crops = [
    { id: "c1", name: "Sla", variety: "Sparta", color: "#5FA55A", rowSpacing: 0.3, plantSpacing: 0.25, sowStart: 3, sowEnd: 7, harvestStart: 5, harvestEnd: 9, updatedAt: Date.now() },
    { id: "c2", name: "Pompoen", variety: "Sparta", color: "#F2B84B", rowSpacing: 1.5, plantSpacing: 1, sowStart: 4, sowEnd: 5, harvestStart: 9, harvestEnd: 10, updatedAt: Date.now() },
    { id: "c3", name: "Radijs", color: "#D8431B", rowSpacing: 0.15, plantSpacing: 0.05, sowStart: 3, sowEnd: 9, updatedAt: Date.now() },
  ];
  await fetch("/api/catalog", { method: "PUT", headers: h, body: JSON.stringify({ cropCatalog: crops }) });
  localStorage.setItem("mp_token", token);
  localStorage.setItem("mp_last_garden", g.id);
  localStorage.setItem(
    "mp_gardens_cache_v1",
    JSON.stringify({ user: body.user, userNames: {}, gardens: [g], cropCatalog: crops }),
  );
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.locator(".ge-menu", { hasText: "Gewassen" }).first().hover();
await page.waitForTimeout(300);
await page.locator(".ge-menu-item", { hasText: "Gewassenlijst" }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\gewassen-list.png", fullPage: false });

await page.locator("button", { hasText: "Nieuw gewas" }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\gewassen-form.png", fullPage: true });
console.log("ERRORS:", JSON.stringify(errors.slice(0, 3)));
await browser.close();
