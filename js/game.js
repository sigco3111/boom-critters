// 게임 로직: 유닛 물리, 턴 흐름, 투사체, AI
import { Terrain, W, H, mulberry32 } from './terrain.js';
import * as audio from './audio.js';

export { W, H };
export const WATER_Y = 496;
const UNIT_G = 900;      // 유닛 중력 (px/s^2)
const PROJ_G = 500;      // 투사체 중력
const UNIT_H = 38, HALF_W = 9;
const BODY_CY = 26;      // 몸통 중심 높이 (발 기준 위쪽, 스프라이트 키 약 52px)
const BODY_R = 15;       // 투사체 명중 판정 반경(몸통 중심 기준)
const TAG_TOP = 84, TAG_H = 26; // 이름표+HP 블록: 발 위 84px부터 높이 26px
const BODY_HALF = 8;     // 몸통 캡슐의 세로 반길이 (중심에서 위/아래)
const BOUNCE_E = 0.55, BOUNCE_FRICTION = 0.85; // 수류탄 반발/마찰 계수
const CRATE_W = 22, CRATE_H = 20, CRATE_FALL = 85, CRATE_HEAL = 30, CRATE_EVERY = 4; // 보급 상자
const FALL_T = 80;       // 낙하 데미지 임계 높이
const TURN_TIME = 30;

export const WEAPONS = [
  { id: 'cannon', name: '대포탄', radius: 40, damage: 50, windK: 8, speedK: 1.0, knock: 380 },
  { id: 'rocket', name: '로켓', radius: 58, damage: 42, windK: 3, speedK: 0.85, knock: 470 },
  { id: 'grenade', name: '수류탄', radius: 55, damage: 60, windK: 1, speedK: 0.9, knock: 640, ammo: 3, fuse: 3 },
  { id: 'lightning', name: '번개', damage: 35, knock: 260, ammo: 2, instant: true },
  { id: 'fire', name: '화염탄', radius: 35, damage: 25, windK: 6, speedK: 0.95, knock: 320, ammo: 2, fireR: 50, fireTurns: 3, fireDmg: 8 },
];
// 하단 HUD 무기 슬롯 (캔버스 좌표)
const SLOT = { x: 10, y: H - 56, w: 62, h: 50, gap: 4 };
// 팀별 무기 탄약 (무한 = Infinity, 비활성 무기는 0)
const freshAmmo = () => [0, 1].map(() => WEAPONS.map((w) => (w.disabled ? 0 : w.ammo ?? Infinity)));
export function slotRect(i) { return [SLOT.x + i * (SLOT.w + SLOT.gap), SLOT.y, SLOT.w, SLOT.h]; }
export const TEAMS = [
  { name: '파랑 팀', color: '#3b82f6' },
  { name: '빨강 팀', color: '#ef4444' },
];
// Kenney Toon Characters 1 (assets/toon/<key>/<pose>.png)
export const CHARACTERS = [
  [['maleAdventurer', '남자 모험가'], ['femaleAdventurer', '여자 모험가'], ['malePerson', '남자']],
  [['robot', '로봇'], ['zombie', '좀비'], ['femalePerson', '여자']],
];
// 4번째 적 유닛(스테이지 후반): 로봇 스프라이트를 색조만 바꿔 재사용
const EXTRA_ENEMY = ['robot', '로봇 2', 'hue-rotate(150deg) saturate(1.4)'];
export const WALK_FRAMES = 8;
const STEP_LEN = 6;      // 걷기 프레임 하나당 이동 거리 (px)
const SPRITE_H = 64;     // 포즈 이미지(96x128) 표시 높이 -> 캐릭터 키 약 52px
const FADE_START = 0.6, FADE_END = 1.6; // 사망 후 페이드 (초)
const DIFF = { easy: { a: 7, p: 14, label: '쉬움' }, normal: { a: 3, p: 6, label: '보통' }, hard: { a: 1, p: 2, label: '어려움' } };
const ENEMY_X = { 1: [760], 2: [650, 820], 3: [600, 730, 865], 4: [560, 670, 780, 885] };

// ---------- 스테이지 / 무한 모드 설정 ----------
export const STAGE_COUNT = 10;
// 스테이지 s(1~10): 고정 시드, 적 수 2→4, 바람 범위와 AI 정확도가 단계마다 증가
export function stageConfig(s) {
  return { mode: 'stage', stage: s, seed: 20240 + s * 7919, enemies: s <= 3 ? 2 : s <= 6 ? 3 : 4, windMax: 3 + s, level: s };
}
// 무한 모드 웨이브 w(1~): 웨이브마다 적 수 2→4, 바람·AI 정확도 증가 (매번 새 지형)
export function waveConfig(w) {
  return { mode: 'endless', wave: w, enemies: Math.min(4, 2 + Math.floor((w - 1) / 2)), windMax: Math.min(14, 5 + w), level: Math.min(10, w + 1) };
}
// AI 오차 단계(1~10) -> 각도·파워 오차 계수 (1: 쉬움 수준 → 10: 어려움 수준)
export function levelErr(level) {
  const t = (clamp(level, 1, 10) - 1) / 9, e = DIFF.easy, h = DIFF.hard;
  return { a: e.a + (h.a - e.a) * t, p: e.p + (h.p - e.p) * t, pick: level <= 3 };
}

const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => Math.random() + Math.random() + Math.random() - 1.5;

export function launchSpeed(w, power) { return (40 + power * 6.5) * w.speedK; }

// 투사체 한 스텝. 'terrain' | 'water' | 'unit' | 'out' | null 반환
export function stepProj(p, dt, wind, terrain, units) {
  p.vx += wind * p.w.windK * dt;
  p.vy += PROJ_G * dt;
  p.age += dt;
  const dx = p.vx * dt, dy = p.vy * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
  for (let i = 0; i < n; i++) {
    p.x += dx / n; p.y += dy / n;
    if (p.x < -80 || p.x > W + 80 || p.y > H + 80) return 'out';
    if (terrain.solid(p.x, p.y)) return 'terrain';
    if (p.y > WATER_Y) return 'water';
    if (units) {
      for (const u of units) {
        if (!u.alive || (u === p.owner && p.age < 0.35)) continue;
        // 몸통 캡슐(세로 선분 + 반경) 판정: 중심은 발 위 BODY_CY
        const dy = Math.max(0, Math.abs(p.y - (u.y - BODY_CY)) - BODY_HALF);
        if (Math.hypot(u.x - p.x, dy) < BODY_R) return 'unit';
      }
    }
  }
  return null;
}

class Unit {
  constructor(team, idx, sprite, name, x, y) {
    this.team = team; this.idx = idx; this.sprite = sprite; this.name = name;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = 100; this.alive = true; this.grounded = true;
    this.facing = team === 0 ? 1 : -1;
    this.fallStart = y; this.moving = false; this.phase = Math.random() * 6;
    this.squash = 0; this.hurt = 0;
    this.walkDist = 0; this.shootT = 0; this.deadT = 0; this.drowned = false; this.cvy = 0;
    this.tint = null;
  }
}

export class Game {
  constructor(sprites) {
    this.sprites = sprites;     // 캐릭터 키 -> { 포즈 이름 -> Image }
    this.time = 0;
    this.bg = null;
    this.state = 'idle';
    this.units = []; this.particles = []; this.floaters = [];
    this.proj = null; this.shake = 0;
    this.bolt = null; this.flashT = 0; this.fires = []; this.crates = []; this.turnNo = 0;
    this.keys = { left: false, right: false, up: false, down: false };
    this.onOver = () => {}; this.onWave = () => {};
    this.mode = 'quick'; this.stage = 0; this.wave = 0; this.cleared = 0; this.windMax = 10; this.level = null;
    this.ammo = freshAmmo();    // 매치 시작 전에도 버튼 표시가 올바르도록
    this.stepTimer = 0;
  }

  // ---------- 매치 ----------
  // opts: { mode: 'quick'|'stage'|'endless', seed, enemies, windMax, level, stage, wave }
  newMatch(difficulty, opts = {}) {
    this.difficulty = difficulty;
    this.mode = opts.mode || 'quick';
    this.stage = opts.stage || 0;
    this.wave = opts.wave || 0; this.cleared = 0;
    this.windMax = opts.windMax ?? 10;
    this.level = opts.level ?? null;      // null이면 난이도(쉬움/보통/어려움)의 오차를 사용
    this.units = []; this.particles = []; this.floaters = []; this.proj = null;
    this.buildField(opts.seed ?? ((Math.random() * 1e9) | 0), opts.enemies ?? 3, null);
    this.nextIdx = [0, 0];
    this.turnTeam = 0;
    this.winner = null;
    this.angle = 45; this.power = 0; this.lastPower = 0; this.weapon = 0;
    // 팀별 무기 탄약 (무한 = Infinity, 비활성 무기는 0)
    this.ammo = freshAmmo();
    this.charging = false; this.ai = null;
    this.banner = null;
    this.startTurn();
  }

  // 지형·배경·유닛을 새로 배치. carry가 있으면 그 팀0 유닛의 체력/생존을 이어받는다 (무한 모드 웨이브 전환)
  buildField(seed, enemies, carry) {
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.bg = this.makeBackground(seed);
    this.units = []; this.particles = []; this.floaters = []; this.proj = null;
    this.bolt = null; this.flashT = 0; this.fires = []; this.crates = []; this.turnNo = 0;
    const rng = mulberry32(seed ^ 0x5bd1e995), jit = () => (rng() * 2 - 1) * 25;
    const baseX = [[95, 230, 360], ENEMY_X[enemies] || ENEMY_X[3]];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < baseX[t].length; i++) {
        const x = clamp(baseX[t][i] + jit(), 20, W - 20);
        const sy = this.terrain.surfaceY(x);
        const [sp, nm, tint] = t === 1 && i >= 3 ? EXTRA_ENEMY : CHARACTERS[t][i];
        const u = new Unit(t, i, sp, nm, x, sy - 1);
        u.tint = tint || null;
        for (let k = 0; k < 20 && this.blocked(u.x, u.y); k++) u.y--;
        u.fallStart = u.y;
        if (t === 0 && carry) {
          const old = carry[i];
          if (old && old.alive) u.hp = old.hp;
          else if (old) { u.alive = false; u.hp = 0; u.deadT = 99; }
        }
        this.units.push(u);
      }
    }
  }

  // 무한 모드: 다음 웨이브 시작. 생존 유닛은 체력 +35, 3의 배수 웨이브 직전엔 쓰러진 유닛 1명이 HP 50으로 복귀
  startWave(w) {
    const carry = this.units.filter((u) => u.team === 0);
    for (const u of carry) if (u.alive) u.hp = Math.min(100, u.hp + 35);
    if ((w - 1) % 3 === 0 && w > 1) {
      const dead = carry.find((u) => !u.alive);
      if (dead) { dead.alive = true; dead.hp = 50; dead.drowned = false; dead.deadT = 0; }
    }
    const cfg = waveConfig(w);
    this.wave = w; this.windMax = cfg.windMax; this.level = cfg.level;
    this.buildField((Math.random() * 1e9) | 0, cfg.enemies, carry);
    this.ammo = freshAmmo();
    this.nextIdx = [0, 0]; this.turnTeam = 0; this.winner = null;
    this.angle = 45; this.power = 0; this.weapon = 0; this.charging = false; this.ai = null;
    this.startTurn();
    this.banner = { text: `웨이브 ${w}`, color: TEAMS[0].color, t: 0 };
  }

  makeBackground(seed) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#6bb9ee'); sky.addColorStop(0.7, '#cdeeff'); sky.addColorStop(1, '#e8f8ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const x = ((seed >> (i * 3)) % 900) + (i * 157) % 960 * 0.3, y = 40 + (i * 53) % 120;
      for (const [dx, dy, r] of [[0, 0, 22], [24, 6, 26], [52, 2, 20], [26, -10, 20]]) {
        g.beginPath(); g.arc((x + dx) % W, y + dy, r, 0, 7); g.fill();
      }
    }
    g.fillStyle = 'rgba(120,170,200,0.55)';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, 300 + 40 * Math.sin(x / 130 + seed) + 25 * Math.sin(x / 47 + seed * 2));
    g.lineTo(W, H); g.fill();
    return c;
  }

  // ---------- 유닛 물리 ----------
  blocked(x, y) {
    const t = this.terrain;
    for (const hy of [14, 26, 36]) {
      if (t.solid(x - HALF_W, y - hy) || t.solid(x, y - hy) || t.solid(x + HALF_W, y - hy)) return true;
    }
    return false;
  }
  feetSolid(x, y) {
    const t = this.terrain;
    return t.solid(x - 5, y) || t.solid(x, y) || t.solid(x + 5, y);
  }

  walk(u, dir, dt) {
    u.facing = dir; u.moving = true;
    const nx = clamp(u.x + dir * 70 * dt, 12, W - 12), ox = u.x;
    for (let c = 0; c <= 4; c++) {
      if (!this.blocked(nx, u.y - c)) { u.x = nx; u.y -= c; break; }
    }
    u.walkDist += Math.abs(u.x - ox);
    let d = 0;
    while (d < 7 && !this.feetSolid(u.x, u.y + 1)) { u.y++; d++; }
    if (!this.feetSolid(u.x, u.y + 1)) { u.grounded = false; u.fallStart = u.y - d; u.vy = 0; u.vx = 0; }
    this.stepTimer -= dt;
    if (this.stepTimer <= 0 && u.grounded) { audio.play('step', { vol: 0.5, rate: rnd(0.9, 1.1) }); this.stepTimer = 0.3; }
  }

  jump(u, dirHeld) {
    if (!u.grounded) return;
    u.grounded = false; u.vy = -330; u.vx = dirHeld * 110; u.fallStart = u.y; u.y -= 1;
    if (dirHeld) u.facing = dirHeld;
    u.squash = -0.25;
  }

  updateUnit(u, dt) {
    u.phase += dt; u.hurt = Math.max(0, u.hurt - dt); u.shootT = Math.max(0, u.shootT - dt);
    u.squash += (0 - u.squash) * Math.min(1, dt * 10);
    if (u.grounded) {
      if (u.y > WATER_Y + 2) { this.drown(u); return; }
      if (!this.feetSolid(u.x, u.y + 1)) { u.grounded = false; u.fallStart = u.y; u.vy = 0; }
      else { u.vx = 0; return; }
    }
    // 공중
    u.vy += UNIT_G * dt;
    const mx = u.vx * dt, my = u.vy * dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my))));
    for (let i = 0; i < n; i++) {
      const nx = clamp(u.x + mx / n, 10, W - 10);
      if (!this.blocked(nx, u.y - 3)) u.x = nx; else u.vx *= -0.3;
      if (u.vy < 0) {
        if (this.terrain.solid(u.x, u.y - UNIT_H - 1) || this.terrain.solid(u.x - 6, u.y - UNIT_H - 1) || this.terrain.solid(u.x + 6, u.y - UNIT_H - 1)) { u.vy = 0; break; }
        u.y += my / n;
      } else {
        if (this.feetSolid(u.x, u.y + 1)) { this.land(u); return; }
        u.y += my / n;
      }
      if (u.y < u.fallStart) u.fallStart = u.y;
      if (u.y > WATER_Y + 2) { this.drown(u); return; }
    }
  }

  updateCorpse(u, dt) {
    u.deadT += dt;
    if (!this.feetSolid(u.x, u.y + 1) && u.y < WATER_Y + 40) { u.cvy += UNIT_G * dt; u.y += u.cvy * dt; } else u.cvy = 0;
  }

  land(u) {
    u.grounded = true; u.vx = 0; u.vy = 0; u.squash = 0.3;
    for (let k = 0; k < 6 && this.blocked(u.x, u.y); k++) u.y--;
    const dist = u.y - u.fallStart;
    if (dist > FALL_T) {
      const dmg = Math.floor((dist - FALL_T) * 0.4 + 4);
      audio.play('land', { vol: 0.8 });
      this.damage(u, dmg, '#ffd24a');
    }
  }

  drown(u) {
    if (!u.alive) return;
    u.alive = false; u.hp = 0; u.drowned = true;
    for (let i = 0; i < 18; i++) this.particles.push({ type: 'splash', x: u.x + rnd(-8, 8), y: WATER_Y, vx: rnd(-60, 60), vy: rnd(-260, -100), r: rnd(2, 5), life: 0, max: rnd(0.6, 1.0) });
    audio.play('land', { rate: 1.6, vol: 0.8 });
    this.floaters.push({ x: u.x, y: WATER_Y - 10, text: '풍덩!', color: '#fff', t: 0 });
  }

  damage(u, dmg, color = '#fff') {
    if (!u.alive || dmg <= 0) return;
    u.hp -= dmg; u.hurt = 0.3;
    this.floaters.push({ x: u.x, y: u.y - 60, text: '-' + dmg, color, t: 0 });
    if (u.hp <= 0) {
      u.hp = 0; u.alive = false;
      for (let i = 0; i < 14; i++) this.particles.push({ type: 'smoke', x: u.x + rnd(-8, 8), y: u.y - rnd(5, 30), vx: rnd(-40, 40), vy: rnd(-70, -10), r: rnd(6, 12), life: 0, max: rnd(0.7, 1.3), color: '255,255,255' });
    }
  }

  // ---------- 수류탄 ----------
  // 지형 표면의 바깥쪽 법선 (주변 빈 칸 방향의 합)
  terrainNormal(x, y) {
    let nx = 0, ny = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.2832, cx = Math.cos(a), cy = Math.sin(a);
      if (!this.terrain.solid(x + cx * 5, y + cy * 5)) { nx += cx; ny += cy; }
    }
    const l = Math.hypot(nx, ny);
    return l < 0.01 ? [0, -1] : [nx / l, ny / l];
  }

  // 수류탄 한 스텝: 지형에서 튕기고, 퓨즈가 끝나면 'explode', 물에 빠지면 'water'
  stepGrenade(p, dt, quiet = false) {
    p.vx += this.wind * p.w.windK * dt;
    p.vy += PROJ_G * dt;
    p.age += dt; p.fuse -= dt;
    if (p.fuse <= 0) return 'explode';
    const dx = p.vx * dt, dy = p.vy * dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
    for (let i = 0; i < n; i++) {
      const nx = p.x + dx / n, ny = p.y + dy / n;
      if (ny > WATER_Y) { p.x = nx; p.y = WATER_Y; return 'water'; }
      if (nx < 4 || nx > W - 4) { // 좌우 벽
        p.vx = -p.vx * 0.6; p.x = clamp(p.x, 4, W - 4);
        break;
      }
      if (this.terrain.solid(nx, ny)) {
        const [tx, ty] = this.terrainNormal(nx, ny);
        const vn = p.vx * tx + p.vy * ty;
        if (vn < 0) {
          const speed = Math.hypot(p.vx, p.vy);
          const px = p.vx - vn * tx, py = p.vy - vn * ty; // 접선 성분
          p.vx = px * BOUNCE_FRICTION - BOUNCE_E * vn * tx;
          p.vy = py * BOUNCE_FRICTION - BOUNCE_E * vn * ty;
          if (speed > 70 && !quiet) audio.play('land', { vol: Math.min(0.6, speed / 400), rate: 1.7 });
        }
        break;
      }
      p.x = nx; p.y = ny;
    }
    // 거의 멈추면 바닥에 정지
    if (Math.hypot(p.vx, p.vy) < 28 && this.terrain.solid(p.x, p.y + 3)) { p.vx *= 0.8; p.vy = 0; }
    return null;
  }

  // ---------- 폭발 ----------
  explode(x, y, w) {
    const r = w.radius;
    this.terrain.crater(x, y, r);
    this.emitExplosion(x, y, r);
    this.blastCrates(x, y, r);
    this.shake = Math.max(this.shake, r / 4);
    audio.play('explosion', { rate: w.id === 'rocket' ? 0.8 : 1.05, vol: 1 });
    let hit = false;
    for (const u of this.units) {
      if (!u.alive) continue;
      const cx = u.x, cy = u.y - BODY_CY;
      const d = Math.hypot(cx - x, cy - y);
      const reach = r + 12;
      if (d >= reach) continue;
      const f = 1 - d / reach;
      const dmg = Math.max(2, Math.round(w.damage * f));
      let nx = (cx - x) / (d || 1), ny = (cy - y) / (d || 1);
      this.damage(u, dmg, '#ff6b5a'); hit = true;
      if (u.alive) {
        u.grounded = false; u.y -= 2; u.fallStart = u.y;
        u.vx = nx * w.knock * f; u.vy = ny * w.knock * f - 150 * f;
      }
    }
    if (hit) audio.play('hit', { vol: 0.8 });
  }

  emitExplosion(x, y, r) {
    const P = this.particles;
    P.push({ type: 'flash', x, y, r, life: 0, max: 0.22 });
    const nf = 18 + (r / 2) | 0;
    for (let i = 0; i < nf; i++) {
      const a = rnd(0, 6.283), s = rnd(40, 240);
      P.push({ type: 'fire', x: x + Math.cos(a) * r * 0.2, y: y + Math.sin(a) * r * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: rnd(r * 0.2, r * 0.45), life: 0, max: rnd(0.35, 0.8) });
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd(0, 6.283), s = rnd(10, 90);
      P.push({ type: 'smoke', x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, r: rnd(r * 0.2, r * 0.4), life: 0, max: rnd(1.0, 1.9), color: '70,70,70' });
    }
    for (let i = 0; i < 16; i++) {
      const a = rnd(-3.0, -0.15), s = rnd(120, 320);
      P.push({ type: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(1.5, 3.5), life: 0, max: rnd(0.8, 1.4) });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life += dt;
      p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
      if (p.type === 'debris' || p.type === 'splash') p.vy += 700 * dt;
      if (p.type === 'smoke') { p.r += dt * 8; p.vx *= 0.97; p.vy -= 12 * dt; }
      if (p.type === 'fire') { p.vx *= 0.94; p.vy = p.vy * 0.94 - 20 * dt; }
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 1.2);
  }

  // ---------- 턴 ----------
  get active() { return this.activeUnit; }

  startTurn() {
    const t = this.turnTeam;
    if (this.burnFires(t)) return;
    this.turnNo++;
    if (this.turnNo % CRATE_EVERY === 0) this.dropCrate();
    const mine = this.units.filter((u) => u.team === t);
    let u = null;
    for (let k = 0; k < mine.length; k++) {
      const c = mine[(this.nextIdx[t] + k) % mine.length];
      if (c.alive) { u = c; this.nextIdx[t] = (this.nextIdx[t] + k + 1) % mine.length; break; }
    }
    this.activeUnit = u;
    this.wind = Math.floor(rnd(-this.windMax, this.windMax + 1));
    this.timer = TURN_TIME;
    this.state = 'aim';
    this.power = 0; this.charging = false;
    this.weapon = 0;
    this.angle = 45;
    this.banner = { text: t === 0 ? `내 차례 - ${u.name}` : `상대 차례 - ${u.name}`, color: TEAMS[t].color, t: 0 };
    this.lastTick = 99;
    this.ai = t === 1 ? { phase: 'think', t: 0, walks: 0, crateWalks: 0, fled: 0, target: null } : null;
  }

  // ---------- 보급 상자 ----------
  // 하늘에서 낙하산으로 내려오는 체력 상자. 물 위가 아닌 지형, 유닛과 겹치지 않는 곳에 떨어뜨린다.
  dropCrate() {
    let x = null;
    for (let k = 0; k < 40; k++) {
      const c = rnd(50, W - 50);
      if (this.terrain.surfaceY(c) > WATER_Y - 40) continue;
      if (this.units.some((u) => u.alive && Math.abs(u.x - c) < 26)) continue;
      x = c; break;
    }
    if (x === null) return;
    this.crates.push({ x, y: -30, landed: false, seed: Math.random() * 10 });
    this.floaters.push({ x, y: 70, text: '보급 상자 투하!', color: '#7dff8a', t: 0 });
  }

  crateSupported(c) {
    const t = this.terrain, y = Math.floor(c.y) + 1;
    return t.solid(c.x - 9, y) || t.solid(c.x, y) || t.solid(c.x + 9, y);
  }

  updateCrates(dt) {
    for (const c of this.crates) {
      if (c.dead) continue;
      let steps = Math.max(1, Math.ceil(CRATE_FALL * dt));
      c.landed = true;
      for (let i = 0; i < steps; i++) {
        if (this.crateSupported(c)) break;
        c.landed = false; c.y += (CRATE_FALL * dt) / steps;
        if (c.y > WATER_Y + 10) { c.dead = true; break; }
      }
      if (c.dead || !c.landed) continue;
      if (!this.crateSupported(c)) { c.landed = false; continue; }
      for (const u of this.units) {
        if (!u.alive || Math.abs(u.x - c.x) > CRATE_W / 2 + HALF_W) continue;
        if (u.y < c.y - CRATE_H || u.y - UNIT_H > c.y) continue;
        u.hp = Math.min(100, u.hp + CRATE_HEAL);
        this.floaters.push({ x: u.x, y: u.y - 60, text: '+' + CRATE_HEAL, color: '#5dff6e', t: 0 });
        for (let k = 0; k < 10; k++) this.particles.push({ type: 'spark', x: c.x + rnd(-8, 8), y: c.y - rnd(0, 20), vx: rnd(-40, 40), vy: rnd(-120, -40), r: rnd(2, 3.5), life: 0, max: rnd(0.4, 0.8), green: true });
        audio.play('win', { vol: 0.5, rate: 1.4 });
        c.dead = true; break;
      }
    }
    this.crates = this.crates.filter((c) => !c.dead);
  }

  // 폭발이 닿으면 상자 파괴
  blastCrates(x, y, r) {
    for (const c of this.crates) {
      if (Math.hypot(c.x - x, (c.y - CRATE_H / 2) - y) >= r + 14) continue;
      c.dead = true;
      for (let i = 0; i < 10; i++) this.particles.push({ type: 'debris', x: c.x, y: c.y - 10, vx: rnd(-160, 160), vy: rnd(-220, -60), r: rnd(1.5, 3), life: 0, max: rnd(0.6, 1.1) });
      this.floaters.push({ x: c.x, y: c.y - 24, text: '상자 파괴', color: '#ddd', t: 0 });
    }
    this.crates = this.crates.filter((c) => !c.dead);
  }

  // ---------- 화염 지대 ----------
  // 화염탄 폭발 지점 아래 지면에 불을 붙인다 (물 위면 불이 붙지 않음)
  igniteAt(x, y, w) {
    let fy = y;
    for (let k = 0; k < 200 && fy < WATER_Y && !this.terrain.solid(x, fy + 1); k++) fy++;
    if (fy >= WATER_Y - 6) return;
    this.fires.push({ x, y: fy - 6, r: w.fireR, turns: w.fireTurns, dmg: w.fireDmg, seed: Math.random() * 100 });
  }

  // 지면 y (원 안에서 위에서 아래로 처음 만나는 지형), 없으면 null
  fireGround(f, x) {
    const half = Math.sqrt(Math.max(0, f.r * f.r - (x - f.x) * (x - f.x)));
    for (let y = Math.floor(f.y - half); y <= f.y + half; y++) if (this.terrain.solid(x, y)) return y;
    return null;
  }

  // 팀 턴 시작 시: 화염 지대 안에 서 있는 해당 팀 유닛에게 피해, 지대 수명 1턴 감소. 승패가 나면 true
  burnFires(team) {
    if (!this.fires.length) return false;
    for (const f of this.fires) {
      for (const u of this.units) {
        if (!u.alive || u.team !== team) continue;
        if (Math.hypot(u.x - f.x, (u.y - 14) - f.y) < f.r) { this.damage(u, f.dmg, '#ff9a3a'); audio.play('hit', { vol: 0.5, rate: 1.4 }); }
      }
      f.turns--;
    }
    this.fires = this.fires.filter((f) => f.turns > 0);
    return this.checkWinner();
  }

  endTurn() {
    this.turnTeam = 1 - this.turnTeam;
    this.startTurn();
  }

  checkWinner() {
    const a = [0, 1].map((t) => this.units.some((u) => u.team === t && u.alive));
    if (a[0] && a[1]) return false;
    if (this.mode === 'endless' && a[0] && !a[1]) { // 웨이브 클리어: 잠시 후 다음 웨이브
      this.cleared = this.wave; this.state = 'wave'; this.waveT = 0;
      this.banner = { text: `웨이브 ${this.wave} 클리어!`, color: TEAMS[0].color, t: 0 };
      audio.play('win');
      this.onWave(this.cleared);
      return true;
    }
    this.winner = a[0] ? 0 : a[1] ? 1 : -1;
    this.state = 'over';
    audio.play(this.winner === 0 ? 'win' : 'lose');
    this.onOver(this.winner);
    return true;
  }

  get isPlayerTurn() { return this.state === 'aim' && this.turnTeam === 0; }

  // ---------- 플레이어 조작 ----------
  setWeapon(i) {
    if (!this.isPlayerTurn || this.charging || this.weapon === i) return;
    const w = WEAPONS[i], u = this.activeUnit;
    if (!w) return;
    if (w.disabled || this.ammo[0][i] <= 0) {
      this.floaters.push({ x: u.x, y: u.y - 70, text: w.disabled ? '곧 출시' : '탄약 없음', color: '#ffe27a', t: 0 });
      return;
    }
    this.weapon = i; audio.play('switch', { vol: 0.7 });
  }
  // 캔버스 좌표가 하단 무기 슬롯 위인지 (없으면 -1)
  slotAt(px, py) {
    for (let i = 0; i < WEAPONS.length; i++) {
      const [x, y, w, h] = slotRect(i);
      if (px >= x && px < x + w && py >= y && py < y + h) return i;
    }
    return -1;
  }
  aimBy(d) { this.angle = clamp(this.angle + d, 2, 88); }
  aimTo(px, py) {
    if (!this.isPlayerTurn || this.charging) return;
    const u = this.activeUnit;
    const dx = px - u.x, dy = u.y - 20 - py;
    if (Math.abs(dx) > 4) u.facing = dx > 0 ? 1 : -1;
    this.angle = clamp((Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI, 2, 88);
  }
  playerJump() {
    if (!this.isPlayerTurn || this.charging) return;
    const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    this.jump(this.activeUnit, dir);
  }
  beginCharge() {
    if (!this.isPlayerTurn || this.charging || !this.activeUnit.grounded) return;
    this.charging = true; this.power = 0;
  }
  releaseCharge() {
    if (!this.charging) return;
    this.charging = false;
    if (this.state === 'aim') this.fire(Math.max(8, this.power));
  }

  fire(power) {
    const u = this.activeUnit, w = WEAPONS[this.weapon];
    if (w.instant) return this.fireLightning(u, w);
    const a = rad(this.angle), v = launchSpeed(w, power), f = u.facing;
    this.proj = {
      x: u.x + f * Math.cos(a) * 18, y: u.y - 20 - Math.sin(a) * 18,
      vx: f * Math.cos(a) * v, vy: -Math.sin(a) * v, w, owner: u, age: 0,
    };
    if (w.fuse) { this.proj.fuse = w.fuse; this.proj.tickN = Math.ceil(w.fuse); }
    this.lastPower = power; this.power = power;
    if (this.ammo[this.turnTeam][this.weapon] !== Infinity) this.ammo[this.turnTeam][this.weapon]--;
    this.state = 'flying';
    u.squash = -0.2; u.shootT = 0.4;
    audio.play('fire', { rate: w.id === 'rocket' ? 0.8 : w.id === 'grenade' ? 1.3 : w.id === 'fire' ? 0.6 : 1 });
  }

  // ---------- 번개 ----------
  // 활성 유닛에서 각도 방향으로 곧게 뻗는 번개. 처음 맞은 유닛 하나에게만 피해를 준다 (지형은 관통).
  // 번개 궤적 계산: 지형은 관통하고 처음 닿는 유닛(발사자 제외)에서 멈춘다
  traceBolt(u, angle, f) {
    const a = rad(angle);
    const dx = f * Math.cos(a), dy = -Math.sin(a);
    const ox = u.x + dx * 18, oy = u.y - 20 + dy * 18;
    let len = 1300, target = null;
    for (let s = 0; s < 1300; s += 3) {
      const x = ox + dx * s, y = oy + dy * s;
      if (x < -10 || x > W + 10 || y < -10 || y > H) { len = s; break; }
      for (const o of this.units) {
        if (!o.alive || o === u) continue;
        const vy = Math.max(0, Math.abs(y - (o.y - BODY_CY)) - BODY_HALF);
        if (Math.hypot(o.x - x, vy) < BODY_R + 2) { target = o; break; }
      }
      if (target) { len = s; break; }
    }
    return { dx, dy, ox, oy, len, target };
  }

  fireLightning(u, w) {
    const { dx, dy, ox, oy, len, target } = this.traceBolt(u, this.angle, u.facing);
    if (this.ammo[this.turnTeam][this.weapon] !== Infinity) this.ammo[this.turnTeam][this.weapon]--;
    const ex = ox + dx * len, ey = oy + dy * len;
    this.bolt = { x1: ox, y1: oy, x2: ex, y2: ey, t: 0, seed: Math.random() * 1000 };
    this.flashT = 0.14;
    this.shake = Math.max(this.shake, 4);
    audio.play('explosion', { rate: 1.9, vol: 0.55 });
    audio.play('fire', { rate: 1.8, vol: 0.6 });
    u.squash = -0.2; u.shootT = 0.4;
    for (let i = 0; i < 8; i++) this.particles.push({ type: 'spark', x: ox, y: oy, vx: rnd(-90, 90), vy: rnd(-90, 90), r: rnd(1.5, 3), life: 0, max: rnd(0.2, 0.4) });
    if (target) {
      this.damage(target, w.damage, '#9fd0ff');
      this.particles.push({ type: 'flash', x: ex, y: ey, r: 34, life: 0, max: 0.25 });
      for (let i = 0; i < 16; i++) this.particles.push({ type: 'spark', x: ex, y: ey, vx: rnd(-220, 220), vy: rnd(-220, 160), r: rnd(1.5, 3.5), life: 0, max: rnd(0.25, 0.55) });
      audio.play('hit', { vol: 0.8 });
      if (target.alive) {
        target.grounded = false; target.y -= 2; target.fallStart = target.y;
        target.vx = dx * w.knock; target.vy = dy * w.knock - 120;
      }
    }
    this.state = 'settle'; this.settleT = 0; this.settleTotal = 0;
  }

  // ---------- AI ----------
  simulate(u, weapon, angle, power, facing) {
    const w = WEAPONS[weapon], a = rad(angle), v = launchSpeed(w, power);
    const p = { x: u.x + facing * Math.cos(a) * 18, y: u.y - 20 - Math.sin(a) * 18, vx: facing * Math.cos(a) * v, vy: -Math.sin(a) * v, w, owner: u, age: 0 };
    for (let i = 0; i < 1500; i++) {
      const r = stepProj(p, 1 / 60, this.wind, this.terrain, null);
      if (r) return { x: p.x, y: p.y, kind: r };
    }
    return { x: p.x, y: p.y, kind: 'out' };
  }

  simulateGrenade(u, angle, power, facing) {
    const w = WEAPONS[2], a = rad(angle), v = launchSpeed(w, power);
    const p = { x: u.x + facing * Math.cos(a) * 18, y: u.y - 20 - Math.sin(a) * 18, vx: facing * Math.cos(a) * v, vy: -Math.sin(a) * v, w, owner: u, age: 0, fuse: w.fuse };
    for (let i = 0; i < 420; i++) {
      const r = this.stepGrenade(p, 1 / 60, true);
      if (r) return { x: p.x, y: p.y, kind: r };
    }
    return { x: p.x, y: p.y, kind: 'out' };
  }

  // AI 오차 계수 (스테이지/웨이브 단계가 있으면 단계별, 없으면 난이도별)
  aiErr() {
    if (this.level != null) return levelErr(this.level);
    const d = DIFF[this.difficulty] || DIFF.normal;
    return { a: d.a, p: d.p, pick: this.difficulty === 'easy' };
  }

  // 목표점 pt({x,y}=몸통 중심)에 무기 weapon(0 대포,1 로켓,2 수류탄,4 화염탄)을 가장 가깝게 떨어뜨리는 (각도, 파워) 탐색
  aiPlan(weapon, pt) {
    const u = this.activeUnit;
    const facing = pt.x >= u.x ? 1 : -1;
    const grenade = weapon === 2, step = grenade ? 5 : 2.5;
    const friends = this.units.filter((o) => o.alive && o.team === 1);
    const rad2 = WEAPONS[weapon].radius * 1.1;
    let best = null;
    const cands = [];
    for (let angle = 12; angle <= 85; angle += step) {
      for (let power = 15; power <= 100; power += step) {
        const r = grenade ? this.simulateGrenade(u, angle, power, facing) : this.simulate(u, weapon, angle, power, facing);
        let score = r.kind === 'water' || r.kind === 'out' ? 9999 : Math.hypot(r.x - pt.x, r.y - pt.y);
        for (const o of friends) if (Math.hypot(r.x - o.x, r.y - (o.y - BODY_CY)) < rad2) score += 150;
        cands.push({ angle, power, score });
        if (!best || score < best.score) best = { angle, power, score };
      }
    }
    cands.sort((a, b) => a.score - b.score);
    const e = this.aiErr(), min = best.score;
    if (e.pick) best = cands[Math.floor(Math.random() * 6)];
    return {
      facing, weapon, dist: best.score, min,
      angle: clamp(best.angle + gauss() * 2 * e.a, 5, 88),
      power: clamp(best.power + gauss() * 2 * e.p, 10, 100),
    };
  }

  // 목표가 지형 뒤(시선이 지형에 막힘)이거나 구덩이(양쪽 지면이 25px 이상 높음)에 있는지
  aiHidden(u, e) {
    const x1 = u.x, y1 = u.y - BODY_CY, x2 = e.x, y2 = e.y - BODY_CY, len = Math.hypot(x2 - x1, y2 - y1);
    for (let s = 14; s < len - 14; s += 4) {
      if (this.terrain.solid(x1 + ((x2 - x1) * s) / len, y1 + ((y2 - y1) * s) / len)) return true;
    }
    const g = this.terrain.surfaceY(e.x);
    return this.terrain.surfaceY(e.x - 45) < g - 25 && this.terrain.surfaceY(e.x + 45) < g - 25;
  }

  // 번개: 목표를 향한 직선(지형 관통)에서 처음 맞는 유닛이 적일 때만 후보. 아군이 먼저 맞으면 제외
  aiBoltOptions(u, enemies) {
    const out = [];
    for (const e of enemies) {
      const f = e.x >= u.x ? 1 : -1;
      let ang = 45;
      for (let k = 0; k < 3; k++) { // 발사 원점이 각도에 따라 달라지므로 몇 번 보정
        const ox = u.x + f * Math.cos(rad(ang)) * 18, oy = u.y - 20 - Math.sin(rad(ang)) * 18;
        ang = (Math.atan2(oy - (e.y - BODY_CY), Math.abs(e.x - ox)) * 180) / Math.PI;
      }
      if (ang < 5 || ang > 88) continue;
      const tr = this.traceBolt(u, ang, f);
      if (tr.target && tr.target.team === 0) out.push({ target: tr.target, angle: ang, facing: f });
    }
    return out;
  }

  // 이번 사격의 무기·목표·각도·파워 결정
  // 번개(직선 사선 확보) > 화염탄(적 2명 이상이 60px 이내) > 수류탄(구덩이/지형 뒤 목표) > 대포/로켓
  aiDecide() {
    const u = this.activeUnit, ai = this.ai, am = this.ammo[1];
    const enemies = this.units.filter((o) => o.alive && o.team === 0);
    const pt = (e) => ({ x: e.x, y: e.y - BODY_CY });
    const hidden = enemies.filter((e) => this.aiHidden(u, e));
    if (am[3] > 0) {
      const opts = this.aiBoltOptions(u, enemies).sort((p, q) => p.target.hp - q.target.hp);
      const o = opts[0];
      if (o && (hidden.includes(o.target) || o.target.hp <= WEAPONS[3].damage || Math.random() < 0.6)) {
        const e = this.aiErr();
        return { weapon: 3, facing: o.facing, dist: 0, min: 0, target: o.target, angle: clamp(o.angle + gauss() * 2 * e.a * 0.5, 5, 88), power: 0 };
      }
    }
    if (am[4] > 0) {
      let pair = null;
      for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
        const d = Math.hypot(enemies[i].x - enemies[j].x, enemies[i].y - enemies[j].y);
        if (d <= 60 && (!pair || d < pair.d)) pair = { d, a: enemies[i], b: enemies[j] };
      }
      if (pair) {
        const plan = this.aiPlan(4, { x: (pair.a.x + pair.b.x) / 2, y: (pair.a.y + pair.b.y) / 2 - BODY_CY });
        if (plan.min <= 40) return { ...plan, target: pair.a };
      }
    }
    if (am[2] > 0 && hidden.length) {
      for (const e of hidden.sort((p, q) => Math.abs(p.x - u.x) - Math.abs(q.x - u.x))) {
        const plan = this.aiPlan(2, pt(e));
        if (plan.min <= 45) return { ...plan, target: e };
      }
    }
    if (!ai.target || !ai.target.alive) ai.target = enemies[Math.floor(Math.random() * enemies.length)];
    if (ai.weapon === undefined) ai.weapon = Math.random() < 0.35 ? 1 : 0;
    return { ...this.aiPlan(ai.weapon, pt(ai.target)), target: ai.target };
  }

  // 한 걸음 앞(10px)에 디딜 땅이 있는지 / 새 화염 지대로 걸어 들어가지 않는지
  aiSafeAhead(u, dir) {
    const x = clamp(u.x + dir * 10, 12, W - 12);
    for (let y = u.y - 12; y < u.y + 34; y++) {
      if (this.terrain.solid(x, y) && y < WATER_Y - 14) return !this.aiFireAt(x, u.y, 0) || this.aiFireAt(u.x, u.y, 0);
    }
    return false;
  }

  // (x, y)에 선 유닛이 화염 지대 안인지 (margin: 경계 여유)
  aiFireAt(x, y, margin = 0) {
    return this.fires.some((f) => Math.hypot(x - f.x, (y - 14) - f.y) < f.r + margin);
  }

  // 근처(약 150px)의 착지한 보급 상자 중 가장 가까운 것
  aiNearCrate(u) {
    let best = null;
    for (const c of this.crates) {
      if (c.dead || !c.landed) continue;
      const d = Math.hypot(c.x - u.x, (c.y - 10) - (u.y - 20));
      if (d <= 150 && (!best || d < best.d)) best = { c, d };
    }
    return best && best.c;
  }

  aiUpdate(dt) {
    const a = this.ai, u = this.activeUnit;
    a.t += dt;
    if (a.phase === 'think') {
      if (a.t < 0.9) return;
      // 1) 화염 지대 안이면 밖으로 이동 (다음 턴 시작 때 또 화상을 입지 않도록)
      if (a.fled < 2 && this.aiFireAt(u.x, u.y)) {
        const f = this.fires.find((q) => Math.hypot(u.x - q.x, (u.y - 14) - q.y) < q.r);
        const first = u.x >= f.x ? 1 : -1;
        const dir = this.aiSafeAhead(u, first) ? first : this.aiSafeAhead(u, -first) ? -first : 0;
        a.fled++;
        if (dir) { a.phase = 'walk'; a.t = 0; a.goal = 'fire'; a.dir = dir; a.dur = 3; return; }
      }
      // 2) 체력 70 미만이고 150px 안에 보급 상자가 있으면 상자 쪽으로 이동
      const crate = u.hp < 70 && a.crateWalks < 3 ? this.aiNearCrate(u) : null;
      if (crate && Math.abs(crate.x - u.x) > 8) {
        const dir = crate.x >= u.x ? 1 : -1;
        if (this.aiSafeAhead(u, dir)) {
          a.phase = 'walk'; a.t = 0; a.goal = 'crate'; a.crate = crate; a.dir = dir; a.crateWalks++;
          a.dur = Math.min(3.5, (Math.abs(crate.x - u.x) + 10) / 70 + 0.3);
          return;
        }
      }
      // 3) 사격 계획 (무기 선택 포함). 대포/로켓 계획이 빗나가면 목표 쪽으로 걸어가 다시 계산
      const plan = this.aiDecide();
      a.target = plan.target;
      if (plan.weapon <= 1 && plan.dist > 110 && a.walks < 2 && this.aiSafeAhead(u, a.target.x >= u.x ? 1 : -1)) {
        a.phase = 'walk'; a.t = 0; a.goal = null; a.walks++; a.dur = rnd(0.5, 1.0); a.dir = a.target.x >= u.x ? 1 : -1;
      } else {
        a.plan = plan; a.phase = 'aim'; a.t = 0; a.from = this.angle;
        u.facing = plan.facing; this.weapon = plan.weapon;
      }
    } else if (a.phase === 'walk') {
      const arrived = a.goal === 'crate' && (a.crate.dead || Math.abs(a.crate.x - u.x) < 8);
      const clear = a.goal === 'fire' && !this.aiFireAt(u.x, u.y, 6);
      if (a.t < a.dur && !arrived && !clear && this.aiSafeAhead(u, a.dir)) this.walk(u, a.dir, dt);
      else { u.moving = false; a.phase = 'think'; a.t = 0.5; }
    } else if (a.phase === 'aim') {
      const k = Math.min(1, a.t / 0.7);
      this.angle = a.from + (a.plan.angle - a.from) * k;
      if (k >= 1) {
        if (WEAPONS[a.plan.weapon].instant) { this.fire(0); this.ai = null; } // 번개는 파워 충전 없이 즉시 발사
        else { a.phase = 'charge'; a.t = 0; this.charging = true; this.power = 0; }
      }
    } else if (a.phase === 'charge') {
      this.power = Math.min(100, this.power + 100 * dt / 1.6);
      if (this.power >= a.plan.power) { this.charging = false; this.fire(a.plan.power); this.ai = null; }
    }
  }

  // ---------- 업데이트 ----------
  update(dt) {
    this.time += dt;
    if (this.state === 'idle') return;
    this.updateParticles(dt);
    if (this.bolt) { this.bolt.t += dt; if (this.bolt.t > 0.3) this.bolt = null; }
    this.flashT = Math.max(0, this.flashT - dt);
    this.updateCrates(dt);
    for (const f of this.fires) {
      if (Math.random() < dt * 24) {
        const x = f.x + rnd(-f.r, f.r), gy = this.fireGround(f, x);
        if (gy !== null) this.particles.push({ type: 'fire', x, y: gy - 2, vx: rnd(-10, 10), vy: rnd(-90, -40), r: rnd(2, 4), life: 0, max: rnd(0.4, 0.8) });
      }
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.8) this.banner = null; }

    for (const u of this.units) if (u.alive) { u.moving = false; }
    const hu = this.activeUnit;
    if (this.state === 'aim') {
      this.timer -= dt;
      const sec = Math.ceil(this.timer);
      if (sec <= 5 && sec > 0 && sec !== this.lastTick) { this.lastTick = sec; audio.play('tick', { vol: 0.6 }); }
      if (this.turnTeam === 0) {
        if (this.charging) {
          this.power = Math.min(100, this.power + 100 * dt / 1.6);
        } else if (hu.grounded) {
          const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
          if (dir) this.walk(hu, dir, dt);
        } else if (this.keys.left !== this.keys.right) {
          hu.facing = this.keys.right ? 1 : -1;
        }
        const ad = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
        if (ad && !this.charging) this.aimBy(ad * 45 * dt);
      } else if (this.ai) {
        this.aiUpdate(dt);
      }
      if (this.timer <= 0 && this.state === 'aim') {
        this.charging = false; this.timer = 0;
        this.floaters.push({ x: hu.x, y: hu.y - 70, text: '시간 초과', color: '#fff', t: 0 });
        this.state = 'settle'; this.settleT = 0; this.settleTotal = 0;
      }
    } else if (this.state === 'flying') {
      const p = this.proj;
      const grenade = p.w.id === 'grenade';
      let r = null;
      if (grenade) { // 고정 1/60초 스텝: 프레임 속도와 무관하게 AI 시뮬레이션과 같은 궤적
        p.acc = (p.acc || 0) + dt;
        while (p.acc >= 1 / 60 && !r) { p.acc -= 1 / 60; r = this.stepGrenade(p, 1 / 60); }
      } else r = stepProj(p, dt, this.wind, this.terrain, this.units);
      if (grenade) {
        const sec = Math.ceil(p.fuse);
        if (sec < p.tickN && sec > 0) { p.tickN = sec; audio.play('tick', { vol: 0.7 }); }
        this.particles.push({ type: 'fire', x: p.x + 2, y: p.y - 6, vx: rnd(-15, 15), vy: rnd(-40, -15), r: rnd(1.5, 2.5), life: 0, max: 0.25 });
      } else if (p.w.id === 'fire') {
        this.particles.push({ type: 'fire', x: p.x, y: p.y, vx: rnd(-25, 25), vy: rnd(-25, 25), r: rnd(3, 6), life: 0, max: 0.4 });
      } else if (p.w.id === 'rocket') {
        this.particles.push({ type: 'fire', x: p.x, y: p.y, vx: rnd(-20, 20), vy: rnd(-20, 20), r: rnd(3, 5), life: 0, max: 0.3 });
        this.particles.push({ type: 'smoke', x: p.x, y: p.y, vx: rnd(-10, 10), vy: rnd(-10, 10), r: rnd(3, 5), life: 0, max: 0.8, color: '120,120,120' });
      } else {
        this.particles.push({ type: 'smoke', x: p.x, y: p.y, vx: 0, vy: 0, r: 2, life: 0, max: 0.35, color: '230,230,230' });
      }
      if (r) {
        this.proj = null;
        if (r === 'terrain' || r === 'unit' || r === 'explode') {
          this.explode(p.x, p.y, p.w);
          if (p.w.fireR) this.igniteAt(p.x, p.y, p.w);
        }
        else if (r === 'water') {
          for (let i = 0; i < 14; i++) this.particles.push({ type: 'splash', x: p.x, y: WATER_Y, vx: rnd(-70, 70), vy: rnd(-250, -90), r: rnd(2, 4), life: 0, max: rnd(0.5, 0.9) });
          audio.play('land', { rate: 1.6, vol: 0.7 });
        }
        this.state = 'settle'; this.settleT = 0; this.settleTotal = 0;
      }
    } else if (this.state === 'settle') {
      this.settleTotal += dt;
    } else if (this.state === 'wave') {
      this.waveT += dt;
    }

    for (const u of this.units) {
      if (u.alive) this.updateUnit(u, dt);
      else if (!u.drowned) this.updateCorpse(u, dt);
    }

    if (this.state === 'wave' && this.waveT > 2.4) this.startWave(this.wave + 1);

    if (this.state === 'settle') {
      const calm = this.units.every((u) => !u.alive || u.grounded);
      this.settleT = calm ? this.settleT + dt : 0;
      if (this.settleT > 0.9 && this.settleTotal > 1.3) {
        if (!this.checkWinner()) this.endTurn();
      }
    }
  }

  // ---------- 렌더링 ----------
  text(g, str, x, y, size, color = '#fff', align = 'center', weight = '700') {
    g.font = `${weight} ${size}px "Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
    g.textAlign = align; g.textBaseline = 'middle';
    g.lineWidth = Math.max(2, size / 5); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineJoin = 'round';
    g.strokeText(str, x, y); g.fillStyle = color; g.fillText(str, x, y);
  }

  draw(g) {
    if (!this.bg) { g.fillStyle = '#6bb9ee'; g.fillRect(0, 0, W, H); return; }
    g.save();
    if (this.shake > 0.3) g.translate(rnd(-this.shake, this.shake), rnd(-this.shake, this.shake));
    g.drawImage(this.bg, 0, 0);
    g.drawImage(this.terrain.canvas, 0, 0);
    for (const c of this.crates) this.drawCrate(g, c);
    for (const u of this.units) if (u.alive || (!u.drowned && u.deadT < FADE_END)) this.drawUnit(g, u);
    this.drawFires(g);
    this.drawWater(g);
    const showAim = this.state === 'aim' && (this.turnTeam === 0 || (this.ai && (this.ai.phase === 'aim' || this.ai.phase === 'charge')));
    if (showAim) this.drawAim(g);
    if (this.proj) this.drawProj(g, this.proj);
    this.drawBolt(g);
    this.drawParticles(g);
    this.drawTags(g);
    for (const f of this.floaters) {
      g.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      this.text(g, f.text, f.x, f.y - f.t * 30, 18, f.color);
      g.globalAlpha = 1;
    }
    g.restore();
    if (this.flashT > 0) { g.fillStyle = `rgba(220,235,255,${Math.min(0.55, this.flashT * 4)})`; g.fillRect(0, 0, W, H); }
    this.drawHUD(g);
  }

  // 번개 줄기: 지그재그 파란 글로우 + 흰 심지, 약 0.3초
  drawBolt(g) {
    const b = this.bolt; if (!b) return;
    const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), ux = (b.x2 - b.x1) / len, uy = (b.y2 - b.y1) / len;
    const n = Math.max(2, Math.round(len / 16)), amp = 9;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, off = i === 0 || i === n ? 0 : rnd(-amp, amp);
      pts.push([b.x1 + (b.x2 - b.x1) * k - uy * off, b.y1 + (b.y2 - b.y1) * k + ux * off]);
    }
    const fade = Math.max(0, 1 - b.t / 0.3);
    g.save();
    g.globalAlpha = fade; g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    g.shadowColor = '#4aa8ff'; g.shadowBlur = 18;
    g.strokeStyle = 'rgba(70,150,255,0.8)'; g.lineWidth = 9; path();
    g.shadowBlur = 8; g.strokeStyle = '#bfe0ff'; g.lineWidth = 4; path();
    g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 1.8; path();
    g.restore();
  }

  // 보급 상자: 나무 상자 + 녹색 십자, 낙하 중에는 낙하산
  drawCrate(g, c) {
    const x = c.x, y = c.y, w = CRATE_W, h = CRATE_H;
    g.save();
    if (!c.landed) {
      const sway = Math.sin(this.time * 3 + c.seed) * 3, cx = x + sway, cy = y - h - 34, r = 24;
      g.strokeStyle = 'rgba(40,40,40,0.8)'; g.lineWidth = 1;
      g.beginPath();
      for (const dx of [-r, -r / 3, r / 3, r]) { g.moveTo(cx + dx, cy); g.lineTo(x + Math.sign(dx) * 8, y - h); }
      g.stroke();
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#e84a3a';
        g.beginPath(); g.moveTo(cx, cy);
        g.arc(cx, cy, r, Math.PI + (i * Math.PI) / 4, Math.PI + ((i + 1) * Math.PI) / 4); g.closePath(); g.fill();
      }
      g.strokeStyle = '#5a1f18'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.closePath(); g.stroke();
    }
    g.fillStyle = '#c98a3c'; g.strokeStyle = '#6b4310'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, 3); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(107,67,16,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - w / 2, y - h / 2); g.lineTo(x + w / 2, y - h / 2); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x - 7, y - h + 3, 14, h - 6, 2); g.fill();
    g.fillStyle = '#2fbf4a'; g.fillRect(x - 5, y - h / 2 - 1.5, 10, 3); g.fillRect(x - 1.5, y - h / 2 - 5, 3, 10);
    g.restore();
  }

  // 화염 지대: 지면을 따라 깜빡이는 불꽃 + 붉은 바닥 광원 + 남은 턴
  drawFires(g) {
    const t = this.time;
    for (const f of this.fires) {
      g.save();
      const glow = g.createRadialGradient(f.x, f.y + 4, 4, f.x, f.y + 4, f.r);
      glow.addColorStop(0, 'rgba(255,120,30,0.30)'); glow.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(f.x, f.y + 4, f.r, 0, 7); g.fill();
      for (let x = f.x - f.r + 3; x < f.x + f.r; x += 5) {
        const gy = this.fireGround(f, Math.round(x));
        if (gy === null) continue;
        const edge = 1 - 0.5 * Math.abs(x - f.x) / f.r;
        const fl = Math.abs(Math.sin(t * 9 + x * 0.55 + f.seed)) * 0.6 + Math.abs(Math.sin(t * 5.3 + x * 1.3)) * 0.4;
        const h = (9 + 17 * fl) * edge, w = 5.5;
        g.fillStyle = 'rgba(255,90,20,0.9)';
        g.beginPath(); g.moveTo(x - w, gy + 1); g.quadraticCurveTo(x - w * 0.6, gy - h * 0.5, x + Math.sin(t * 12 + x) * 2, gy - h); g.quadraticCurveTo(x + w * 0.6, gy - h * 0.5, x + w, gy + 1); g.fill();
        g.fillStyle = 'rgba(255,215,70,0.95)';
        g.beginPath(); g.moveTo(x - w * 0.5, gy + 1); g.quadraticCurveTo(x - w * 0.3, gy - h * 0.3, x, gy - h * 0.6); g.quadraticCurveTo(x + w * 0.3, gy - h * 0.3, x + w * 0.5, gy + 1); g.fill();
      }
      g.restore();
      this.text(g, `${f.turns}턴`, f.x, f.y - 32, 11, '#ffd27a');
    }
  }

  drawWater(g) {
    const t = this.time;
    g.fillStyle = 'rgba(40,120,200,0.72)';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, WATER_Y + Math.sin(x / 40 + t * 2) * 3);
    g.lineTo(W, H); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = WATER_Y + Math.sin(x / 40 + t * 2) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }

  poseOf(u) {
    if (!u.alive) return 'down';
    if (u.hurt > 0) return 'hit';
    if (!u.grounded) return u.vy < 0 ? 'jump' : 'fall';
    if (u.moving) return 'walk' + (Math.floor(u.walkDist / STEP_LEN) % WALK_FRAMES);
    if (u.shootT > 0) return 'attack0';
    if (u === this.activeUnit && this.charging) return 'hold';
    return 'idle';
  }

  drawUnit(g, u) {
    const set = this.sprites[u.sprite];
    const img = set[this.poseOf(u)] || set.idle;
    const h = SPRITE_H, w = h * (img.naturalWidth / img.naturalHeight);
    let sx = 1, sy = 1;
    if (u.alive && u.grounded && !u.moving) { sx = 1 + u.squash * 0.5; sy = 1 - u.squash * 0.5; }
    g.save();
    if (!u.alive) g.globalAlpha = clamp(1 - (u.deadT - FADE_START) / (FADE_END - FADE_START), 0, 1);
    g.translate(u.x, u.y + 1); // 발(이미지 하단)이 지형 위 u.y
    g.scale(sx * (u.facing < 0 ? -1 : 1), sy);
    if (u.tint) g.filter = u.tint;
    g.drawImage(img, -w / 2, -h, w, h);
    g.restore();
    if (u.hurt > 0 && u.alive) {
      g.save(); g.globalAlpha = u.hurt / 0.3 * 0.5; g.fillStyle = '#fff';
      g.beginPath(); g.arc(u.x, u.y - 24, 20, 0, 7); g.fill(); g.restore();
    }
  }

  // 이름표 + HP 바를 한 블록으로 머리 위에 그린다. 이웃과 겹치면 가로로 밀어낸다.
  drawTags(g) {
    g.font = '700 10px "Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
    const tags = this.units.filter((u) => u.alive).map((u) => ({
      u, w: Math.max(46, Math.ceil(g.measureText(u.name).width) + 10), x: u.x, y: u.y - TAG_TOP,
    }));
    // 가로로 겹치는(세로 범위도 겹치는) 블록 쌍을 서로 밀어낸다
    tags.sort((p, q) => p.u.x - q.u.x);
    for (let it = 0; it < 10; it++) {
      let moved = false;
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const p = tags[i], q = tags[j];
          if (Math.abs(p.y - q.y) >= TAG_H + 2) continue;
          const need = (p.w + q.w) / 2 + 3 - (q.x - p.x);
          if (need > 0.5) { p.x -= need / 2; q.x += need / 2; moved = true; }
        }
      }
      if (!moved) break;
    }
    for (const t of tags) {
      t.x = clamp(t.x, t.w / 2 + 2, W - t.w / 2 - 2);
      this.drawTag(g, t);
    }
  }

  drawTag(g, { u, w, x, y }) {
    const col = TEAMS[u.team].color, left = x - w / 2;
    // 이름표
    g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(left, y, w, 13, 4); g.fill(); g.stroke();
    this.text(g, u.name, x, y + 7, 10);
    // HP 바 (이름표 바로 아래, 숫자는 바 안)
    const by = y + 15;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(left, by, w, 11);
    g.fillStyle = col; g.fillRect(left + 1, by + 1, (w - 2) * (u.hp / 100), 9);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(left + 1, by + 1, (w - 2) * (u.hp / 100), 3);
    this.text(g, String(u.hp), x, by + 6, 9);
    // 머리와 어긋났을 때 연결선
    if (Math.abs(x - u.x) > 6) {
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y + TAG_H); g.lineTo(u.x, u.y - 54); g.stroke();
    }
    if (u === this.activeUnit && (this.state === 'aim' || this.state === 'flying')) {
      const ay = y - 10 + Math.sin(this.time * 6) * 3;
      g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 7, ay - 8); g.lineTo(x + 7, ay - 8); g.lineTo(x, ay + 2); g.closePath(); g.fill(); g.stroke();
    }
  }

  drawAim(g) {
    const u = this.activeUnit; if (!u) return;
    const a = rad(this.angle), f = u.facing, ox = u.x, oy = u.y - 20;
    const dx = f * Math.cos(a), dy = -Math.sin(a);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.setLineDash([4, 5]);
    const reach = WEAPONS[this.weapon].instant ? 220 : 62;
    g.beginPath(); g.moveTo(ox + dx * 20, oy + dy * 20); g.lineTo(ox + dx * reach, oy + dy * reach); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#ff4d3d'; g.lineWidth = 2.5;
    const cx = ox + dx * 74, cy = oy + dy * 74;
    g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.moveTo(cx - 12, cy); g.lineTo(cx + 12, cy); g.moveTo(cx, cy - 12); g.lineTo(cx, cy + 12); g.stroke();
    if (this.charging || this.power > 0) {
      const len = 20 + this.power * 0.6;
      g.strokeStyle = `hsl(${120 - this.power * 1.2},90%,55%)`; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ox + dx * 20, oy + dy * 20); g.lineTo(ox + dx * len, oy + dy * len); g.stroke();
    }
    g.restore();
  }

  drawProj(g, p) {
    g.save();
    g.translate(p.x, p.y);
    if (p.w.id === 'rocket') {
      g.rotate(Math.atan2(p.vy, p.vx));
      g.fillStyle = '#e6e6e6'; g.fillRect(-9, -3, 14, 6);
      g.fillStyle = '#d33'; g.beginPath(); g.moveTo(5, -3); g.lineTo(11, 0); g.lineTo(5, 3); g.fill();
      g.fillStyle = '#555'; g.fillRect(-11, -4, 3, 8);
    } else if (p.w.id === 'fire') {
      const gr = g.createRadialGradient(0, 0, 1, 0, 0, 9);
      gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.5, '#ff9a2a'); gr.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
    } else if (p.w.id === 'grenade') {
      const hot = p.fuse < 1 && Math.floor(p.fuse * 8) % 2 === 0;
      g.rotate(p.age * 6);
      g.fillStyle = hot ? '#b84a2a' : '#4f7a2f'; g.strokeStyle = '#223a12'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#888'; g.fillRect(-1.5, -9, 3, 4);
      g.restore();
      // 카운트다운 숫자 (회전 없이 위에 표시)
      const cy = Math.max(16, p.y - 16);
      this.text(g, String(Math.max(1, Math.ceil(p.fuse))), p.x, cy, 18, p.fuse < 1 ? '#ff6b5a' : '#fff');
      return;
    } else {
      g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-1.5, -1.5, 1.6, 0, 7); g.fill();
    }
    g.restore();
  }

  drawParticles(g) {
    for (const p of this.particles) {
      const k = p.life / p.max;
      if (p.type === 'flash') {
        g.fillStyle = `rgba(255,250,200,${0.8 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (0.6 + k * 0.7), 0, 7); g.fill();
      } else if (p.type === 'fire') {
        const col = k < 0.3 ? '255,240,150' : k < 0.65 ? '255,150,40' : '200,50,30';
        g.fillStyle = `rgba(${col},${1 - k})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 7); g.fill();
      } else if (p.type === 'smoke') {
        g.fillStyle = `rgba(${p.color},${0.55 * (1 - k)})`;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      } else if (p.type === 'debris') {
        g.fillStyle = `rgba(110,70,35,${1 - k})`; g.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6);
      } else if (p.type === 'spark') {
        g.fillStyle = `rgba(${p.green ? (k < 0.5 ? '200,255,200' : '90,230,110') : k < 0.5 ? '255,255,255' : '140,200,255'},${1 - k})`;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.4), 0, 7); g.fill();
      } else if (p.type === 'splash') {
        g.fillStyle = `rgba(220,240,255,${1 - k})`;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      }
    }
  }

  drawWeaponIcon(g, id, x, y, s = 1) {
    g.save(); g.translate(x, y); g.scale(s, s);
    if (id === 'rocket') {
      g.rotate(-0.6);
      g.fillStyle = '#e6e6e6'; g.fillRect(-12, -4, 20, 8);
      g.fillStyle = '#d33'; g.beginPath(); g.moveTo(8, -4); g.lineTo(16, 0); g.lineTo(8, 4); g.fill();
      g.fillStyle = '#555'; g.fillRect(-15, -5, 4, 10);
    } else if (id === 'grenade') {
      g.fillStyle = '#4f7a2f'; g.strokeStyle = '#2a4418'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(0, 2, 8, 9, 0, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#2a4418'; g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.moveTo(-7, 5); g.lineTo(7, 5); g.stroke();
      g.fillStyle = '#777'; g.fillRect(-3, -9, 6, 4);
      g.strokeStyle = '#ccc'; g.lineWidth = 2; g.beginPath(); g.moveTo(3, -8); g.lineTo(9, -10); g.stroke();
      g.beginPath(); g.arc(11, -8, 2.5, 0, 7); g.stroke();
    } else if (id === 'lightning') {
      g.fillStyle = '#ffd92e'; g.strokeStyle = '#a77a00'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(3, -12); g.lineTo(-7, 2); g.lineTo(-1, 2); g.lineTo(-4, 12); g.lineTo(8, -3); g.lineTo(1, -3); g.closePath(); g.fill(); g.stroke();
    } else if (id === 'fire') {
      g.fillStyle = '#ff7a1a';
      g.beginPath(); g.moveTo(0, -13); g.bezierCurveTo(10, -3, 10, 10, 0, 11); g.bezierCurveTo(-10, 10, -9, -2, 0, -13); g.fill();
      g.fillStyle = '#ffd94a';
      g.beginPath(); g.moveTo(0, -3); g.bezierCurveTo(5, 3, 5, 9, 0, 10); g.bezierCurveTo(-5, 9, -4, 3, 0, -3); g.fill();
    } else {
      g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-3, -3, 3, 0, 7); g.fill();
    }
    g.restore();
  }

  drawWeaponBar(g) {
    g.fillStyle = 'rgba(8,20,35,0.72)'; g.fillRect(0, H - 62, W, 62);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, H - 62, W, 1);
    WEAPONS.forEach((w, i) => {
      const [x, y, sw, sh] = slotRect(i), sel = this.weapon === i;
      const ammo = this.ammo ? this.ammo[0][i] : (w.ammo ?? Infinity);
      const off = !!w.disabled, empty = !off && ammo <= 0;
      g.fillStyle = sel ? 'rgba(255,226,122,0.92)' : 'rgba(255,255,255,0.12)';
      g.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(x, y, sw, sh, 7); g.fill(); g.stroke();
      g.save();
      if (off || empty) g.globalAlpha = 0.45;
      this.drawWeaponIcon(g, w.id, x + sw / 2, y + 22, 0.95);
      this.text(g, String(i + 1), x + 9, y + 9, 10, sel ? '#222' : '#cfe3f7', 'center');
      if (!off) this.text(g, ammo === Infinity ? '∞' : '×' + ammo, x + sw - 6, y + 9, 11, empty ? '#ff9c9c' : sel ? '#222' : '#ffe27a', 'right');
      this.text(g, w.name, x + sw / 2, y + 42, 10, sel ? '#222' : '#fff');
      g.restore();
      if (off) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.roundRect(x + sw / 2 - 18, y + 14, 36, 15, 7); g.fill();
        this.text(g, 'soon', x + sw / 2, y + 22, 10, '#bbb');
      }
    });
  }

  drawHUD(g) {
    // 팀 HP
    for (let t = 0; t < 2; t++) {
      const mem = this.units.filter((u) => u.team === t), cap = mem.length * 100;
      const tot = mem.reduce((s, u) => s + u.hp, 0);
      const x = t === 0 ? 14 : W - 14 - 230, y = 12;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(x, y, 230, 40, 8); g.fill();
      this.text(g, `${TEAMS[t].name}${t === 0 ? ' (나)' : ' (AI)'}`, x + 8, y + 11, 13, '#fff', 'left');
      this.text(g, `${tot}/${cap}`, x + 222, y + 11, 13, '#fff', 'right');
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 8, y + 22, 214, 10);
      g.fillStyle = TEAMS[t].color; g.fillRect(x + 8, y + 22, 214 * tot / cap, 10);
      // 유닛별 구분선
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (let k = 1; k < mem.length; k++) g.fillRect(x + 8 + (214 * k) / mem.length, y + 22, 1, 10);
    }
    // 타이머 + 바람
    const tm = Math.max(0, Math.ceil(this.timer));
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(W / 2, 30, 24, 0, 7); g.fill();
    this.text(g, String(tm), W / 2, 31, 24, this.timer <= 5 && this.state === 'aim' ? '#ff6b5a' : '#fff');
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(W / 2 - 80, 60, 160, 26, 13); g.fill();
    this.text(g, '바람', W / 2 - 62, 73, 12, '#cfe8ff', 'left');
    const wl = Math.abs(this.wind) * 4.5, wd = Math.sign(this.wind), cx = W / 2 + 8;
    if (wd) {
      g.strokeStyle = '#ffe27a'; g.fillStyle = '#ffe27a'; g.lineWidth = 3;
      const x1 = cx - wd * wl / 2, x2 = cx + wd * wl / 2;
      g.beginPath(); g.moveTo(x1, 73); g.lineTo(x2 - wd * 4, 73); g.stroke();
      g.beginPath(); g.moveTo(x2, 73); g.lineTo(x2 - wd * 9, 67); g.lineTo(x2 - wd * 9, 79); g.fill();
    } else this.text(g, '없음', cx, 73, 12, '#ffe27a');
    this.text(g, String(Math.abs(this.wind)), W / 2 + 68, 73, 12, '#fff', 'right');
    // 무기 (하단 HUD)
    this.drawWeaponBar(g);
    // 파워 바
    if (this.turnTeam === 0 && (this.state === 'aim' || this.state === 'flying')) {
      const bx = W / 2 - 120, by = H - 34;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(bx - 4, by - 4, 248, 24, 8); g.fill();
      const gr = g.createLinearGradient(bx, 0, bx + 240, 0);
      gr.addColorStop(0, '#7be04a'); gr.addColorStop(0.6, '#ffd13a'); gr.addColorStop(1, '#ff3d2e');
      g.fillStyle = gr; g.fillRect(bx, by, 240 * this.power / 100, 16);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.strokeRect(bx, by, 240, 16);
      if (this.lastPower) { g.fillStyle = '#fff'; g.fillRect(bx + 240 * this.lastPower / 100 - 1, by - 3, 2, 22); }
      this.text(g, `각도 ${Math.round(this.angle)}°  파워 ${Math.round(this.power)}`, W / 2, by - 14, 12);
    }
    if (this.turnTeam === 1 && this.state === 'aim') this.text(g, '상대가 조준 중...', W / 2, H - 26, 14, '#fff');
    // 배너
    if (this.banner) {
      const b = this.banner, a = Math.min(1, (1.8 - b.t) * 2, b.t * 6);
      g.save(); g.globalAlpha = Math.max(0, a);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(W / 2 - 150, 112, 300, 40, 20); g.fill();
      this.text(g, b.text, W / 2, 133, 20, b.color === TEAMS[0].color ? '#9cc4ff' : '#ff9c9c');
      g.restore();
    }
    const label = this.mode === 'stage' ? `스테이지 ${this.stage}` : this.mode === 'endless' ? `무한 모드 · 웨이브 ${this.wave} (클리어 ${this.cleared})` : DIFF[this.difficulty]?.label || '';
    this.text(g, `${label} · 시드 ${this.seed}`, W - 16, 64, 10, 'rgba(255,255,255,0.85)', 'right', '400');
  }
}
