import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });

const res = await page.evaluate(() => {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;top:20px;left:20px;z-index:9999;background:#fff;";
  let paras = "";
  for (let i = 0; i < 20; i++) paras += "<p>item</p>";
  wrap.innerHTML =
    "<style>" +
    ".t1::-webkit-scrollbar { display: block; width: 10px; }" +
    ".t1::-webkit-scrollbar-thumb { background: red; }" +
    ".t2 { scrollbar-width: auto; }" +
    "</style>" +
    '<div class="t1" style="max-height:100px;overflow-y:auto;width:120px;border:1px solid #000;">' + paras + "</div>" +
    '<div class="t2" style="max-height:100px;overflow-y:auto;width:120px;border:1px solid #000;margin-top:10px;">' + paras + "</div>";
  document.body.appendChild(wrap);
  const t1 = wrap.children[1] as HTMLElement;
  const t2 = wrap.children[2] as HTMLElement;
  const gutter = (el: HTMLElement) => el.offsetWidth - el.clientWidth;
  return {
    t1gutter: gutter(t1),
    t2gutter: gutter(t2),
    t1display: getComputedStyle(t1, "::-webkit-scrollbar").display,
    t2display: getComputedStyle(t2, "::-webkit-scrollbar").display,
  };
});
console.log(JSON.stringify(res, null, 2));
await browser.close();
