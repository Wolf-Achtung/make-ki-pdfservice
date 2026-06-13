const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const file = process.argv[2];
  const html = fs.readFileSync(file, 'utf8');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.emulateMediaType('print');

  const chain = await page.evaluate(() => {
    const box = document.querySelector('.exec-decision-box');
    if (!box) return { error: 'no .exec-decision-box found in dump' };
    const props = ['overflow','overflowX','overflowY','height','maxHeight','minHeight',
                   'position','contain','transform','clipPath','display','webkitLineClamp'];
    const out = [];
    let el = box;
    while (el) {
      const cs = getComputedStyle(el);
      const o = { tag: el.tagName, cls: String(el.className || '').slice(0, 60) };
      props.forEach(p => o[p] = cs[p]);
      const r = el.getBoundingClientRect();
      o.rectH = Math.round(r.height);
      o.scrollH = el.scrollHeight;
      o.FLAG = (el.scrollHeight > Math.ceil(r.height) + 2) ? 'SCROLL>RECT' : '';
      out.push(o);
      if (el === document.documentElement) break;
      el = el.parentElement;
    }
    return out;
  });

  console.log(JSON.stringify(chain, null, 2));
  await browser.close();
})();
