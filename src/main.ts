import './style.css';

type Point = { x: number; y: number };
type Phase = 'loading' | 'briefing' | 'drawing' | 'locked' | 'running' | 'success' | 'failure';
type Player = { name: string; avatar: string };

declare global {
  interface Window {
    Aigram?: { telegramId: string | null; isInAigram: boolean; callAigramAPI: (url: string, method?: string) => Promise<any> };
    __RING_RUN?: {
      getState: () => object;
      setRoute: (points: Array<[number, number]>) => void;
      startRun: () => void;
      setScene: (index: number) => void;
    };
  }
}

const locale: 'zh' | 'en' = (() => {
  const saved = localStorage.getItem('game_locale');
  if (saved === 'zh' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
})();

const words = {
  en: {
    scene: 'RING EMERGENCY', ink: 'ROUTE', hooks: [
      'THE CAT IS BETWEEN YOU AND THE WEDDING.',
      'THE VACUUM HAS NO MERCY.',
      'THE CHAMPAGNE IS ALREADY MOVING.',
    ],
    draw: 'DRAW ONE SAFE ROUTE', start: 'START AT YOUR RING BOX', finish: 'END INSIDE THE GOLD CIRCLE',
    short: 'GIVE THE RING A REAL ROUTE', locked: 'ROUTE LOCKED', running: 'DO NOT LOOK AWAY',
    success: 'DELIVERED.', successLines: ['THE CAT: STILL SINGLE.', 'THE VACUUM: UNENGAGED.', 'THE WEDDING CAN START.'],
    failures: ['THE CAT SAID YES.', 'THE VACUUM IS ENGAGED.', 'THE BOTTLE SAID YES.'],
    failureLines: ['That route crossed the swipe lane.', 'That route crossed the cleaning loop.', 'That route crossed the bottle roll.'],
    routeLost: 'ROUTE LOST.', again: 'DRAW AGAIN', replay: 'PLAY AGAIN', next: 'NEXT ROUTE', score: 'SCORE', total: 'TOTAL',
    ringBearer: 'RING BEARER', targets: ['SERVICE DOOR', 'ELEVATOR', 'ALTAR'],
  },
  zh: {
    scene: '婚戒急件', ink: '路线', hooks: ['去婚礼的路，被一只猫拦住了。', '扫地机器人六亲不认。', '香槟已经滚起来了。'],
    draw: '画一条安全路线', start: '从你的戒指盒开始', finish: '终点要进入金色圆圈',
    short: '给婚戒画一条真正的路', locked: '路线已锁定', running: '千万别移开视线',
    success: '送达。', successLines: ['猫：依然单身。', '扫地机：暂未订婚。', '婚礼可以开始了。'],
    failures: ['猫答应了。', '扫地机器人订婚了。', '香槟瓶答应了。'],
    failureLines: ['这条路线穿过了猫爪横扫区。', '这条路线穿过了清扫回路。', '这条路线穿过了酒瓶滚动线。'],
    routeLost: '路线失败。', again: '重新画', replay: '再玩一次', next: '下一段路线', score: '得分', total: '总分',
    ringBearer: '婚戒护送员', targets: ['服务门', '电梯', '婚礼花门'],
  },
}[locale];

document.documentElement.lang = locale;
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="rr-shell">
    <canvas id="game" aria-label="${words.draw}"></canvas>
    <header class="rr-hud">
      <span id="scene-label">${words.scene} 1/3</span>
      <strong>${words.ink} <b id="ink">100</b>%</strong>
    </header>
    <section class="rr-copy">
      <p id="hook">${words.hooks[0]}</p>
      <h1 id="instruction">${words.draw}</h1>
    </section>
    <section id="result" class="rr-result" hidden aria-live="polite">
      <span id="result-kicker">${words.success}</span>
      <h2 id="result-title">${words.successLines[0]}</h2>
      <p id="result-note"></p>
      <button id="action" type="button">${words.replay}</button>
    </section>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
const instruction = document.querySelector<HTMLElement>('#instruction')!;
const sceneLabel = document.querySelector<HTMLElement>('#scene-label')!;
const hook = document.querySelector<HTMLElement>('#hook')!;
const inkLabel = document.querySelector<HTMLElement>('#ink')!;
const result = document.querySelector<HTMLElement>('#result')!;
const resultKicker = document.querySelector<HTMLElement>('#result-kicker')!;
const resultTitle = document.querySelector<HTMLElement>('#result-title')!;
const resultNote = document.querySelector<HTMLElement>('#result-note')!;
const action = document.querySelector<HTMLButtonElement>('#action')!;

let width = 390;
let height = 844;
let dpr = 1;
let phase: Phase = 'loading';
let sceneIndex = 0;
let scores = [0, 0, 0];
let player: Player = { name: 'AlterU', avatar: './default-avatar.png' };
let avatar = new Image();
let route: Point[] = [];
let cumulative: number[] = [];
let routeLength = 0;
let inkUsed = 0;
let activePointer: number | null = null;
let carrierDistance = 0;
let runTime = 0;
let hazardTime = 0;
let invalidTimer = 0;
let lastFrame = performance.now();
let audio: AudioContext | null = null;
let lastRouteChime = -1;

let start: Point = { x: 70, y: 600 };
let target: Point = { x: 320, y: 240 };
let carrier: Point = { ...start };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function tone(from: number, to: number, duration: number, type: OscillatorType = 'triangle', gain = .035) {
  audio ||= new AudioContext();
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const volume = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, to), now + duration);
  volume.gain.setValueAtTime(gain, now);
  volume.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(volume).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function layout() {
  const lowerY = height * (height < 650 ? .67 : .72);
  const upperY = height * (height < 650 ? .28 : .29);
  const mirrored = sceneIndex === 1;
  start = { x: width * (mirrored ? .82 : .18), y: lowerY };
  target = { x: width * (mirrored ? .18 : .82), y: upperY };
  if (phase === 'briefing' || phase === 'loading') carrier = { ...start };
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout();
}

function pointFromEvent(event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function simplify(points: Point[], epsilon = 2.8): Point[] {
  if (points.length <= 2) return points.slice();
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const value = segmentDistance(points[i], points[0], points[points.length - 1]);
    if (value > maxDistance) { maxDistance = value; index = i; }
  }
  if (maxDistance <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), epsilon);
  const right = simplify(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function rebuildRoute() {
  if (route.length > 48) {
    const step = (route.length - 1) / 47;
    route = Array.from({ length: 48 }, (_, index) => route[Math.round(index * step)]);
  }
  cumulative = [0];
  routeLength = 0;
  for (let i = 1; i < route.length; i += 1) {
    routeLength += distance(route[i - 1], route[i]);
    cumulative.push(routeLength);
  }
}

function pointAlongRoute(value: number): Point {
  if (route.length < 2) return { ...start };
  const wanted = clamp(value, 0, routeLength);
  let index = 1;
  while (index < cumulative.length && cumulative[index] < wanted) index += 1;
  if (index >= route.length) return { ...route[route.length - 1] };
  const span = cumulative[index] - cumulative[index - 1] || 1;
  const t = (wanted - cumulative[index - 1]) / span;
  return {
    x: route[index - 1].x + (route[index].x - route[index - 1].x) * t,
    y: route[index - 1].y + (route[index].y - route[index - 1].y) * t,
  };
}

function setInstruction(text: string, temporary = false) {
  instruction.textContent = text;
  instruction.classList.toggle('is-warning', temporary);
  if (temporary) invalidTimer = 1.25;
}

function resetScene() {
  phase = 'briefing';
  route = [];
  cumulative = [];
  routeLength = 0;
  inkUsed = 0;
  carrierDistance = 0;
  carrier = { ...start };
  runTime = 0;
  hazardTime = 0;
  lastRouteChime = -1;
  activePointer = null;
  inkLabel.textContent = '100';
  result.hidden = true;
  sceneLabel.textContent = `${words.scene} ${sceneIndex + 1}/3`;
  hook.textContent = words.hooks[sceneIndex];
  setInstruction(words.draw);
}

function rejectRoute(message: string) {
  phase = 'briefing';
  route = [];
  inkUsed = 0;
  inkLabel.textContent = '100';
  setInstruction(message, true);
  tone(180, 120, .11, 'square', .025);
}

function lockRoute() {
  route = simplify(route);
  route[0] = { ...start };
  route[route.length - 1] = { ...target };
  rebuildRoute();
  phase = 'locked';
  setInstruction(words.locked);
  tone(220, 495, .14, 'triangle', .04);
  window.setTimeout(() => {
    if (phase !== 'locked') return;
    phase = 'running';
    carrierDistance = 0;
    runTime = 0;
    hazardTime = 0;
    setInstruction(words.running);
  }, 280);
}

canvas.addEventListener('pointerdown', event => {
  if (phase !== 'briefing' || activePointer !== null) return;
  event.preventDefault();
  audio ||= new AudioContext();
  const point = pointFromEvent(event);
  if (distance(point, start) > 54) {
    setInstruction(words.start, true);
    tone(210, 150, .08, 'square', .02);
    return;
  }
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  phase = 'drawing';
  route = [{ ...start }];
  inkUsed = 0;
  setInstruction(words.finish);
  tone(560, 700, .045);
});

canvas.addEventListener('pointermove', event => {
  if (phase !== 'drawing' || event.pointerId !== activePointer) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  const previous = route[route.length - 1];
  const step = distance(previous, point);
  if (step < 6) return;
  const maxInk = Math.min(width, height) * 2.65;
  if (inkUsed + step > maxInk) {
    finishDrawing(event, true);
    return;
  }
  route.push(point);
  inkUsed += step;
  inkLabel.textContent = String(Math.max(0, Math.round((1 - inkUsed / maxInk) * 100)));
  if (route.length % 6 === 0) tone(700 + (route.length % 5) * 38, 760, .025, 'triangle', .012);
});

function finishDrawing(event: PointerEvent, exhausted = false) {
  if (event.pointerId !== activePointer || phase !== 'drawing') return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activePointer = null;
  const end = route[route.length - 1] ?? start;
  if (route.length < 3 || inkUsed < 80) return rejectRoute(words.short);
  if (exhausted || distance(end, target) > 64) return rejectRoute(words.finish);
  route.push({ ...target });
  tone(420, 690, .08, 'sine', .035);
  lockRoute();
}

canvas.addEventListener('pointerup', event => finishDrawing(event));
canvas.addEventListener('pointercancel', event => {
  if (event.pointerId !== activePointer) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  activePointer = null;
  rejectRoute(words.draw);
});
canvas.addEventListener('lostpointercapture', () => {
  if (phase === 'drawing' && activePointer !== null) {
    activePointer = null;
    rejectRoute(words.draw);
  }
});

function catPosition(): Point {
  return {
    x: width * (.62 - ((Math.sin(hazardTime * 2.25) + 1) * .13)),
    y: height * .50 + Math.sin(hazardTime * 3.1) * 8,
  };
}

function vacuumPosition(): Point {
  const x1 = width * .34, x2 = width * .64, y1 = height * .40, y2 = height * .61;
  const horizontal = x2 - x1, vertical = y2 - y1, perimeter = (horizontal + vertical) * 2;
  let value = ((hazardTime * Math.max(72, width * .19)) + perimeter * .08) % perimeter;
  if (value <= horizontal) return { x: x1 + value, y: y1 };
  value -= horizontal;
  if (value <= vertical) return { x: x2, y: y1 + value };
  value -= vertical;
  if (value <= horizontal) return { x: x2 - value, y: y2 };
  value -= horizontal;
  return { x: x1, y: y2 - value };
}

function champagnePosition(): Point {
  const progress = (hazardTime / 1.9) % 1;
  return {
    x: width * (.64 - progress * .40),
    y: height * (.40 + progress * .25),
  };
}

function threatCollision(point: Point) {
  if (sceneIndex === 0) {
    const paw = catPosition();
    return segmentDistance(point, paw, { x: width + 36, y: paw.y }) < 48;
  }
  if (sceneIndex === 1) {
    const insideCleaningLoop = point.x > width * .25 && point.x < width * .75 && point.y > height * .35 && point.y < height * .66;
    return insideCleaningLoop || distance(point, vacuumPosition()) < 55;
  }
  const bottle = champagnePosition();
  const angle = Math.atan2(height * .25, -width * .40);
  const vector = { x: Math.cos(angle) * 36, y: Math.sin(angle) * 36 };
  const inRollLane = segmentDistance(point, { x: width * .20, y: height * .67 }, { x: width * .68, y: height * .37 }) < 34;
  return inRollLane || segmentDistance(point, { x: bottle.x - vector.x, y: bottle.y - vector.y }, { x: bottle.x + vector.x, y: bottle.y + vector.y }) < 47;
}

function fail() {
  if (phase !== 'running') return;
  phase = 'failure';
  resultKicker.textContent = words.routeLost;
  resultTitle.textContent = words.failures[sceneIndex];
  resultNote.textContent = `${words.failureLines[sceneIndex]} · ${player.name.toUpperCase()}`;
  action.textContent = words.again;
  tone(180, 120, .16, 'sawtooth', .045);
  window.setTimeout(() => { result.hidden = false; }, 420);
}

function succeed() {
  if (phase !== 'running') return;
  phase = 'success';
  carrier = { ...target };
  const maxInk = Math.min(width, height) * 2.65;
  const directness = distance(start, target) / Math.max(routeLength, 1);
  scores[sceneIndex] = Math.round(100 + Math.max(0, 1 - inkUsed / maxInk) * 100 + directness * 80);
  resultKicker.textContent = words.success;
  resultTitle.textContent = words.successLines[sceneIndex];
  const tally = sceneIndex === 2 ? `${words.total} ${scores.reduce((sum, value) => sum + value, 0)}` : `${words.score} ${scores[sceneIndex]}`;
  resultNote.textContent = `${tally} · ${player.name.toUpperCase()}`;
  action.textContent = sceneIndex === 2 ? words.replay : words.next;
  tone(523, 784, .18, 'triangle', .045);
  window.setTimeout(() => { result.hidden = false; }, 360);
}

function update(delta: number) {
  hazardTime += delta;
  if (invalidTimer > 0) {
    invalidTimer -= delta;
    if (invalidTimer <= 0 && phase === 'briefing') setInstruction(words.draw);
  }
  if (phase !== 'running') return;
  runTime += delta;
  const speed = Math.max(94, height * .14);
  carrierDistance += speed * delta;
  carrier = pointAlongRoute(carrierDistance);
  const progress = routeLength ? carrierDistance / routeLength : 0;
  const chime = Math.floor(progress * 6);
  if (chime > lastRouteChime) {
    lastRouteChime = chime;
    tone(520 + chime * 42, 620 + chime * 32, .035, 'sine', .015);
  }
  if (runTime > .2 && threatCollision(carrier)) return fail();
  if (carrierDistance >= routeLength - 1 || distance(carrier, target) < 20) succeed();
}

function roundedRect(x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawPaper() {
  ctx.fillStyle = '#f4e7c7';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(95,67,30,.035)';
  for (let index = 0; index < 90; index += 1) {
    const x = (index * 83) % width;
    const y = (index * 137) % height;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.strokeStyle = '#d4a83f';
  ctx.lineWidth = 2;
  ctx.strokeRect(11, 11, width - 22, height - 22);
  ctx.strokeStyle = 'rgba(212,168,63,.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, width - 32, height - 32);
}

function drawHazardLane() {
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(141,39,56,.34)';
  ctx.fillStyle = 'rgba(141,39,56,.045)';
  ctx.lineWidth = 2;
  if (sceneIndex === 0) {
    roundedRect(width * .23, height * .435, width * .83, height * .13, 36);
    ctx.fill();
    ctx.stroke();
  } else if (sceneIndex === 1) {
    roundedRect(width * .25, height * .35, width * .50, height * .31, 42);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.lineWidth = 58;
    ctx.strokeStyle = 'rgba(141,39,56,.12)';
    ctx.beginPath();
    ctx.moveTo(width * .20, height * .67);
    ctx.lineTo(width * .68, height * .37);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(141,39,56,.36)';
    ctx.beginPath();
    ctx.moveTo(width * .20, height * .67);
    ctx.lineTo(width * .68, height * .37);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTarget() {
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.strokeStyle = '#d4a83f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(212,168,63,.42)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 39 + Math.sin(performance.now() / 300) * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#183a32';
  roundedRect(-31, -47, 62, 72, 24);
  ctx.fill();
  ctx.fillStyle = '#f4e7c7';
  roundedRect(-23, -38, 46, 55, 18);
  ctx.fill();
  ctx.fillStyle = '#183a32';
  ctx.font = '800 8px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(words.targets[sceneIndex], 0, 48);
  ctx.restore();
}

function drawRoute() {
  if (route.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(route[0].x, route[0].y);
  for (const point of route.slice(1)) ctx.lineTo(point.x, point.y);
  if (phase === 'drawing' || phase === 'briefing') {
    ctx.strokeStyle = '#8d2738';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.setLineDash([2, 11]);
    ctx.strokeStyle = 'rgba(255,247,226,.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#d4a83f';
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.strokeStyle = '#183a32';
    ctx.lineWidth = 11;
    ctx.stroke();
  }
  ctx.restore();
}

function drawAvatarCircle(image: HTMLImageElement, x: number, y: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (image.complete && image.naturalWidth) ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  else { ctx.fillStyle = '#171914'; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); }
  ctx.restore();
}

function fittedName(value: string, maxWidth: number) {
  let result = value.toUpperCase();
  while (result.length > 2 && ctx.measureText(result).width > maxWidth) result = `${result.slice(0, -2)}…`;
  return result;
}

function drawCarrier() {
  const position = phase === 'success' ? target : phase === 'failure' ? carrier : (phase === 'running' ? carrier : start);
  ctx.save();
  ctx.translate(position.x, position.y);
  ctx.shadowColor = 'rgba(23,25,20,.28)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#183a32';
  ctx.strokeStyle = '#d4a83f';
  ctx.lineWidth = 3;
  roundedRect(-31, -30, 62, 60, 13);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  drawAvatarCircle(avatar, 0, 0, 19);
  ctx.fillStyle = '#d4a83f';
  ctx.beginPath();
  ctx.arc(21, -21, 9, 0, Math.PI * 2);
  ctx.arc(21, -21, 5, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.fillStyle = '#f4e7c7';
  roundedRect(-34, 34, 68, 18, 2);
  ctx.fill();
  ctx.fillStyle = '#183a32';
  ctx.font = '800 7px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(words.ringBearer, 0, 42);
  ctx.font = '900 7px Arial';
  ctx.fillText(fittedName(player.name, 60), 0, 49);
  ctx.restore();
}

function drawCat() {
  const paw = catPosition();
  ctx.save();
  ctx.translate(paw.x, paw.y);
  ctx.fillStyle = '#8d2738';
  roundedRect(0, -23, width - paw.x + 70, 46, 22);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 40, 35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4e7c7';
  for (let index = -1; index <= 1; index += 1) {
    ctx.beginPath();
    ctx.arc(-22 + index * 16, -25 + Math.abs(index) * 4, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(-4, 5, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  if (phase === 'failure') {
    ctx.strokeStyle = '#d4a83f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(-23, -25, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVacuum() {
  const vacuum = vacuumPosition();
  ctx.save();
  ctx.translate(vacuum.x, vacuum.y);
  ctx.fillStyle = '#315d91';
  ctx.strokeStyle = '#183a32';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#183a32';
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4a83f';
  ctx.beginPath();
  ctx.arc(0, -7, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4e7c7';
  for (const x of [-13, 13]) {
    ctx.beginPath();
    ctx.arc(x, 11, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (phase === 'failure') {
    ctx.strokeStyle = '#d4a83f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -7, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawChampagne() {
  const bottle = champagnePosition();
  const angle = Math.atan2(height * .25, -width * .40);
  ctx.save();
  ctx.translate(bottle.x, bottle.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#183a32';
  ctx.strokeStyle = '#d4a83f';
  ctx.lineWidth = 3;
  roundedRect(-35, -16, 56, 32, 14);
  ctx.fill();
  ctx.stroke();
  roundedRect(18, -9, 26, 18, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d4a83f';
  roundedRect(-12, -12, 19, 24, 3);
  ctx.fill();
  if (phase === 'failure') {
    ctx.strokeStyle = '#d4a83f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(31, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawThreat() {
  if (sceneIndex === 0) drawCat();
  else if (sceneIndex === 1) drawVacuum();
  else drawChampagne();
}

function drawStartHalo() {
  if (phase !== 'briefing') return;
  ctx.save();
  ctx.strokeStyle = 'rgba(212,168,63,.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 42 + Math.sin(performance.now() / 260) * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, width, height);
  drawPaper();
  drawHazardLane();
  drawTarget();
  drawRoute();
  drawThreat();
  drawStartHalo();
  drawCarrier();
}

function frame(now: number) {
  const delta = Math.min(.033, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  update(delta);
  render();
  requestAnimationFrame(frame);
}

action.addEventListener('pointerdown', event => {
  event.preventDefault();
  if (phase === 'success') {
    if (sceneIndex < 2) sceneIndex += 1;
    else { sceneIndex = 0; scores = [0, 0, 0]; }
    layout();
  }
  resetScene();
});

async function loadPlayer() {
  const query = new URLSearchParams(location.search);
  const forcedScene = Number(query.get('scene'));
  if (Number.isInteger(forcedScene) && forcedScene >= 1 && forcedScene <= 3) {
    sceneIndex = forcedScene - 1;
    layout();
  }
  const overrideName = query.get('user_name');
  const overrideAvatar = query.get('avatar_url');
  if (overrideName || overrideAvatar) {
    player = { name: overrideName || 'AlterU', avatar: overrideAvatar || './default-avatar.png' };
  } else if (window.Aigram?.isInAigram && window.Aigram.telegramId) {
    try {
      const response = await window.Aigram.callAigramAPI(`/note/telegram/user/get/info/by/telegram_id?telegram_id=${encodeURIComponent(window.Aigram.telegramId)}`, 'GET');
      const info = response?.data ?? response;
      player = { name: String(info?.name ?? info?.user_name ?? 'AlterU'), avatar: String(info?.head_url ?? './default-avatar.png') };
    } catch { /* documented fallback */ }
  }
  avatar = new Image();
  avatar.onload = () => { if (phase === 'loading') resetScene(); };
  avatar.onerror = () => {
    avatar.onerror = null;
    avatar.src = './default-avatar.png';
  };
  avatar.src = player.avatar;
  if (avatar.complete && avatar.naturalWidth) resetScene();
  window.setTimeout(() => { if (phase === 'loading') resetScene(); }, 700);
}

window.__RING_RUN = {
  getState: () => ({ phase, scene: sceneIndex + 1, routeLength, inkUsed, scores, carrier: { x: carrier.x / width, y: carrier.y / height }, player: player.name }),
  setRoute: points => {
    if (phase !== 'briefing') resetScene();
    route = points.map(([x, y]) => ({ x: x * width, y: y * height }));
    route[0] = { ...start };
    route[route.length - 1] = { ...target };
    inkUsed = route.reduce((sum, point, index) => index ? sum + distance(route[index - 1], point) : 0, 0);
    lockRoute();
  },
  startRun: () => { if (phase === 'locked') { phase = 'running'; carrierDistance = 0; runTime = 0; hazardTime = 0; } },
  setScene: index => {
    sceneIndex = clamp(Math.round(index), 0, 2);
    layout();
    resetScene();
  },
};

window.addEventListener('resize', resize);
resize();
loadPlayer();
requestAnimationFrame(frame);
