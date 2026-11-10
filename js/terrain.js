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

function makeDirtTile(rnd) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a30';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 160; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? 'rgba(60,35,15,0.35)' : 'rgba(190,140,80,0.30)';
    g.fillRect(rnd() * 64, rnd() * 64, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 7; i++) {
    g.fillStyle = 'rgba(150,140,130,0.55)';
    g.beginPath();
    g.ellipse(rnd() * 64, rnd() * 64, 2 + rnd() * 3, 1.5 + rnd() * 2, 0, 0, 7);
    g.fill();
  }
  return c;
}

export class Terrain {
  constructor(seed) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.alpha = new Uint8Array(W * H);
    this.generate(seed);
  }

  generate(seed) {
    const rnd = mulberry32(seed);
    const comps = [[70, 1.0], [40, 2.3], [22, 4.7], [10, 9.1]].map(([a, f]) => ({
      a: a * (0.6 + rnd() * 0.8), f: f * (0.8 + rnd() * 0.4), p: rnd() * 6.283,
    }));
    const valley = rnd() < 0.5;
    const feat = (valley ? 1 : -1) * (60 + rnd() * 45);
    const h = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let y = 345;
      for (const c of comps) y += c.a * Math.sin(c.p + (6.283 * c.f * x) / W);
      y += feat * Math.exp(-Math.pow((x - W / 2) / 110, 2));
      h[x] = Math.max(215, Math.min(458, y)); // 최고점 215: 이름표가 상단 HUD(바람·시드 표시) 아래에 머문다
    }
    this.heights = h;
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x < W; x++) g.lineTo(x, h[x]);
    g.lineTo(W, H); g.closePath();
    g.fillStyle = g.createPattern(makeDirtTile(rnd), 'repeat');
    g.fill();
    g.globalCompositeOperation = 'source-atop';
    const grad = g.createLinearGradient(0, 200, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(20,10,0,0.55)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const line = (w, dy, col) => {
      g.beginPath();
      for (let x = 0; x < W; x++) (x ? g.lineTo(x, h[x] + dy) : g.moveTo(x, h[x] + dy));
      g.lineWidth = w; g.strokeStyle = col; g.lineJoin = 'round'; g.stroke();
    };
    line(16, 3, '#3f8f2a');
    line(10, 1, '#5fb53b');
    line(4, -2, '#86d85a');
    // 풀 가장자리 술
    g.fillStyle = '#5fb53b';
    for (let x = 0; x < W; x += 5) {
      const l = 6 + ((x * 7) % 5);
      g.fillRect(x, h[x] + 2, 2, l);
    }
    g.globalCompositeOperation = 'source-over';
    this.refresh(0, 0, W, H);
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
  }

  solid(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    return this.alpha[y * W + x] > 100;
  }

  // 첫 번째 지형 픽셀의 y (위에서 아래로)
  surfaceY(x) {
    x = Math.max(0, Math.min(W - 1, Math.floor(x)));
    for (let y = 0; y < H; y++) if (this.alpha[y * W + x] > 100) return y;
    return H;
  }

  crater(x, y, r) {
    const g = this.ctx;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(25,14,6,0.6)';
    g.beginPath(); g.arc(x, y, r + 5, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.restore();
    this.refresh(x - r - 6, y - r - 6, 2 * r + 12, 2 * r + 12);
  }
}
