import { chromium } from '/Users/yin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await fs.mkdir(new URL('./ui/', import.meta.url), { recursive: true });
await page.addInitScript(() => localStorage.setItem('game_locale', 'en'));
await page.goto('http://127.0.0.1:4274/?user_name=Alexandria%20Montgomery', { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#alteru-guest-banner{display:none!important}' });

const routes = [
  [[.18, .72], [.15, .60], [.15, .36], [.30, .245], [.82, .29]],
  [[.82, .72], [.86, .62], [.86, .30], [.70, .245], [.18, .29]],
  [[.18, .72], [.74, .75], [.86, .65], [.86, .29], [.82, .29]],
];

async function draw(points) {
  const canvas = await page.locator('#game').boundingBox();
  const [first, ...rest] = points;
  await page.mouse.move(canvas.x + canvas.width * first[0], canvas.y + canvas.height * first[1]);
  await page.mouse.down();
  for (const [x, y] of rest) await page.mouse.move(canvas.x + canvas.width * x, canvas.y + canvas.height * y, { steps: 16 });
  await page.mouse.up();
}

for (let scene = 1; scene <= 3; scene += 1) {
  await page.waitForFunction(expected => {
    const state = window.__RING_RUN?.getState();
    return state?.phase === 'briefing' && state.scene === expected;
  }, scene);
  await draw(routes[scene - 1]);
  await page.waitForFunction(expected => {
    const state = window.__RING_RUN?.getState();
    return state?.phase === 'success' && state.scene === expected;
  }, scene, { timeout: 12000 });
  await page.waitForTimeout(430);
  if (scene < 3) await page.locator('#action').click();
}

await page.screenshot({ path: new URL('./ui/390x844-platform-layout-final.png', import.meta.url).pathname });
const final = await page.evaluate(() => ({
  state: window.__RING_RUN.getState(),
  title: document.querySelector('#result-title')?.textContent,
  note: document.querySelector('#result-note')?.textContent,
  action: document.querySelector('#action')?.textContent,
}));
if (final.state.scores.some(score => score <= 0)) throw new Error(`missing score: ${JSON.stringify(final)}`);
if (final.title !== 'THE WEDDING CAN START.' || !final.note.startsWith('TOTAL ') || final.action !== 'PLAY AGAIN') throw new Error(`bad final: ${JSON.stringify(final)}`);

await page.locator('#action').click();
await page.waitForFunction(() => {
  const state = window.__RING_RUN?.getState();
  return state?.phase === 'briefing' && state.scene === 1 && state.scores.every(score => score === 0);
});
console.log(JSON.stringify({ final, replay: await page.evaluate(() => window.__RING_RUN.getState()) }));

await browser.close();
