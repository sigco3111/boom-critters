// 스테이지 테마: 배경(하늘·구름·별·언덕)과 지형/물 색을 캔버스 코드로 그린다 (외부 이미지 없음)
import { W, H, mulberry32 } from './terrain.js?v=2026111042';
import { t as tr } from './i18n.js?v=2026111042';

export const THEMES = [
  {
    id: 'grass', get name() { return tr('th.grass'); },
    sky: [[0, '#4fa8ea'], [0.55, '#a9dcf8'], [1, '#e8f8ff']],
    hills: [['#a8d3d6', 285, 36], ['#86c48a', 325, 32], ['#63a85a', 365, 26]],
    tile: { base: '#8a5a30', dark: 'rgba(60,35,15,0.35)', light: 'rgba(190,140,80,0.30)', pebble: 'rgba(150,140,130,0.55)' },
    shade: 'rgba(20,10,0,0.55)', edge: ['#3f8f2a', '#5fb53b', '#86d85a'], tuft: '#5fb53b', tuftLen: 6,
    water: 'rgba(40,120,200,0.72)', debris: '110,70,35',
  },
  {
    id: 'desert', get name() { return tr('th.desert'); },
    sky: [[0, '#3a2a6e'], [0.35, '#b4446c'], [0.65, '#f28048'], [0.88, '#ffc56a'], [1, '#ffe3a2']],
    hills: [['#7a3a5e', 300, 22], ['#c4643e', 335, 28], ['#a04c2c', 370, 24]],
    tile: { base: '#c8934c', dark: 'rgba(120,70,25,0.35)', light: 'rgba(250,215,140,0.38)', pebble: 'rgba(120,90,60,0.5)' },
    shade: 'rgba(95,40,10,0.5)', edge: ['#97612a', '#c98b3f', '#f0c476'], tuft: '#dca955', tuftLen: 4,
    water: 'rgba(30,140,150,0.72)', debris: '170,120,60',
  },
  {
    id: 'snow', get name() { return tr('th.snow'); },
    sky: [[0, '#8fb0d4'], [0.5, '#d5e5f3'], [1, '#f6fafd']],
    hills: [['#a3bad4', 280, 40], ['#d3e2ef', 325, 28], ['#eef5fa', 368, 22]],
    tile: { base: '#6c5b55', dark: 'rgba(30,25,38,0.38)', light: 'rgba(190,210,232,0.30)', pebble: 'rgba(205,220,235,0.55)' },
    shade: 'rgba(10,20,45,0.55)', edge: ['#9bb8d4', '#d9e9f6', '#ffffff'], tuft: '#ffffff', tuftLen: 5,
    water: 'rgba(90,160,215,0.75)', debris: '200,215,230',
  },
  {
    id: 'night', get name() { return tr('th.night'); },
    sky: [[0, '#040821'], [0.55, '#151c4c'], [1, '#3a3a7c']],
    hills: [['#1b2356', 300, 30], ['#141a42', 340, 26], ['#0d1230', 372, 22]],
    tile: { base: '#4b3b60', dark: 'rgba(10,5,28,0.45)', light: 'rgba(150,130,205,0.26)', pebble: 'rgba(125,125,165,0.5)' },
    shade: 'rgba(5,0,22,0.6)', edge: ['#1b6556', '#2e9a7c', '#5fd6a6'], tuft: '#2e9a7c', tuftLen: 6,
    water: 'rgba(20,50,120,0.78)', debris: '80,60,110',
  },
];

// 스테이지 1~3 초원, 4~6 사막, 7~8 설원, 9~10 밤
export function themeForStage(s) { return THEMES[s <= 3 ? 0 : s <= 6 ? 1 : s <= 8 ? 2 : 3]; }
// 빠른 대전·무한 모드: 시드로 테마를 정한다 (같은 시드 = 같은 테마)
export function themeForSeed(seed) { return THEMES[(Math.imul(seed | 0, 2654435761) >>> 28) % THEMES.length]; }

function ridge(g, color, base, amp, rnd, step = 8) {
  const p = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], f = 0.7 + rnd() * 0.8;
  g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += step) {
    const t = x / W * 6.283;
    g.lineTo(x, base + amp * (0.6 * Math.sin(t * f + p[0]) + 0.3 * Math.sin(t * f * 2.3 + p[1]) + 0.2 * Math.sin(t * f * 5.1 + p[2])));
  }
  g.lineTo(W, H); g.closePath(); g.fill();
}

function cloud(g, x, y, s, alpha, color = '255,255,255') {
  g.fillStyle = `rgba(${color},${alpha})`;
  for (const [dx, dy, r] of [[0, 0, 22], [24, 6, 26], [52, 2, 20], [26, -10, 20], [-18, 8, 16]]) {
    g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill();
  }
}

function glow(g, x, y, r, c0, c1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, c0); gr.addColorStop(1, c1);
  g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

function pine(g, x, base, s, body) {
  g.fillStyle = '#4a3428'; g.fillRect(x - 2 * s, base - 6 * s, 4 * s, 7 * s);
  for (let i = 0; i < 3; i++) {
    const w = (15 - i * 3.5) * s, top = base - (16 + i * 11) * s - 6 * s, bot = base - (6 + i * 9) * s;
    g.fillStyle = body; g.beginPath(); g.moveTo(x, top); g.lineTo(x + w, bot); g.lineTo(x - w, bot); g.closePath(); g.fill();
    g.fillStyle = '#f4f9ff'; g.beginPath(); g.moveTo(x, top); g.lineTo(x + w * 0.62, top + (bot - top) * 0.55); g.lineTo(x - w * 0.62, top + (bot - top) * 0.55); g.closePath(); g.fill();
  }
}

function cactus(g, x, base, s) {
  g.fillStyle = '#5b2a36';
  const rr = (cx, cy, w, h) => { g.beginPath(); g.roundRect(cx, cy, w, h, w / 2); g.fill(); };
  rr(x - 4 * s, base - 34 * s, 8 * s, 36 * s);
  rr(x - 15 * s, base - 24 * s, 7 * s, 16 * s); rr(x - 15 * s, base - 11 * s, 17 * s, 6 * s);
  rr(x + 8 * s, base - 28 * s, 7 * s, 18 * s); rr(x - 2 * s, base - 13 * s, 17 * s, 6 * s);
}

// 하늘 + 구름/별 + 층층이 겹친 언덕. 반환: 캔버스 (별 반짝임용 좌표는 canvas.stars)
export function makeBackground(theme, seed) {
  const rnd = mulberry32((seed ^ 0x9e3779b9) | 0);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  for (const [o, col] of theme.sky) sky.addColorStop(o, col);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const [far, mid, near] = theme.hills;
  c.stars = [];
  if (theme.id === 'grass') {
    glow(g, 820, 90, 120, 'rgba(255,248,200,0.9)', 'rgba(255,248,200,0)');
    g.fillStyle = '#fff6c4'; g.beginPath(); g.arc(820, 90, 26, 0, 7); g.fill();
    for (let i = 0; i < 7; i++) cloud(g, rnd() * W, 40 + rnd() * 150, 0.7 + rnd() * 0.7, 0.55 + rnd() * 0.3);
  } else if (theme.id === 'desert') {
    glow(g, 690, 330, 260, 'rgba(255,230,150,0.85)', 'rgba(255,200,100,0)');
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(690, 330, 46, 0, 7); g.fill();
    for (let i = 0; i < 6; i++) { // 가늘게 길게 늘어진 노을 구름
      const x = rnd() * W, y = 60 + rnd() * 190, w = 120 + rnd() * 180;
      g.fillStyle = `rgba(255,${150 + (rnd() * 60) | 0},${120 + (rnd() * 60) | 0},${0.28 + rnd() * 0.2})`;
      g.beginPath(); g.ellipse(x, y, w / 2, 5 + rnd() * 6, 0, 0, 7); g.fill();
    }
  } else if (theme.id === 'snow') {
    for (let i = 0; i < 5; i++) cloud(g, rnd() * W, 40 + rnd() * 130, 0.9 + rnd() * 0.7, 0.55, '235,242,250');
    // 눈 덮인 먼 산
    for (let i = 0; i < 5; i++) {
      const x = (i + 0.2 + rnd() * 0.6) * (W / 4.6), h = 90 + rnd() * 70, w = 110 + rnd() * 70, by = 330;
      g.fillStyle = '#8fa8c6'; g.beginPath(); g.moveTo(x - w, by + 60); g.lineTo(x, by - h); g.lineTo(x + w, by + 60); g.fill();
      g.fillStyle = '#f2f7fc'; g.beginPath(); g.moveTo(x, by - h); g.lineTo(x + w * 0.32, by - h + h * 0.36); g.lineTo(x + w * 0.1, by - h + h * 0.3); g.lineTo(x - w * 0.12, by - h + h * 0.4); g.lineTo(x - w * 0.32, by - h + h * 0.36); g.closePath(); g.fill();
    }
  } else { // night
    glow(g, 800, 110, 150, 'rgba(210,220,255,0.45)', 'rgba(210,220,255,0)');
    g.fillStyle = '#f4f1da'; g.beginPath(); g.arc(800, 110, 32, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,160,150,0.35)';
    for (const [dx, dy, r] of [[-10, -8, 7], [9, 6, 9], [-6, 14, 5]]) { g.beginPath(); g.arc(800 + dx, 110 + dy, r, 0, 7); g.fill(); }
    for (let i = 0; i < 150; i++) {
      const y = Math.pow(rnd(), 1.4) * 330, big = rnd() < 0.12;
      const s = { x: rnd() * W, y, r: big ? 1.6 + rnd() : 0.5 + rnd() * 0.9, a: 0.45 + rnd() * 0.55, p: rnd() * 6.28, big };
      c.stars.push(s);
      g.fillStyle = `rgba(255,255,${230 + (rnd() * 25) | 0},${s.a})`;
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
    }
    for (let i = 0; i < 3; i++) cloud(g, rnd() * W, 160 + rnd() * 110, 1.1 + rnd(), 0.07, '120,120,200');
  }
  // 멀리서 가까이: 언덕 3겹 (+테마 소품)
  ridge(g, far[0], far[1], far[2], rnd);
  ridge(g, mid[0], mid[1], mid[2], rnd);
  if (theme.id === 'desert') for (let i = 0; i < 4; i++) cactus(g, 60 + rnd() * (W - 120), 372 + rnd() * 18, 0.7 + rnd() * 0.5);
  ridge(g, near[0], near[1], near[2], rnd);
  if (theme.id === 'snow') {
    for (let i = 0; i < 12; i++) pine(g, 30 + rnd() * (W - 60), 372 + rnd() * 40, 0.8 + rnd() * 0.6, i % 2 ? '#2f5d4f' : '#3a6e5c');
    for (let i = 0; i < 90; i++) { // 눈송이
      g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.5})`;
      g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.85, 1 + rnd() * 1.8, 0, 7); g.fill();
    }
  }
  return c;
}

// 밤 테마: 큰 별 몇 개를 매 프레임 살짝 반짝이게 한다
export function drawBackgroundFx(g, bg, time) {
  if (!bg.stars || !bg.stars.length) return;
  for (const s of bg.stars) {
    if (!s.big) continue;
    const k = 0.5 + 0.5 * Math.sin(time * 2.2 + s.p);
    g.fillStyle = `rgba(255,255,240,${0.25 + 0.6 * k})`;
    const l = 3 + 4 * k;
    g.fillRect(s.x - l, s.y - 0.5, 2 * l, 1); g.fillRect(s.x - 0.5, s.y - l, 1, 2 * l);
  }
}

// ---------- 잔잔한 날씨 효과 (캔버스, 파티클 합계 WEATHER_MAX 이하) ----------
// 초원: 꽃잎·나뭇잎 / 사막: 모래 알갱이 / 설원: 눈 / 밤: 반딧불. 배경 이미지는 그대로 두고 위에 가볍게만 그린다.
export const WEATHER_MAX = 80;
const WEATHER = { grass: ['leaf', 26], desert: ['dust', 44], snow: ['snow', 70], night: ['firefly', 20] };
const WEATHER_BOTTOM = 496; // 물 높이(WATER_Y): 이 아래로는 그리지 않고 위에서 다시 시작

function spawnWeather(kind, p, first) {
  p.x = Math.random() * W;
  if (kind === 'snow' || kind === 'leaf') p.y = first ? Math.random() * WEATHER_BOTTOM : -6;
  else if (kind === 'dust') { if (!first) p.x = -6; p.y = 150 + Math.random() * 320; }
  else p.y = 150 + Math.random() * 320;
  p.s = Math.random(); p.p = Math.random() * 6.283; p.c = Math.random() < 0.5 ? 0 : 1;
  p.r = kind === 'snow' ? 1 + p.s * 1.6 : kind === 'leaf' ? 3 + p.s * 2 : kind === 'dust' ? 1.1 + p.s * 1.3 : 1.9 + p.s * 0.9;
  p.a = Math.random() * 6.283; // 반딧불 진행 방향
  return p;
}

export function makeWeather(theme) {
  const [kind, n] = WEATHER[theme.id] || [null, 0];
  if (!kind) return null;
  const parts = [];
  for (let i = 0; i < Math.min(n, WEATHER_MAX); i++) parts.push(spawnWeather(kind, {}, true));
  return { kind, parts, t: 0 };
}

export function stepWeather(w, dt, wind = 0) {
  w.t += dt;
  const t = w.t, k = w.kind, N = w.active ?? w.parts.length; // active: 느린 기기에서는 앞쪽 일부만 움직이고 그린다
  for (let i = 0; i < N; i++) {
    const p = w.parts[i];
    if (k === 'snow') {
      p.y += (24 + p.s * 30) * dt; p.x += (Math.sin(t * 0.8 + p.p) * 14 + wind * 2.2) * dt;
    } else if (k === 'leaf') {
      p.y += (14 + p.s * 16) * dt; p.x += (10 + Math.sin(t * 0.9 + p.p) * 24 + wind * 3) * dt;
    } else if (k === 'dust') {
      p.x += (34 + p.s * 46 + wind * 4) * dt; p.y += Math.sin(t * 1.3 + p.p) * 9 * dt;
    } else { // 반딧불: 천천히 헤매며 날고, 범위를 벗어나면 안쪽으로 방향을 튼다
      p.a += Math.sin(t * 0.7 + p.p) * 1.6 * dt;
      p.x += Math.cos(p.a) * 16 * dt; p.y += Math.sin(p.a) * 12 * dt;
      if (p.y < 150) p.a = 0.6 + Math.random() * 1.9; else if (p.y > 470) p.a = -(0.6 + Math.random() * 1.9);
    }
    if (p.x > W + 8) p.x = -8; else if (p.x < -8) p.x = W + 8;
    if (p.y > WEATHER_BOTTOM) spawnWeather(k, p, false);
  }
}

export function drawWeather(g, w) {
  const P = w.parts, t = w.t, N = w.active ?? P.length;
  g.save();
  if (w.kind === 'snow') {
    g.fillStyle = 'rgba(240,247,255,0.92)'; g.strokeStyle = 'rgba(110,140,185,0.4)'; g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i < N; i++) { const p = P[i]; g.moveTo(p.x + p.r, p.y); g.arc(p.x, p.y, p.r, 0, 6.283); }
    g.fill(); g.stroke();
  } else if (w.kind === 'dust') {
    for (let c = 0; c < 2; c++) {
      g.fillStyle = c ? 'rgba(130,80,40,0.45)' : 'rgba(255,240,200,0.7)';
      g.beginPath();
      for (let i = 0; i < N; i++) { const p = P[i]; if (p.c === c) g.rect(p.x, p.y, p.r * 1.6, p.r); }
      g.fill();
    }
  } else if (w.kind === 'leaf') {
    g.globalAlpha = 0.88; // 색 문자열을 매번 만들지 않도록 투명도는 globalAlpha로
    for (let c = 0; c < 2; c++) { // 꽃잎(분홍)과 나뭇잎(연두)을 색별로 묶어 그린다
      g.fillStyle = c ? '#ffcddc' : '#b0e46e';
      for (let i = 0; i < N; i++) {
        const p = P[i]; if (p.c !== c) continue;
        g.beginPath(); g.ellipse(p.x, p.y, p.r * 1.5, p.r * 0.75, t * (0.8 + p.s) + p.p, 0, 6.283); g.fill();
      }
    }
  } else {
    for (let i = 0; i < N; i++) {
      const p = P[i], a = Math.max(0, Math.sin(t * 1.7 + p.p * 3)); // 깜빡임
      if (a < 0.03) continue;
      g.globalAlpha = 0.26 * a; g.fillStyle = '#c8ff6e'; g.beginPath(); g.arc(p.x, p.y, p.r * 3.6, 0, 6.283); g.fill();
      g.globalAlpha = 0.4 + 0.6 * a; g.fillStyle = '#ebffaa'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
    }
  }
  g.restore();
}
