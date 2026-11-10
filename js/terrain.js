// 파괴 가능한 지형: 오프스크린 캔버스 + 알파 기반 충돌
export const W = 960, H = 540;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 기본(초원) 지형 색. 스테이지 테마가 있으면 theme.tile 등으로 덮어쓴다
const DEFAULT_THEME = {
  tile: { base: '#8a5a30', dark: 'rgba(60,35,15,0.35)', light: 'rgba(190,140,80,0.30)', pebble: 'rgba(150,140,130,0.55)' },
  shade: 'rgba(20,10,0,0.55)', edge: ['#3f8f2a', '#5fb53b', '#86d85a'], tuft: '#5fb53b', tuftLen: 6,
};

function makeDirtTile(rnd, tile) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = tile.base;
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 160; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? tile.dark : tile.light;
    g.fillRect(rnd() * 64, rnd() * 64, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 7; i++) {
    g.fillStyle = tile.pebble;
    g.beginPath();
    g.ellipse(rnd() * 64, rnd() * 64, 2 + rnd() * 3, 1.5 + rnd() * 2, 0, 0, 7);
    g.fill();
  }
  return c;
}

// 지형 프리셋(빠른 대전 '지형' 선택): gentle = 낮은 진폭의 완만한 땅, hills = 기본(예전과 같은 난수 순서), canyon = 가운데 깊은 협곡과 높은 벽
// island = 물 위에 떠 있는 섬 2~3개, bridge = 두 절벽을 잇는 얇은 부술 수 있는 다리, canyonbridge = 협곡 위에 다리(스테이지 13 전용, 빠른 대전 선택지에는 없음)
export const TERRAINS = ['gentle', 'hills', 'canyon', 'island', 'bridge', 'canyonbridge'];
// 지형 '랜덤': 시드로 정한다 (16칸 중 gentle 3 · hills 6 · canyon 3 · island 2 · bridge 2). 테마(themeForSeed)와 다른 해시를 써서 서로 영향이 없다
export function terrainForSeed(seed) { const v = Math.imul((seed | 0) ^ 0x9e3779b9, 2246822519) >>> 28; return v < 3 ? 'gentle' : v < 9 ? 'hills' : v < 12 ? 'canyon' : v < 14 ? 'island' : 'bridge'; }
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
// 열마다 지표면 높이 h[x] (y 아래가 땅). 협곡은 양쪽 끝 유닛 배치 구역(x≈20~385, 535~910) 밖인 x 400~540에만 파서 모든 유닛이 평평한 고원 위에 서게 한다
export function makeHeights(rnd, kind = 'hills') {
  const h = new Float32Array(W);
  if (kind === 'island') {
    // 섬 2~3개: 섬 사이는 물(h=H, 지형 없음). 섬 가장자리는 40px에 걸쳐 둥글게 물속(505)으로 가라앉는다. 유닛 배치 구역(x≈20~385, 535~910)에 큰 섬이 걸치도록 한다
    const three = rnd() < 0.5, p = rnd() * 6.283;
    const isl = three
      ? [[8, 290 + rnd() * 25, 320 + rnd() * 45], [365 + rnd() * 20, 470 + rnd() * 15, 350 + rnd() * 40], [545 + rnd() * 10, 952, 315 + rnd() * 45]]
      : [[8, 385 + rnd() * 20, 320 + rnd() * 45], [530 + rnd() * 15, 952, 315 + rnd() * 45]];
    h.fill(H);
    for (const [x0, x1, top] of isl) {
      for (let x = Math.ceil(x0); x <= x1; x++) {
        const d = Math.min(x - x0, x1 - x), e = smooth(d / 40), y = top + 14 * Math.sin(p + x * 0.02) + 7 * Math.sin(2 * p + x * 0.055);
        h[x] = y + (505 - y) * (1 - e);
      }
    }
    return h;
  }
  if (kind === 'bridge') {
    // 왼쪽·오른쪽 절벽 사이가 물. 절벽 벽면은 10px에 걸쳐 가파르게 물속으로. 다리는 두 절벽 윗면을 잇는 두께 7px 판자
    const L = 392 + rnd() * 16, R = 548 - rnd() * 16, p = rnd() * 6.283, tl = 290 + rnd() * 40, tr = 290 + rnd() * 40;
    h.fill(H);
    for (let x = 0; x < W; x++) {
      const left = x <= L, edge = left ? L - x : x - R;
      if (left ? x > L : x < R) continue;
      const top = (left ? tl : tr) + 10 * Math.sin(p + x * 0.017) + 5 * Math.sin(2.3 * p + x * 0.05);
      h[x] = top + (505 - top) * (1 - smooth(edge / 10));
    }
    const x1 = Math.floor(L) - 12, x2 = Math.ceil(R) + 12;
    h.bridge = { x1, y1: h[x1], x2, y2: h[x2], th: 7 };
    return h;
  }
  if (kind === 'canyon' || kind === 'canyonbridge') {
    const left = 255 + rnd() * 40, right = 255 + rnd() * 40, cx = 466 + rnd() * 8, half = 28 + rnd() * 6, wall = 32, floor = 440 + rnd() * 16, p = rnd() * 6.283;
    for (let x = 0; x < W; x++) {
      const t = Math.min(1, Math.max(0, (Math.abs(x - cx) - half) / wall)), s = t * t * (3 - 2 * t);
      const top = (x < cx ? left : right) + 12 * Math.sin(p + (6.283 * 3 * x) / W) + 7 * Math.sin(2.1 * p + (6.283 * 7 * x) / W);
      h[x] = Math.max(215, Math.min(458, floor + (top - floor) * s));
    }
    if (kind === 'canyonbridge') { // 협곡 양쪽 벽 윗면을 잇는 다리 (끝이 벽 윗면 안쪽으로 4px 파묻힌다)
      const x1 = Math.floor(cx - half - wall) - 4, x2 = Math.ceil(cx + half + wall) + 4;
      h.bridge = { x1, y1: h[x1], x2, y2: h[x2], th: 8 };
    }
    return h;
  }
  const k = kind === 'gentle' ? 0.4 : 1;
  const comps = [[70, 1.0], [40, 2.3], [22, 4.7], [10, 9.1]].map(([a, f]) => ({
    a: a * (0.6 + rnd() * 0.8) * k, f: f * (0.8 + rnd() * 0.4), p: rnd() * 6.283,
  }));
  const valley = rnd() < 0.5;
  const feat = (valley ? 1 : -1) * (60 + rnd() * 45) * (kind === 'gentle' ? 0.3 : 1);
  for (let x = 0; x < W; x++) {
    let y = 345;
    for (const c of comps) y += c.a * Math.sin(c.p + (6.283 * c.f * x) / W);
    y += feat * Math.exp(-Math.pow((x - W / 2) / 110, 2));
    h[x] = Math.max(215, Math.min(458, y)); // 최고점 215: 이름표가 상단 HUD(바람·시드 표시) 아래에 머문다
  }
  return h;
}

export class Terrain {
  // headless=true: 캔버스 없이 높이맵만으로 충돌 배열을 만든다 (window.__sim 시뮬레이션용, 렌더링 불가)
  constructor(seed, theme, headless = false, kind = 'hills') {
    this.kind = TERRAINS.includes(kind) ? kind : 'hills';
    this.theme = theme || DEFAULT_THEME;
    this.headless = headless;
    this.alpha = new Uint8Array(W * H);
    this.top = new Int16Array(W).fill(H); // 열마다 첫 지형 픽셀의 y (surfaceY 캐시): 폭발이 지형을 깎을 때 영향받은 열만 다시 계산한다
    if (!headless) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W; this.canvas.height = H;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    this.generate(seed);
  }

  generate(seed) {
    const rnd = mulberry32(seed);
    const h = makeHeights(rnd, this.kind);
    this.heights = h;
    this.bridge = h.bridge || null; // { x1, y1, x2, y2, th }: 다리 (지형 픽셀이라 폭발에 깎인다)
    if (this.headless) {
      for (let x = 0; x < W; x++) for (let y = Math.ceil(h[x]); y < H; y++) this.alpha[y * W + x] = 255;
      const b = this.bridge;
      if (b) for (let x = b.x1; x <= b.x2; x++) { const yc = b.y1 + ((b.y2 - b.y1) * (x - b.x1)) / (b.x2 - b.x1); for (let y = Math.floor(yc); y <= Math.floor(yc + b.th); y++) this.alpha[y * W + x] = 255; }
      this.scanTop(0, W, true);
      return;
    }
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x < W; x++) g.lineTo(x, h[x]);
    g.lineTo(W, H); g.closePath();
    g.fillStyle = g.createPattern(makeDirtTile(rnd, this.theme.tile), 'repeat');
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    const grad = g.createLinearGradient(0, 200, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, this.theme.shade);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const line = (w, dy, col) => {
      g.beginPath();
      let on = false;
      for (let x = 0; x < W; x++) { // 물 위 빈 열(h≥H)에서는 선을 끊는다
        if (h[x] >= H) { on = false; continue; }
        if (on) g.lineTo(x, h[x] + dy); else { g.moveTo(x, h[x] + dy); on = true; }
      }
      g.lineWidth = w; g.strokeStyle = col; g.lineJoin = 'round'; g.stroke();
    };
    const [e1, e2, e3] = this.theme.edge;
    line(16, 3, e1);
    line(10, 1, e2);
    line(4, -2, e3);
    // 풀(눈·모래) 가장자리 술
    g.fillStyle = this.theme.tuft;
    for (let x = 0; x < W; x += 5) {
      const l = this.theme.tuftLen + ((x * 7) % 5);
      g.fillRect(x, h[x] + 2, 2, l);
    }
    g.globalCompositeOperation = 'source-over';
    if (this.bridge) this.drawBridge(g, this.bridge);
    this.refresh(0, 0, W, H);
  }

  // 나무 다리: 불투명하게 칠해야 충돌(알파)에 잡힌다. 판자 이음선과 윗면 하이라이트
  drawBridge(g, b) {
    const yAt = (x) => b.y1 + ((b.y2 - b.y1) * (x - b.x1)) / (b.x2 - b.x1);
    g.save();
    g.beginPath(); g.moveTo(b.x1, b.y1); g.lineTo(b.x2, b.y2); g.lineTo(b.x2, b.y2 + b.th); g.lineTo(b.x1, b.y1 + b.th); g.closePath();
    g.fillStyle = '#9a6a35'; g.fill();
    g.lineWidth = 1; g.strokeStyle = '#4a2c12';
    g.beginPath();
    for (let x = b.x1 + 8; x < b.x2; x += 10) { g.moveTo(x + 0.5, yAt(x)); g.lineTo(x + 0.5, yAt(x) + b.th); }
    g.stroke();
    g.lineWidth = 2; g.strokeStyle = '#d9a566';
    g.beginPath(); g.moveTo(b.x1, b.y1 + 1); g.lineTo(b.x2, b.y2 + 1); g.stroke();
    g.strokeStyle = '#5a3a1a';
    g.beginPath(); g.moveTo(b.x1, b.y1 + b.th - 0.5); g.lineTo(b.x2, b.y2 + b.th - 0.5); g.stroke();
    g.restore();
  }

  refresh(x, y, w, h) {
    x = Math.max(0, x | 0); y = Math.max(0, y | 0);
    w = Math.min(W - x, w | 0); h = Math.min(H - y, h | 0);
    if (w <= 0 || h <= 0) return;
    const d = this.ctx.getImageData(x, y, w, h).data;
    for (let j = 0; j < h; j++) {
      const row = (y + j) * W + x;
      for (let i = 0; i < w; i++) this.alpha[row + i] = d[(j * w + i) * 4 + 3];
    }
    this.scanTop(x, w, x === 0 && w === W && y === 0 && h === H);
  }

  // x0부터 n개 열의 첫 지형 픽셀 y를 다시 구한다. 지형은 깎이기만 하므로 전체를 새로 만들 때(full)가 아니면 이전 값부터 내려가며 찾는다
  scanTop(x0, n, full) {
    const A = this.alpha, T = this.top;
    for (let x = x0; x < x0 + n; x++) {
      let y = full ? 0 : T[x];
      while (y < H && A[y * W + x] <= 100) y++;
      T[x] = y;
    }
  }

  solid(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    return this.alpha[y * W + x] > 100;
  }

  // 첫 번째 지형 픽셀의 y (위에서 아래로)
  surfaceY(x) {
    return this.top[Math.max(0, Math.min(W - 1, Math.floor(x)))];
  }

  crater(x, y, r) {
    if (this.headless) {
      const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
      const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if ((i - x) * (i - x) + (j - y) * (j - y) <= r * r) this.alpha[j * W + i] = 0;
      this.scanTop(x0, x1 - x0 + 1, false);
      return;
    }
    const g = this.ctx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    // 그을음(scorch): 구덩이 가장자리에서 바깥으로 부드럽게 옅어지는 어두운 고리. 지형 캔버스에 그려 경기 내내 남는다 (지형이 있는 곳에만 칠해지는 source-atop)
    const R = r + 24, sg = g.createRadialGradient(x, y, Math.max(0, r - 2), x, y, R);
    sg.addColorStop(0, 'rgba(6,3,1,0.92)'); sg.addColorStop(0.3, 'rgba(8,4,2,0.7)'); sg.addColorStop(0.65, 'rgba(10,5,2,0.3)'); sg.addColorStop(1, 'rgba(10,5,2,0)');
    g.fillStyle = sg;
    g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
    g.fillStyle = 'rgba(12,7,3,0.5)'; // 가장자리 둘레에 흩어진 검댕 점
    for (let i = 0, n = 6 + (r / 4 | 0); i < n; i++) {
      const a = Math.random() * 6.283, d = r + 2 + Math.random() * 18, s = 0.8 + Math.random() * 1.8;
      g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.restore();
    this.refresh(x - r - 26, y - r - 26, 2 * r + 52, 2 * r + 52);
  }
}
