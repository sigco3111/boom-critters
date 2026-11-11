// 시작·스테이지 선택 화면의 움직이는 배경: 별밤 하늘에 천천히 흐르는 구름(시차 3겹)과 떠다니는 별. 외부 이미지 없이 캔버스 코드로 그린다.
// 가볍게: 층마다 한 번만 미리 그려 두고(오프스크린) 프레임마다 drawImage로 옮기기만 하며, 30fps로 제한한다.
// 움직임 줄이기(prefers-reduced-motion)면 한 프레임만 그려 정지 화면으로 두고, 탭이 숨겨지면 main.js가 루프 자체를 멈춘다.
import { THEMES } from './themes.js?v=2026111058';
import { mulberry32 } from './terrain.js?v=2026111058';

const BW = 640, BH = 360;        // 내부 해상도 (CSS로 화면 크기에 맞춰 늘림 — 부드러운 구름이라 낮은 해상도로 충분)
const STEP = 1 / 30;             // 프레임 간격(초): 30fps
const STILL_T = 40;              // 움직임 줄이기일 때 보여 줄 정지 화면의 시각(초)
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// 구름 한 덩이 (원 5개). strip 가장자리를 넘으면 반대쪽에도 그려 이음매 없이 이어지게 한다
function cloud(g, x, y, s, color) {
  g.fillStyle = color;
  for (const ox of [0, -BW, BW]) {
    for (const [dx, dy, r] of [[0, 0, 22], [26, 6, 26], [54, 2, 20], [28, -10, 20], [-18, 8, 16]]) {
      g.beginPath(); g.arc(x + ox + dx * s, y + dy * s, r * s, 0, 7); g.fill();
    }
  }
}

export class MenuBg {
  constructor() {
    this.ready = false;
    this.acc = 0; this.t = 0;                 // 프레임 누적 시간 / 애니메이션 시각
    this.frames = 0;                          // 지금까지 그린 프레임 수 (디버깅·검증용)
    this.still = null;                        // 정지 화면을 그려 둔 캔버스
    this.mode = 'idle';                       // 'animated' | 'still' | 'idle'
  }

  build() {
    const th = THEMES[3], rnd = mulberry32(0x6d656e75);
    // 하늘 + 달 + 먼 언덕
    const back = mk(BW, BH), g = back.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, BH);
    for (const [o, col] of th.sky) sky.addColorStop(o, col);
    g.fillStyle = sky; g.fillRect(0, 0, BW, BH);
    const glow = g.createRadialGradient(520, 80, 0, 520, 80, 110);
    glow.addColorStop(0, 'rgba(210,220,255,0.40)'); glow.addColorStop(1, 'rgba(210,220,255,0)');
    g.fillStyle = glow; g.fillRect(400, 0, 240, 200);
    g.fillStyle = '#f4f1da'; g.beginPath(); g.arc(520, 80, 22, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,160,150,0.35)';
    for (const [dx, dy, r] of [[-7, -5, 5], [6, 4, 6], [-4, 10, 3.5]]) { g.beginPath(); g.arc(520 + dx, 80 + dy, r, 0, 7); g.fill(); }
    const shade = g.createLinearGradient(0, 0, 0, BH); // 글자가 잘 읽히도록 위쪽을 살짝 어둡게
    shade.addColorStop(0, 'rgba(4,8,28,0.35)'); shade.addColorStop(0.6, 'rgba(4,8,28,0.08)'); shade.addColorStop(1, 'rgba(4,8,28,0.25)');
    g.fillStyle = shade; g.fillRect(0, 0, BW, BH);
    this.back = back;
    // 별: 깊이 2겹 (먼 별은 작고 느림). 가장자리를 넘는 별은 반대쪽에도 그려 이어붙임
    this.stars = [[70, 0.5, 1.0, 0.55, 3], [36, 0.9, 1.7, 0.85, 6]].map(([n, r0, r1, a, speed]) => {
      const c = mk(BW, BH * 0.62), q = c.getContext('2d');
      for (let i = 0; i < n; i++) {
        const x = rnd() * BW, y = Math.pow(rnd(), 1.3) * BH * 0.6, r = r0 + rnd() * (r1 - r0);
        q.fillStyle = `rgba(255,255,${225 + ((rnd() * 30) | 0)},${a * (0.6 + rnd() * 0.4)})`;
        for (const ox of [0, -BW]) { q.beginPath(); q.arc(x + ox, y, r, 0, 7); q.fill(); }
      }
      return { c, speed };
    });
    // 반짝이는 큰 별 몇 개 (프레임마다 십자 모양을 그림)
    this.twinkle = Array.from({ length: 9 }, () => ({ x: rnd() * BW, y: rnd() * BH * 0.5, p: rnd() * 6.28, sp: 0.6 + rnd() * 0.8, speed: 4 }));
    // 구름 3겹 (뒤에서 앞으로: 느리고 흐릿 → 빠르고 진함). 마지막 층은 언덕 앞의 옅은 안개
    this.clouds = [
      { y: 18, h: 120, n: 4, s: [0.7, 1.0], color: 'rgba(150,160,230,0.10)', speed: 5, front: false },
      { y: 80, h: 120, n: 3, s: [0.9, 1.3], color: 'rgba(170,180,240,0.15)', speed: 9, front: false },
      { y: 205, h: 120, n: 3, s: [1.2, 1.7], color: 'rgba(130,140,210,0.20)', speed: 15, front: true },
    ].map((L) => {
      const c = mk(BW, L.h), q = c.getContext('2d');
      for (let i = 0; i < L.n; i++) cloud(q, ((i + rnd() * 0.7) / L.n) * BW, 30 + rnd() * (L.h - 70), L.s[0] + rnd() * (L.s[1] - L.s[0]), L.color);
      return { c, y: L.y, speed: L.speed, front: L.front };
    });
    // 언덕 3겹 (정지)
    const hills = mk(BW, BH), h = hills.getContext('2d');
    th.hills.forEach(([col, base, amp], k) => {
      const p = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], f = 0.7 + rnd() * 0.8, by = BH * (0.66 + k * 0.1), a = amp * 0.6;
      h.fillStyle = col; h.beginPath(); h.moveTo(0, BH);
      for (let x = 0; x <= BW; x += 6) {
        const u = x / BW * 6.283;
        h.lineTo(x, by + a * (0.6 * Math.sin(u * f + p[0]) + 0.3 * Math.sin(u * f * 2.3 + p[1]) + 0.2 * Math.sin(u * f * 5.1 + p[2])));
      }
      h.lineTo(BW, BH); h.closePath(); h.fill();
    });
    this.hills = hills;
    this.ready = true;
  }

  // 시각 t(초)의 한 프레임을 g(내부 해상도 BW×BH 캔버스)에 그린다
  paint(g, t) {
    if (!this.ready) this.build();
    g.drawImage(this.back, 0, 0);
    for (const L of this.stars) { const x = -((t * L.speed) % BW); g.drawImage(L.c, x, 0); g.drawImage(L.c, x + BW, 0); }
    for (const s of this.twinkle) {
      const k = 0.5 + 0.5 * Math.sin(t * s.sp * 2.2 + s.p), x = (((s.x - t * s.speed) % BW) + BW) % BW, l = 2 + 3 * k;
      g.fillStyle = `rgba(255,255,240,${0.2 + 0.55 * k})`;
      g.fillRect(x - l, s.y - 0.5, 2 * l, 1); g.fillRect(x - 0.5, s.y - l, 1, 2 * l);
    }
    for (const L of this.clouds) if (!L.front) { const x = -((t * L.speed) % BW); g.drawImage(L.c, x, L.y); g.drawImage(L.c, x + BW, L.y); }
    g.drawImage(this.hills, 0, 0);
    for (const L of this.clouds) if (L.front) { const x = -((t * L.speed) % BW); g.drawImage(L.c, x, L.y); g.drawImage(L.c, x + BW, L.y); }
  }

  // 매 rAF 프레임마다 main.js가 부른다. el: 지금 보이는 배경 캔버스, dt: 지난 프레임 이후 시간(초), reduced: 움직임 줄이기 여부
  step(el, dt, reduced) {
    if (el.width !== BW) { el.width = BW; el.height = BH; this.drawnEl = null; }
    if (reduced) { // 한 번만 그려 두고 이후에는 아무것도 하지 않는다
      this.mode = 'still';
      if (this.drawnEl !== el || !this.drawnStill) {
        this.paint(el.getContext('2d'), STILL_T);
        this.drawnEl = el; this.drawnStill = true; this.frames++;
      }
      return;
    }
    this.mode = 'animated';
    this.acc += dt;
    if (this.acc < STEP && this.drawnEl === el && !this.drawnStill) return; // 30fps 제한
    this.t += Math.min(this.acc, 0.1); this.acc = 0;
    this.paint(el.getContext('2d'), this.t);
    this.drawnEl = el; this.drawnStill = false; this.frames++;
  }
}
