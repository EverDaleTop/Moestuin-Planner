import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

const seeded = await page.evaluate(async () => {
  const username = "ddtest" + Date.now();
  const reg = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "test1234" }),
  });
  const regBody = await reg.json();
  if (!regBody.token) return { error: "register failed", regBody };
  const gardenRes = await fetch("/api/gardens", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + regBody.token },
    body: JSON.stringify({ name: "Testtuin" }),
  });
  const garden = await gardenRes.json();
  localStorage.setItem("mp_token", regBody.token);
  localStorage.setItem("mp_last_garden", garden.id);
  localStorage.setItem(
    "mp_gardens_cache_v1",
    JSON.stringify({
      user: regBody.user,
      userNames: {},
      gardens: [garden],
      cropCatalog: [],
    }),
  );
  return { ok: true, gardenId: garden.id, username };
});
console.log("SEED:", JSON.stringify(seeded));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const hasMenu = await page.evaluate(() => {
  const menus = [...document.querySelectorAll(".ge-menu")];
  return {
    menuCount: menus.length,
    labels: menus.map((m) => (m.querySelector("button")?.textContent ?? "").trim()),
    tabs: [...document.querySelectorAll(".ge-editor-tabs .nav-tab")].map((t) =>
      (t.textContent ?? "").trim(),
    ),
  };
});
console.log("MENUS:", JSON.stringify(hasMenu));

const menu = page.locator(".ge-menu").first();
await menu.hover();
await page.waitForTimeout(300);
console.log("OPEN:", await page.locator(".ge-menu-pop").count());
await page.mouse.move(20, 700);
const samples: unknown[] = [];
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(30);
  samples.push(
    await page.evaluate(() => {
      const el = document.querySelector(".ge-menu-pop");
      if (!el) return { gone: true };
      const cs = getComputedStyle(el);
      return {
        cls: el.className,
        anim: cs.animationName,
        op: Number(cs.opacity).toFixed(2),
        tf: cs.transform,
      };
    }),
  );
}
console.log("SAMPLES:", JSON.stringify(samples, null, 1));
console.log("AFTER:", await page.locator(".ge-menu-pop").count());

await menu.hover();
await page.waitForTimeout(300);
const items = await page.evaluate(() =>
  [...document.querySelectorAll(".ge-menu-item")].map((i) => (i.textContent ?? "").trim()),
);
console.log("ITEMS:", JSON.stringify(items));
const target = page.locator(".ge-menu-item", { hasText: /Zaaikalender|Kalender/i }).first();
if ((await target.count()) > 0) {
  await target.click();
  await page.waitForTimeout(900);
  console.log(
    "AFTER CLICK:",
    await page.evaluate(() => ({
      h: document.querySelector("h1,h2,.cal-title")?.textContent ?? null,
      calPage: !!document.querySelector(".cal-page"),
      triggers: document.querySelectorAll(".catdd-trigger").length,
      bodyText: (document.body.innerText ?? "").slice(0, 200),
    })),
  );
  const scope = page.locator(".cal-scope-trigger").first();
  console.log("SCOPE FOUND:", await scope.count());
  if ((await scope.count()) > 0) {
    await scope.hover();
    await page.waitForTimeout(400);
    console.log(
      "SCOPE OPEN:",
      await page.evaluate(() => {
        const el = document.getElementById("scopedd-portal");
        return el ? el.className : null;
      }),
    );
    await page.mouse.move(600, 760);
    const samples2: unknown[] = [];
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(30);
      samples2.push(
        await page.evaluate(() => {
          const el = document.getElementById("scopedd-portal");
          if (!el) return { gone: true };
          const cs = getComputedStyle(el);
          return { cls: el.className, anim: cs.animationName, op: Number(cs.opacity).toFixed(2) };
        }),
      );
    }
    console.log("SCOPE SAMPLES:", JSON.stringify(samples2));
  }
}
console.log("ERRORS:", JSON.stringify(errors.slice(0, 3)));
await browser.close();
