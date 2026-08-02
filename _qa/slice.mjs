import { chromium } from '/Users/yin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const out = new URL('./ui/', import.meta.url);
await fs.mkdir(out, { recursive: true });

async function draw(page, normalized) {
  const canvas = await page.locator('#game').boundingBox();
  if (!canvas) throw new Error('canvas missing');
  const point = ([x, y]) => ({ x: canvas.x + canvas.width * x, y: canvas.y + canvas.height * y });
  const first = point(normalized[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let index = 1; index < normalized.length; index += 1) {
    const next = point(normalized[index]);
    await page.mouse.move(next.x, next.y, { steps: 16 });
  }
  await page.mouse.up();
}

for (const [width, height] of [[390, 844], [320, 568]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem('game_locale', 'en'));
  await page.goto('http://127.0.0.1:4274/?user_name=Alexandria%20Montgomery', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '#alteru-guest-banner{display:none!important}' });
  await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'briefing');
  const prefix = `${width}x${height}-platform-layout`;
  await page.screenshot({ path: new URL(`./ui/${prefix}-briefing.png`, import.meta.url).pathname });

  const startY = height < 650 ? .67 : .72;
  await draw(page, [[.18, startY], [.15, .60], [.15, .36], [.30, .245], [.82, height < 650 ? .28 : .29]]);
  await page.waitForFunction(() => ['locked', 'running'].includes(window.__RING_RUN?.getState().phase));
  await page.waitForTimeout(900);
  await page.screenshot({ path: new URL(`./ui/${prefix}-running.png`, import.meta.url).pathname });
  await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'success', null, { timeout: 12000 });
  await page.waitForTimeout(480);
  await page.screenshot({ path: new URL(`./ui/${prefix}-success.png`, import.meta.url).pathname });

  const metrics = await page.evaluate(() => {
    const button = document.querySelector('#action')?.getBoundingClientRect();
    return {
      state: window.__RING_RUN.getState(),
      overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      button: button && { width: button.width, height: button.height },
    };
  });
  console.log(JSON.stringify({ viewport: `${width}x${height}`, outcome: 'success', ...metrics }));
  if (metrics.overflow || !metrics.button || metrics.button.height < 44) throw new Error(`layout failure ${width}x${height}`);

  if (width === 390) {
    await page.locator('#action').click();
    await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'briefing');
    await draw(page, [[.18, startY], [.82, .29]]);
    await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'failure', null, { timeout: 9000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: new URL(`./ui/${prefix}-failure.png`, import.meta.url).pathname });
    console.log(JSON.stringify({ viewport: `${width}x${height}`, outcome: 'failure', state: await page.evaluate(() => window.__RING_RUN.getState()) }));
  }
  await page.close();
}

await browser.close();
