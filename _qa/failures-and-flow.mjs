import { chromium } from '/Users/yin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
await fs.mkdir(new URL('./ui/', import.meta.url), { recursive: true });

async function open(scene = 1) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem('game_locale', 'en'));
  await page.goto(`http://127.0.0.1:4274/?user_name=Alexandria%20Montgomery&scene=${scene}`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '#alteru-guest-banner{display:none!important}' });
  await page.waitForFunction(() => window.__RING_RUN?.getState().phase === 'briefing');
  return page;
}

async function draw(page, points) {
  const canvas = await page.locator('#game').boundingBox();
  if (!canvas) throw new Error('canvas missing');
  const [first, ...rest] = points;
  await page.mouse.move(canvas.x + canvas.width * first[0], canvas.y + canvas.height * first[1]);
  await page.mouse.down();
  for (const [x, y] of rest) await page.mouse.move(canvas.x + canvas.width * x, canvas.y + canvas.height * y, { steps: 22 });
  await page.mouse.up();
}

for (const scene of [2, 3]) {
  const page = await open(scene);
  const start = scene === 2 ? [.82, .72] : [.18, .72];
  const target = scene === 2 ? [.18, .29] : [.82, .29];
  await draw(page, [start, target]);
  await page.waitForFunction(() => ['failure', 'success'].includes(window.__RING_RUN?.getState().phase), null, { timeout: 12000 });
  const state = await page.evaluate(() => window.__RING_RUN.getState());
  if (state.phase !== 'failure') throw new Error(`scene ${scene} direct route unexpectedly ${state.phase}`);
  await page.waitForTimeout(480);
  await page.screenshot({ path: new URL(`./ui/390x844-platform-layout-scene-${scene}-failure.png`, import.meta.url).pathname });
  console.log(JSON.stringify({ scene, check: 'direct-route-failure', state }));
  await page.close();
}

{
  const page = await open(1);
  await draw(page, [[.18, .72], [.35, .61]]);
  await page.waitForTimeout(120);
  const invalid = await page.evaluate(() => ({ state: window.__RING_RUN.getState(), instruction: document.querySelector('#instruction')?.textContent }));
  if (invalid.state.phase !== 'briefing' || !invalid.instruction?.includes('GOLD CIRCLE')) throw new Error(`invalid endpoint not rejected: ${JSON.stringify(invalid)}`);

  const canvas = await page.locator('#game').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .18, canvas.y + canvas.height * .72);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .30, canvas.y + canvas.height * .64, { steps: 8 });
  await page.evaluate(() => document.querySelector('#game').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.up();
  await page.waitForTimeout(80);
  const cancelled = await page.evaluate(() => window.__RING_RUN.getState());
  if (cancelled.phase !== 'briefing') throw new Error(`pointercancel stuck: ${JSON.stringify(cancelled)}`);
  console.log(JSON.stringify({ check: 'invalid-and-cancel', invalid, cancelled }));
  await page.close();
}

await browser.close();
