import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
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
await page.evaluate(() => { const b = document.querySelector(".pd-modal-body"); b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(400);
const m = await page.evaluate(() => {
  const cs = (el, p) => getComputedStyle(el).getPropertyValue(p);
  const modal = document.querySelector(".pd-modal");
  const body = document.querySelector(".pd-modal-body");
  const form = document.querySelector(".pd-form");
  const btn = document.querySelector(".pd-form .btn-primary");
  const mr = modal.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const fr = form.getBoundingClientRect();
  const bodyInnerBottom = body.clientHeight - parseFloat(cs(body, "padding-bottom")) + body.getBoundingClientRect().top;
  return {
    modalBottom: Math.round(mr.bottom),
    btnBottom: Math.round(br.bottom),
    formBottom: Math.round(fr.bottom),
    bodyContentBottom: Math.round(bodyInnerBottom),
    btnMarginBottom: cs(btn, "margin-bottom"),
    btnMarginTop: cs(btn, "margin-top"),
    formPaddingBottom: cs(form, "padding-bottom"),
    formMarginBottom: cs(form, "margin-bottom"),
    formGap: cs(form, "gap"),
    bodyPaddingBottom: cs(body, "padding-bottom"),
    bodyGap: cs(body, "gap"),
    modalPaddingBottom: cs(modal, "padding-bottom"),
    modalBorderBottom: cs(modal, "border-bottom-width"),
  };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: "C:\\Users\\Robbin\\AppData\\Local\\Temp\\opencode\\mob-bottom2.png" });
await browser.close();
