import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

await page.evaluate(
  "fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'mob' + Date.now(), password: 'test1234' }) }).then((r) => r.json()).then(async (body) => { const token = body.token; const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }; const g = await fetch('/api/gardens', { method: 'POST', headers: h, body: JSON.stringify({ name: 'Testtuin' }) }).then((r) => r.json()); localStorage.setItem('mp_token', token); localStorage.setItem('mp_last_garden', g.id); localStorage.setItem('mp_gardens_cache_v1', JSON.stringify({ user: body.user, userNames: {}, gardens: [g], cropCatalog: [] })); return 1; }"
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator(".ge-burger").first().tap();
await page.waitForTimeout(500);
const info = await page.evaluate(
  "(() => { const rr = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) }; }; const tabs = document.querySelector('.ge-editor-tabs'); const slot = document.querySelector('.ge-tabs-slot'); const header = document.querySelector('.ge-header'); const cs = (el, p) => (el ? getComputedStyle(el).getPropertyValue(p) : null); return { header: rr(header), slot: rr(slot), tabs: rr(tabs), slotDisplay: cs(slot, 'display'), tabsDisplay: cs(tabs, 'display'), tabsPosition: cs(tabs, 'position') }; })()"
);
console.log(JSON.stringify(info));
await browser.close();
