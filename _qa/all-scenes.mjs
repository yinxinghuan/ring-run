import { chromium } from '/Users/yin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
await fs.mkdir(new URL('./ui/', import.meta.url), { recursive: true });

const safe = {
  2: [[.82, .72], [.86, .62], [.86, .30], [.70, .245], [.18, .29]],
  3: [[.18, .72], [.74, .75], [.86, .65], [.86, .29], [.82, .29]],
};

async function draw(page, normalized, height) {
  const canvas = await page.locator('#game').boundingBox();
  if (!canvas) throw new Error('canvas missing');
  const actual = normalized.map(([x, y]) => [x, height < 650 && y === .72 ? .67 : (height < 650 && y === .29 ? .28 : y)]);
  const first = actual[0];
  await page.mouse.move(canvas.x + canvas.width * first[0], canvas.y + canvas.height * first[1]);
  await page.mouse.down();
  for (const [x, y] of actual.slice(1)) await page.mouse.move(canvas.x + canvas.width * x, canvas.y + canvas.height * y, { steps: 16 });
  await page.mouse.up();
}

async function runCase(scene, width, height, external = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem('game_locale', 'en'));
  await page.goto(`http://127.0.0.1:4274/?user_name=Alexandria%20Montgomery&scene=${scene}`, { waitUntil: 'networkidle' });
  if (!external) await page.addStyleTag({ content: '#alteru-guest-banner{display:none!important}' });
  await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'briefing');
  const mode = external ? 'external-guest' : 'platform-layout';
  const prefix = `${width}x${height}-${mode}-scene-${scene}`;
  await draw(page, safe[scene], height);
  await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'running');
  await page.waitForTimeout(950);
  await page.screenshot({ path: new URL(`./ui/${prefix}-running.png`, import.meta.url).pathname });
  await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'success', null, { timeout: 12000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: new URL(`./ui/${prefix}-success.png`, import.meta.url).pathname });
  const metrics = await page.evaluate(() => {
    const button = document.querySelector('#action')?.getBoundingClientRect();
    const banner = document.querySelector('#alteru-guest-banner');
    return {
      state: window.__RING_RUN.getState(),
      overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      button: button && { width: button.width, height: button.height },
      bannerVisible: banner ? getComputedStyle(banner).display !== 'none' : false,
    };
  });
  if (metrics.overflow || !metrics.button || metrics.button.height < 44) throw new Error(`layout failure ${prefix}`);
  if (external && !metrics.bannerVisible) throw new Error('external banner missing');
  await page.close();
  return { viewport: `${width}x${height}`, mode, scene, ...metrics };
}

const results = await Promise.all([
  runCase(2, 390, 844),
  runCase(3, 390, 844),
  runCase(2, 320, 568),
  runCase(3, 320, 568),
  runCase(3, 390, 844, true),
]);
for (const result of results) console.log(JSON.stringify(result));

await browser.close();
