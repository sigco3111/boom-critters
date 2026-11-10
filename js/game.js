// 게임 로직: 유닛 물리, 턴 흐름, 투사체, AI
import { Terrain, W, H } from './terrain.js';
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
const FALL_T = 80;       // 낙하 데미지 임계 높이
const TURN_TIME = 30;

export const WEAPONS = [
  { id: 'cannon', name: '대포탄', radius: 40, damage: 50, windK: 8, speedK: 1.0, knock: 380 },
  { id: 'rocket', name: '로켓', radius: 58, damage: 42, windK: 3, speedK: 0.85, knock: 470 },
];
export const TEAMS = [
  { name: '파랑 팀', color: '#3b82f6' },
  { name: '빨강 팀', color: '#ef4444' },
];
// Kenney Toon Characters 1 (assets/toon/<key>/<pose>.png)
export const CHARACTERS = [
  [['maleAdventurer', '남자 모험가'], ['femaleAdventurer', '여자 모험가'], ['malePerson', '남자']],
  [['robot', '로봇'], ['zombie', '좀비'], ['femalePerson', '여자']],
];
export const WALK_FRAMES = 8;
const STEP_LEN = 6;      // 걷기 프레임 하나당 이동 거리 (px)
const SPRITE_H = 64;     // 포즈 이미지(96x128) 표시 높이 -> 캐릭터 키 약 52px
const FADE_START = 0.6, FADE_END = 1.6; // 사망 후 페이드 (초)
const DIFF = { easy: { a: 7, p: 14, label: '쉬움' }, normal: { a: 3, p: 6, label: '보통' }, hard: { a: 1, p: 2, label: '어려움' } };

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
    this.keys = { left: false, right: false, up: false, down: false };
    this.onOver = () => {};
    this.stepTimer = 0;
  }

  // ---------- 매치 ----------
  newMatch(difficulty) {
    this.difficulty = difficulty;
    this.seed = (Math.random() * 1e9) | 0;
    this.terrain = new Terrain(this.seed);
    this.bg = this.makeBackground(this.seed);
    this.units = []; this.particles = []; this.floaters = []; this.proj = null;
    const baseX = [[95, 230, 360], [600, 730, 865]];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 3; i++) {
        const x = clamp(baseX[t][i] + rnd(-25, 25), 20, W - 20);
        const sy = this.terrain.surfaceY(x);
        const [sp, nm] = CHARACTERS[t][i];
        const u = new Unit(t, i, sp, nm, x, sy - 1);
        for (let k = 0; k < 20 && this.blocked(u.x, u.y); k++) u.y--;
        u.fallStart = u.y;
        this.units.push(u);
      }
    }
    this.nextIdx = [0, 0];
    this.turnTeam = 0;
    this.winner = null;
    this.angle = 45; this.power = 0; this.lastPower = 0; this.weapon = 0;
    this.charging = false; this.ai = null;
    this.banner = null;
    this.startTurn();
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

  // ---------- 폭발 ----------
  explode(x, y, w) {
    const r = w.radius;
    this.terrain.crater(x, y, r);
    this.emitExplosion(x, y, r);
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
    const mine = this.units.filter((u) => u.team === t);
    let u = null;
    for (let k = 0; k < 3; k++) {
      const c = mine[(this.nextIdx[t] + k) % 3];
      if (c.alive) { u = c; this.nextIdx[t] = (this.nextIdx[t] + k + 1) % 3; break; }
    }
    this.activeUnit = u;
    this.wind = Math.floor(rnd(-10, 11));
    this.timer = TURN_TIME;
    this.state = 'aim';
    this.power = 0; this.charging = false;
    this.weapon = 0;
    this.angle = 45;
    this.banner = { text: t === 0 ? `내 차례 - ${u.name}` : `상대 차례 - ${u.name}`, color: TEAMS[t].color, t: 0 };
    this.lastTick = 99;
    this.ai = t === 1 ? { phase: 'think', t: 0, walks: 0, target: null } : null;
  }

  endTurn() {
    this.turnTeam = 1 - this.turnTeam;
    this.startTurn();
  }

  checkWinner() {
    const a = [0, 1].map((t) => this.units.some((u) => u.team === t && u.alive));
    if (a[0] && a[1]) return false;
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
    this.weapon = i; audio.play('switch', { vol: 0.7 });
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
    const a = rad(this.angle), v = launchSpeed(w, power), f = u.facing;
    this.proj = {
      x: u.x + f * Math.cos(a) * 18, y: u.y - 20 - Math.sin(a) * 18,
      vx: f * Math.cos(a) * v, vy: -Math.sin(a) * v, w, owner: u, age: 0,
    };
    this.lastPower = power; this.power = power;
    this.state = 'flying';
    u.squash = -0.2; u.shootT = 0.4;
    audio.play('fire', { rate: w.id === 'rocket' ? 0.8 : 1 });
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

  aiPlan() {
    const u = this.activeUnit, ai = this.ai;
    const tgt = ai.target, facing = tgt.x >= u.x ? 1 : -1;
    const weapon = ai.weapon;
    const friends = this.units.filter((o) => o.alive && o.team === 1);
    let best = null;
    const cands = [];
    for (let angle = 12; angle <= 85; angle += 2.5) {
      for (let power = 15; power <= 100; power += 2.5) {
        const r = this.simulate(u, weapon, angle, power, facing);
        let score = r.kind === 'water' || r.kind === 'out' ? 9999 : Math.hypot(r.x - tgt.x, r.y - (tgt.y - BODY_CY));
        const rad2 = WEAPONS[weapon].radius * 1.1;
        for (const o of friends) if (Math.hypot(r.x - o.x, r.y - (o.y - BODY_CY)) < rad2) score += 150;
        cands.push({ angle, power, score });
        if (!best || score < best.score) best = { angle, power, score };
      }
    }
    cands.sort((a, b) => a.score - b.score);
    const d = DIFF[this.difficulty];
    if (this.difficulty === 'easy') best = cands[Math.floor(Math.random() * 6)];
    return {
      facing, weapon, dist: best.score,
      angle: clamp(best.angle + gauss() * 2 * d.a, 5, 88),
      power: clamp(best.power + gauss() * 2 * d.p, 10, 100),
    };
  }

  aiSafeAhead(u, dir) {
    const x = clamp(u.x + dir * 10, 12, W - 12);
    for (let y = u.y - 12; y < u.y + 34; y++) if (this.terrain.solid(x, y) && y < WATER_Y - 14) return true;
    return false;
  }

  aiUpdate(dt) {
    const a = this.ai, u = this.activeUnit;
    a.t += dt;
    if (a.phase === 'think') {
      if (a.t < 0.9) return;
      if (!a.target) {
        const t = this.units.filter((o) => o.team === 0 && o.alive);
        a.target = t[Math.floor(Math.random() * t.length)];
        a.weapon = Math.random() < 0.35 ? 1 : 0;
      }
      const plan = this.aiPlan();
      if (plan.dist > 110 && a.walks < 2 && this.aiSafeAhead(u, a.target.x >= u.x ? 1 : -1)) {
        a.phase = 'walk'; a.t = 0; a.walks++; a.dur = rnd(0.5, 1.0); a.dir = a.target.x >= u.x ? 1 : -1;
      } else {
        a.plan = plan; a.phase = 'aim'; a.t = 0; a.from = this.angle;
        u.facing = plan.facing; this.weapon = plan.weapon;
      }
    } else if (a.phase === 'walk') {
      if (a.t < a.dur && this.aiSafeAhead(u, a.dir)) this.walk(u, a.dir, dt);
      else { u.moving = false; a.phase = 'think'; a.t = 0.5; }
    } else if (a.phase === 'aim') {
      const k = Math.min(1, a.t / 0.7);
      this.angle = a.from + (a.plan.angle - a.from) * k;
      if (k >= 1) { a.phase = 'charge'; a.t = 0; this.charging = true; this.power = 0; }
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
      const r = stepProj(p, dt, this.wind, this.terrain, this.units);
      if (p.w.id === 'rocket') {
        this.particles.push({ type: 'fire', x: p.x, y: p.y, vx: rnd(-20, 20), vy: rnd(-20, 20), r: rnd(3, 5), life: 0, max: 0.3 });
        this.particles.push({ type: 'smoke', x: p.x, y: p.y, vx: rnd(-10, 10), vy: rnd(-10, 10), r: rnd(3, 5), life: 0, max: 0.8, color: '120,120,120' });
      } else {
        this.particles.push({ type: 'smoke', x: p.x, y: p.y, vx: 0, vy: 0, r: 2, life: 0, max: 0.35, color: '230,230,230' });
      }
      if (r) {
        this.proj = null;
        if (r === 'terrain' || r === 'unit') this.explode(p.x, p.y, p.w);
        else if (r === 'water') {
          for (let i = 0; i < 14; i++) this.particles.push({ type: 'splash', x: p.x, y: WATER_Y, vx: rnd(-70, 70), vy: rnd(-250, -90), r: rnd(2, 4), life: 0, max: rnd(0.5, 0.9) });
          audio.play('land', { rate: 1.6, vol: 0.7 });
        }
        this.state = 'settle'; this.settleT = 0; this.settleTotal = 0;
      }
    } else if (this.state === 'settle') {
      this.settleTotal += dt;
    }

    for (const u of this.units) {
      if (u.alive) this.updateUnit(u, dt);
      else if (!u.drowned) this.updateCorpse(u, dt);
    }

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
    for (const u of this.units) if (u.alive || (!u.drowned && u.deadT < FADE_END)) this.drawUnit(g, u);
    this.drawWater(g);
    const showAim = this.state === 'aim' && (this.turnTeam === 0 || (this.ai && (this.ai.phase === 'aim' || this.ai.phase === 'charge')));
    if (showAim) this.drawAim(g);
    if (this.proj) this.drawProj(g, this.proj);
    this.drawParticles(g);
    this.drawTags(g);
    for (const f of this.floaters) {
      g.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      this.text(g, f.text, f.x, f.y - f.t * 30, 18, f.color);
      g.globalAlpha = 1;
    }
    g.restore();
    this.drawHUD(g);
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
    g.beginPath(); g.moveTo(ox + dx * 20, oy + dy * 20); g.lineTo(ox + dx * 62, oy + dy * 62); g.stroke();
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
    } else {
      g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-3, -3, 3, 0, 7); g.fill();
    }
    g.restore();
  }

  drawHUD(g) {
    // 팀 HP
    for (let t = 0; t < 2; t++) {
      const tot = this.units.filter((u) => u.team === t).reduce((s, u) => s + u.hp, 0);
      const x = t === 0 ? 14 : W - 14 - 230, y = 12;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(x, y, 230, 40, 8); g.fill();
      this.text(g, `${TEAMS[t].name}${t === 0 ? ' (나)' : ' (AI)'}`, x + 8, y + 11, 13, '#fff', 'left');
      this.text(g, `${tot}/300`, x + 222, y + 11, 13, '#fff', 'right');
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 8, y + 22, 214, 10);
      g.fillStyle = TEAMS[t].color; g.fillRect(x + 8, y + 22, 214 * tot / 300, 10);
      // 유닛별 구분선
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + 8 + 214 / 3, y + 22, 1, 10); g.fillRect(x + 8 + 428 / 3, y + 22, 1, 10);
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
    // 무기
    for (let i = 0; i < 2; i++) {
      const x = 14 + i * 114, y = H - 56, sel = this.weapon === i;
      g.fillStyle = sel ? 'rgba(255,226,122,0.85)' : 'rgba(0,0,0,0.5)';
      g.beginPath(); g.roundRect(x, y, 106, 42, 8); g.fill();
      this.drawWeaponIcon(g, WEAPONS[i].id, x + 22, y + 21, 1);
      this.text(g, `[${i + 1}] ${WEAPONS[i].name}`, x + 38, y + 15, 11, sel ? '#222' : '#fff', 'left');
      this.text(g, `반경 ${WEAPONS[i].radius}`, x + 38, y + 31, 10, sel ? '#333' : '#bcd', 'left', '400');
    }
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
    this.text(g, `${DIFF[this.difficulty]?.label || ''} · 시드 ${this.seed}`, W - 16, 64, 10, 'rgba(255,255,255,0.85)', 'right', '400');
  }
}
