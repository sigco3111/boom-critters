// 스프라이트 이펙트: 폭발(Explosions by chabull), 타격(Pixelated Hit Animations), 머즐 플래시(Gun Muzzle Flash Effects), 발사체(Blue projectile),
// 번개(Lightning effect), 화염(Fire Aura), 치유(Heal effect)
// 시트는 로딩 화면에서 미리 받는다. 실패한 시트는 null로 남고, 그 이펙트를 쓰는 곳은 예전 캔버스 그림으로 대신한다
const SHEETS = { expl: 'assets/fx/explosions.png', hit: 'assets/fx/hit.png', muz: 'assets/fx/muzzle.png', orb: 'assets/fx/orb.png', bolt: 'assets/fx/bolt.png', flame: 'assets/fx/flame.png', heal: 'assets/fx/heal.png' };
export const FX_FILES = Object.keys(SHEETS);
const img = {}; // 시트 이름 -> Image (받기 성공한 것만)

// 애니메이션: 시트 안 위치(sx, sy), 프레임 크기(fw, fh), 가로 칸 수(cols), 프레임 수(n), 초당 프레임(fps), 정지 프레임(still: 모션 줄이기용 한 장), 기준점(ax, ay)
export const ANIMS = {
  boomL: { s: 'expl', sx: 0, sy: 0, fw: 128, fh: 128, cols: 4, n: 16, fps: 26, still: 3, ax: 0.5, ay: 0.5, fade: 0.35, blend: true },   // 로켓·수류탄 (큰 폭발)
  boomS: { s: 'expl', sx: 0, sy: 512, fw: 64, fh: 64, cols: 4, n: 12, fps: 22, still: 3, ax: 0.5, ay: 0.5, fade: 0.3, blend: true },    // 대포·화염탄·공습 (작은 폭발)
  hit: { s: 'hit', sx: 0, sy: 0, fw: 64, fh: 64, cols: 5, n: 10, fps: 36, still: 4, ax: 0.5, ay: 0.5, fade: 0.2, blend: true },       // 유닛 타격
  muzF: { s: 'muz', sx: 0, sy: 0, fw: 80, fh: 80, cols: 3, n: 3, fps: 18, still: 1, ax: 0.04, ay: 0.5, fade: 0.2, blend: true },      // 노란 머즐 플래시
  muzI: { s: 'muz', sx: 0, sy: 80, fw: 80, fh: 80, cols: 3, n: 3, fps: 18, still: 1, ax: 0.04, ay: 0.5, fade: 0.2, blend: true },    // 파란 이온 플래시 (번개)
  zap: { s: 'bolt', sx: 0, sy: 0, fw: 128, fh: 128, cols: 4, n: 4, fps: 16, still: 1, ax: 0.5, ay: 0.5, fade: 0.4, blend: true },        // 번개 타격점의 전기 불꽃 (Lightning effect, 파랗게 다시 칠함)
  flameBurst: { s: 'flame', sx: 0, sy: 0, fw: 112, fh: 96, cols: 4, n: 14, fps: 18, still: 5, ax: 0.5, ay: 0.66, fade: 0.3, blend: true }, // 화염탄 착탄 (Fire Aura 한 번 재생)
  flame: { s: 'flame', sx: 0, sy: 0, fw: 112, fh: 96, cols: 4, n: 14, fps: 14, still: 5, ax: 0.5, ay: 0.66, fade: 0, blend: true },       // 화염 지대 (Fire Aura 반복, 지면 위에 여러 개를 어긋나게 깜빡임)
  heal: { s: 'heal', sx: 0, sy: 0, fw: 128, fh: 128, cols: 3, n: 3, fps: 4.5, still: 1, ax: 0.5, ay: 0.5, fade: 0.35, blend: true, grow: 0.5 }, // 보급 상자 치유 (Heal effect, 초록으로 다시 칠함, 커지며 사라짐)
  orb: { s: 'orb', sx: 0, sy: 0, fw: 24, fh: 24, cols: 4, n: 4, fps: 10, still: 0, ax: 0.5, ay: 0.5, fade: 0, blend: false },         // 대포탄
};

const tryLoad = (src) => new Promise((res) => {
  if (typeof Image === 'undefined') return res(null);
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => res(null);
  im.src = src;
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 모든 시트를 받는다 (실패하면 한 번 더). 시트 하나가 끝날 때마다 onEach(성공 여부). 절대 reject하지 않는다
export function load(onEach = () => {}) {
  return Promise.all(FX_FILES.map(async (k) => {
    let im = await tryLoad(SHEETS[k]);
    if (!im) { await wait(400); im = await tryLoad(SHEETS[k]); }
    if (im) img[k] = im;
    onEach(!!im);
    return !!im;
  }));
}
export const sheet = (anim) => img[anim.s] || null;
export const ready = (name) => !!img[ANIMS[name].s];

// anim을 (x, y)에 크기 size(px, 한 변)로 그린다. 프레임 번호 f는 정수, alpha는 0~1, rot은 라디안. glow면 같은 그림을 더해 그리기(lighter)로 한 번 더 겹쳐 빛나게
export function drawFrame(g, anim, f, x, y, size, rot, alpha, glow) {
  const im = img[anim.s]; if (!im || alpha <= 0) return;
  const col = f % anim.cols, row = (f / anim.cols) | 0;
  const sx = anim.sx + col * anim.fw, sy = anim.sy + row * anim.fh;
  const dw = size, dh = size * anim.fh / anim.fw, dx = -dw * anim.ax, dy = -dh * anim.ay;
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  if (anim.s === 'orb') g.imageSmoothingEnabled = false; // 픽셀 그림은 또렷하게
  g.globalAlpha = alpha;
  g.drawImage(im, sx, sy, anim.fw, anim.fh, dx, dy, dw, dh);
  if (glow && anim.blend) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha * 0.5;
    g.drawImage(im, sx, sy, anim.fw, anim.fh, dx, dy, dw, dh);
  }
  g.restore();
}
