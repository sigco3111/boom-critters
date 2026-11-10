// 장애물: 나무 상자(30 HP), 폭발 통(20 HP, 연쇄 폭발), 묻힌 지뢰. 지형 위에 생성기가 놓고, 모두 캔버스 코드로 그린다 (외부 이미지 없음)
// 유닛은 상자·통을 그냥 지나갈 수 있고(걷기 방해 없음), 투사체만 부딪힌다. 지뢰는 눈에 보이지 않는다.
import { W } from './terrain.js?v=2026111054';

export const CRATE_HP = 30, BARREL_HP = 20;
export const PW = { crate: 24, barrel: 18 }, PH = { crate: 22, barrel: 28 };
export const BARREL_R = 45, BARREL_DMG = 30;       // 통 폭발: 반경 45, 피해 30
export const MINE_R = 40, MINE_DMG = 35;           // 지뢰 폭발: 반경 40, 피해 35
export const MINE_TRIGGER = 14, MINE_SEE = 70;     // 유닛이 14px 안에 오면 폭발 / 70px 안에 있을 때만 깜빡이는 점이 보인다
export const CAP = { barrel: 4, crate: 4, mine: 3 };
export const PACK_CHANCE = 0.25;                   // 상자가 부서질 때 치유 상자를 떨어뜨릴 확률

const WATER = 496;
const rngOf = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// 지형 위에 장애물을 놓는다: 평평한 땅(±12px에서 높이 차 3px 이하)에만, 유닛 시작 위치에서 떨어지게, 다리 위는 제외.
// unitXs: 유닛 시작 x 목록. opts.mines=false면 지뢰 없음 (쉬운 스테이지). 시드로 정해지므로 같은 시드 = 같은 배치
export function makeProps(terrain, seed, unitXs, opts = {}) {
  const rnd = rngOf((seed ^ 0x2f6e2b1) | 0), out = [], br = terrain.bridge;
  const flat = (x, tol = 3, span = 12) => {
    if (x < 28 || x > W - 28) return false;
    if (br && x > br.x1 - 14 && x < br.x2 + 14) return false;
    const sy = terrain.surfaceY(x);
    if (sy > WATER - 50 || sy < 150) return false;
    for (let d = -span; d <= span; d += 4) { const y = terrain.surfaceY(x + d); if (Math.abs(y - sy) > tol || y > WATER - 50) return false; }
    return true;
  };
  const free = (x, minUnit, minProp) => unitXs.every((u) => Math.abs(u - x) >= minUnit) && out.every((p) => Math.abs(p.x - x) >= minProp);
  const add = (type, x) => {
    const y = terrain.surfaceY(x) - 1; // 발이 닿는 y (유닛과 같은 기준: 이 아래 1px이 땅)
    out.push({ type, x, y, hp: type === 'crate' ? CRATE_HP : type === 'barrel' ? BARREL_HP : 1, maxHp: type === 'crate' ? CRATE_HP : BARREL_HP, fuse: -1, flash: 0, seed: rnd() * 10, rev: false, seen: false, known: [false, false] });
  };
  const pick = (type, minUnit, minProp) => {
    for (let k = 0; k < 80; k++) {
      const x = Math.round(28 + rnd() * (W - 56));
      if ((type === 'mine' ? flat(x, 8, 10) : flat(x)) && free(x, minUnit, minProp)) { add(type, x); return x; }
    }
    return null;
  };
  const nBarrel = Math.min(CAP.barrel, 2 + Math.floor(rnd() * 3)), nCrate = Math.min(CAP.crate, 2 + Math.floor(rnd() * 3)), nMine = opts.mines === false ? 0 : Math.min(CAP.mine, 1 + Math.floor(rnd() * 3));
  for (let i = 0; i < nBarrel; i++) {
    const x = pick('barrel', 52, 60);
    // 가끔 바로 옆(30~42px)에 한 개 더: 연쇄 폭발 (통 사이는 반경 45 안이라 하나가 터지면 이어서 터진다)
    if (x !== null && i + 1 < nBarrel && rnd() < 0.5) {
      const x2 = Math.round(x + (rnd() < 0.5 ? -1 : 1) * (30 + rnd() * 12));
      if (flat(x2) && free(x2, 52, 26)) { add('barrel', x2); i++; }
    }
  }
  for (let i = 0; i < nCrate; i++) pick('crate', 32, 34);
  for (let i = 0; i < nMine; i++) pick('mine', 45, 28);
  return out;
}

// ---------- 그리기 ----------
export function drawProp(g, p, time) {
  if (p.type === 'mine') return drawMine(g, p, time);
  const w = PW[p.type], h = PH[p.type], x = p.x, y = p.y + 1; // y = 땅
  const dmg = 1 - p.hp / p.maxHp; // 0~1 손상 정도
  g.save();
  if (p.type === 'crate') {
    g.fillStyle = '#c28a46'; g.strokeStyle = '#5b3a14'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, 2); g.fill(); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#7a5020';
    g.beginPath(); // 판자 이음선과 X 보강대
    g.moveTo(x - w / 2 + 2, y - h * 0.5); g.lineTo(x + w / 2 - 2, y - h * 0.5);
    g.moveTo(x - w / 2 + 3, y - h + 3); g.lineTo(x + w / 2 - 3, y - 3);
    g.moveTo(x + w / 2 - 3, y - h + 3); g.lineTo(x - w / 2 + 3, y - 3);
    g.stroke();
    g.fillStyle = '#e0b070'; g.fillRect(x - w / 2 + 2, y - h + 2, w - 4, 2);
    if (dmg > 0.2) { g.strokeStyle = '#3a2208'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 4, y - h + 3); g.lineTo(x + 1, y - h * 0.55); g.lineTo(x - 3, y - 6); g.stroke(); }
  } else {
    g.fillStyle = '#c8362b'; g.strokeStyle = '#5a1410'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, 4); g.fill(); g.stroke();
    g.fillStyle = '#7e1c16'; g.fillRect(x - w / 2 + 1, y - h * 0.72, w - 2, 3); g.fillRect(x - w / 2 + 1, y - h * 0.22, w - 2, 3); // 쇠띠
    g.fillStyle = '#ffd24a'; // 위험 표시(노란 삼각형 + 느낌표)
    g.beginPath(); g.moveTo(x, y - h * 0.62); g.lineTo(x + 5.5, y - h * 0.3); g.lineTo(x - 5.5, y - h * 0.3); g.closePath(); g.fill();
    g.fillStyle = '#5a1410'; g.fillRect(x - 0.7, y - h * 0.54, 1.4, 5); g.fillRect(x - 0.7, y - h * 0.38, 1.4, 1.6);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x - w / 2 + 3, y - h + 3, 2.5, h - 8); // 윤기
    if (dmg > 0.2) { g.strokeStyle = '#2a0a08'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 2, y - h + 2); g.lineTo(x - 2, y - h * 0.6); g.stroke(); }
  }
  if (p.flash > 0 || (p.fuse >= 0 && Math.floor(time * 24) % 2 === 0)) { // 피격 번쩍임 / 곧 터질 때 깜빡임
    g.globalAlpha = p.fuse >= 0 ? 0.75 : Math.min(0.7, p.flash * 3);
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, 3); g.fill();
  }
  g.restore();
}

// 지뢰: 평소에는 보이지 않는다. 유닛이 70px 안이거나 근처 폭발에 맞아 드러난 뒤에는 작은 원판과 깜빡이는 붉은 점
function drawMine(g, m, time) {
  if (!m.seen && !m.rev) return;
  const on = Math.floor(time * 5 + m.seed) % 2 === 0;
  g.save();
  g.fillStyle = 'rgba(40,40,40,0.9)'; g.beginPath(); g.ellipse(m.x, m.y + 1, 6.5, 2.4, 0, 0, 6.283); g.fill();
  g.fillStyle = on ? '#ff3b30' : '#7a1a14'; g.beginPath(); g.arc(m.x, m.y - 1, 2.2, 0, 6.283); g.fill();
  if (on) { g.globalAlpha = 0.35; g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(m.x, m.y - 1, 5, 0, 6.283); g.fill(); }
  g.restore();
}
