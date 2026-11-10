// 게임 로직: 유닛 물리, 턴 흐름, 투사체, AI
import { Terrain, W, H, mulberry32 } from './terrain.js?v=2026111044';
import * as audio from './audio.js?v=2026111044';
import { t as tr, getLang } from './i18n.js?v=2026111044';
import { THEMES, themeForStage, themeForSeed, makeBackground, drawBackgroundFx, makeWeather, stepWeather, drawWeather } from './themes.js?v=2026111044';

export { W, H };
export const WATER_Y = 496;
const UNIT_G = 900;      // 유닛 중력 (px/s^2)
const PROJ_G = 500;      // 투사체 중력
const UNIT_H = 38, HALF_W = 9;
const BODY_CY = 26;      // 몸통 중심 높이 (발 기준 위쪽, 스프라이트 키 약 52px)
const BODY_R = 15;       // 투사체 명중 판정 반경(몸통 중심 기준)
const BANNER_T = 1.3; // 턴 배너 표시 시간(초): 0.12초 페이드 인 → 유지 → 0.35초 페이드 아웃
const TAG_TOP = 84, TAG_H = 26; // 이름표+HP 블록: 발 위 84px부터 높이 26px
const BODY_HALF = 8;     // 몸통 캡슐의 세로 반길이 (중심에서 위/아래)
const BOUNCE_E = 0.55, BOUNCE_FRICTION = 0.85; // 수류탄 반발/마찰 계수
const CRATE_W = 22, CRATE_H = 20, CRATE_FALL = 85, CRATE_HEAL = 30, CRATE_EVERY = 4; // 보급 상자
const FALL_T = 80;       // 낙하 데미지 임계 높이
const TURN_TIME = 30;
const CHARGE_T = 1.6;    // 파워 0→100 충전 시간(초)
const AIR_WARN = 1.0, AIR_W = 120, AIR_N = 5, AIR_IDX = 5; // 공습: 경고 마커 1초 → 폭탄 5발이 폭 120px 구역에 순서 없이 떨어짐 (무기 슬롯 6번)
const MAX_PARTICLES = 500, MAX_FLOATERS = 24; // 파티클·떠오르는 글자 상한 (넘치면 가장 오래된 것부터 재활용=제거)
const AI_MAX_TRIES = 3;      // AI가 유효한 사격(물/화면 밖이 아닌 착탄)을 못 찾을 때 다시 계산해 보는 횟수. 넘으면 턴을 넘긴다
const AI_SLICE_MS = 4;       // AI 사격 계산을 한 프레임에 쓰는 최대 시간(ms): 나머지는 다음 프레임에 이어서 (느린 폰의 프레임 끊김 방지)
const AI_TURN_MAX = 22;      // AI 한 턴의 최대 시간(초): 이 안에 쏘지 못하면 강제로 넘김 (제한 시간 30초보다 먼저)
const SETTLE_MAX = 8;        // 발사 후 유닛이 안정되길 기다리는 최대 시간(초)
const DRAG_MIN = 14; // 터치 드래그 조준: 발사에 필요한 최소 드래그 거리 (캔버스 px)

const FONT = '"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const _grads = {};
const fireGlow = (g, r) => _grads['glow' + r] || (_grads['glow' + r] = (() => { const o = g.createRadialGradient(0, 0, 4, 0, 0, r); o.addColorStop(0, 'rgba(255,120,30,0.30)'); o.addColorStop(1, 'rgba(255,60,0,0)'); return o; })());
const fireBall = (g) => _grads.ball || (_grads.ball = (() => { const o = g.createRadialGradient(0, 0, 1, 0, 0, 9); o.addColorStop(0, '#fff3a0'); o.addColorStop(0.5, '#ff9a2a'); o.addColorStop(1, 'rgba(255,60,0,0)'); return o; })());
const powerGrad = (g, bx) => _grads['pw' + bx] || (_grads['pw' + bx] = (() => { const o = g.createLinearGradient(bx, 0, bx + 240, 0); o.addColorStop(0, '#7be04a'); o.addColorStop(0.6, '#ffd13a'); o.addColorStop(1, '#ff3d2e'); return o; })());
const _smoke = {};
const smokeStyle = (c) => _smoke[c] || (_smoke[c] = `rgb(${c})`);
const WBAR_H = 72; // 무기 바 오프스크린 높이 (큰 HUD 글씨일 때 70px)
const TOP_HUD_H = 176; // 상단 HUD 오프스크린 높이 (hs 최대 1.5배일 때 알약 아래끝 약 161px)
const TEXT_CACHE = new Map(), TEXT_CACHE_MAX = 900, WIDTH_CACHE = new Map(); // TEXT_CACHE: 글자 -> [{ size, color, weight, sc, c, ... }] (같은 글자의 크기·색 변형들)
let textCount = 0;
const DASH_AIM = [4, 5], DASH_NONE = [];
const HINT_T = 0.6, HINT_EVERY = 3; // 궤적 힌트: 길이(초)와 점 간격(프레임)
const PW_COL = Array.from({ length: 101 }, (_, i) => `hsl(${120 - i * 1.2},90%,55%)`); // 파워 0~100의 색 (프레임마다 색 문자열을 만들지 않음)
const powerColor = (p) => PW_COL[p <= 0 ? 0 : p >= 100 ? 100 : Math.round(p)];
let pwLabelN = -1, pwLabel = '', pwLabelLang = '';
const powerLabel = (p) => { const n = Math.round(p), lg = getLang(); if (n !== pwLabelN || lg !== pwLabelLang) { pwLabelN = n; pwLabelLang = lg; pwLabel = tr('hud.power', { p: n }); } return pwLabel; };
const byUnitX = (p, q) => p.u.x - q.u.x;
const HUDC = { wbar: null, top: null }; // 무기 바·상단 HUD 오프스크린 캔버스 (경기 객체와 무관하게 하나만 두고 로딩 중 미리 만든다)
const FLASH = new WeakMap(); // 피격 번쩍임용 흰 실루엣 (이미지 -> 캔버스)
let _mctx = null;
const measureCtx = () => _mctx || (_mctx = document.createElement('canvas').getContext('2d'));
// 윤곽선 글자를 오프스크린 캔버스에 한 번 구워 캐시에 넣는다. 캐시가 가득 차면 오래된 글자부터 비움
function bakeText(str, size, color, weight, sc) {
  const font = `${weight} ${size}px ${FONT}`, k = measureCtx();
  k.font = font;
  const tw = k.measureText(str).width, pad = Math.ceil(Math.max(2, size / 5)) + 2, wl = tw + pad * 2, hl = Math.ceil(size * 1.5) + pad * 2;
  const c = document.createElement('canvas'); c.width = Math.ceil(wl * sc); c.height = Math.ceil(hl * sc);
  const q = c.getContext('2d');
  q.scale(sc, sc); q.font = font; q.textAlign = 'left'; q.textBaseline = 'middle';
  q.lineWidth = Math.max(2, size / 5); q.strokeStyle = 'rgba(0,0,0,0.6)'; q.lineJoin = 'round';
  q.strokeText(str, pad, hl / 2); q.fillStyle = color; q.fillText(str, pad, hl / 2);
  const e = { size, color, weight, sc, c, tw, pad, wl: c.width / sc, hl: c.height / sc };
  if (textCount >= TEXT_CACHE_MAX) { let n = 0; for (const kk of TEXT_CACHE.keys()) { textCount -= TEXT_CACHE.get(kk).length; TEXT_CACHE.delete(kk); if (++n > TEXT_CACHE_MAX / 4) break; } }
  const list = TEXT_CACHE.get(str);
  if (list) list.push(e); else TEXT_CACHE.set(str, [e]);
  textCount++;
  return e;
}

export const WEAPONS = [
  { id: 'cannon', get name() { return tr('w.cannon'); }, radius: 40, damage: 50, windK: 8, speedK: 1.0, knock: 380 },
  { id: 'rocket', get name() { return tr('w.rocket'); }, radius: 58, damage: 42, windK: 3, speedK: 0.85, knock: 470 },
  { id: 'grenade', get name() { return tr('w.grenade'); }, radius: 55, damage: 60, windK: 1, speedK: 0.9, knock: 640, ammo: 3, fuse: 3 },
  { id: 'lightning', get name() { return tr('w.lightning'); }, damage: 35, knock: 260, ammo: 2, instant: true },
  { id: 'fire', get name() { return tr('w.fire'); }, radius: 35, damage: 25, windK: 6, speedK: 0.95, knock: 320, ammo: 2, fireR: 50, fireTurns: 3, fireDmg: 8 },
  // 공습: 목표 x를 찍으면 1초 경고 뒤 작은 폭탄 5발(폭발 반경 28, 최대 피해 18)이 폭 120px 구역에 떨어진다. 팀당 1발, 스테이지 4부터 해금(빠른 대전은 항상)
  { id: 'airstrike', get name() { return tr('w.airstrike'); }, radius: 28, damage: 18, windK: 0, knock: 240, ammo: 1, airstrike: true },
];
// 하단 HUD 무기 슬롯 (캔버스 좌표)
const SLOT = { x: 10, y: H - 56, w: 54, h: 50, gap: 3 };
// '큰 HUD 글씨'를 켜면 슬롯 높이만 키우고(글자 +25%) 폭은 거의 그대로 둔다: 가운데 파워 바(x 356~)를 가리지 않도록 6칸이 x 348 안에 끝난다
const SLOT_BIG = { x: 8, y: H - 64, w: 55, h: 58, gap: 2 };
// 팀별 무기 탄약 (무한 = Infinity, 비활성 무기는 0). 공습은 해금 전(airOk=false)이면 0
const freshAmmo = (airOk = false) => [0, 1].map(() => WEAPONS.map((w) => (w.disabled || (w.airstrike && !airOk) ? 0 : w.ammo ?? Infinity)));
export function slotRect(i, big = false) { const s = big ? SLOT_BIG : SLOT; return [s.x + i * (s.w + s.gap), s.y, s.w, s.h]; }
export const TEAMS = [
  { get name() { return tr('team.0'); }, color: '#3b82f6' },
  { get name() { return tr('team.1'); }, color: '#ef4444' },
];
// Kenney Toon Characters 1 (assets/toon/<key>/<pose>.png)
// [스프라이트 키, 이름 키(i18n 'ch.<키>'), 특성]
export const CHARACTERS = [
  [['maleAdventurer', 'maleAdventurer', 'balanced'], ['femaleAdventurer', 'femaleAdventurer', 'jump'], ['malePerson', 'malePerson', 'tough']],
  [['robot', 'robot', 'armor'], ['zombie', 'zombie', 'regen'], ['femalePerson', 'femalePerson', 'steady']],
];
// 4번째 적 유닛(스테이지 후반): 남자(malePerson) 스프라이트를 쓰고 이름표·HP 바 색을 주황으로 구분. 특성 없음(균형형)
const EXTRA_ENEMY = ['malePerson', 'malePerson2', 'balanced', '#f59e0b'];
// 캐릭터 특성 (작은 보정만): jumpK 점프 높이 배율, maxHp 최대 HP, blastK 폭발 피해 배율, speedK 이동 속도 배율, regen 팀 턴 시작 시 HP 회복, steady 조준 안정(AI 오차 감소 비율 = 파워 충전 시간 증가 비율)
export const TRAITS = {
  balanced: { get name() { return tr('tr.balanced.n'); }, get desc() { return tr('tr.balanced.d'); } },
  jump: { get name() { return tr('tr.jump.n'); }, get desc() { return tr('tr.jump.d'); }, jumpK: 1.1 },
  tough: { get name() { return tr('tr.tough.n'); }, get desc() { return tr('tr.tough.d'); }, maxHp: 110 },
  armor: { get name() { return tr('tr.armor.n'); }, get desc() { return tr('tr.armor.d'); }, blastK: 0.85, speedK: 0.8 },
  regen: { get name() { return tr('tr.regen.n'); }, get desc() { return tr('tr.regen.d'); }, regen: 5 },
  steady: { get name() { return tr('tr.steady.n'); }, get desc() { return tr('tr.steady.d'); }, steady: 0.15 },
};
const BASE_HP = 100;
export const WALK_FRAMES = 8;
const STEP_LEN = 6;      // 걷기 프레임 하나당 이동 거리 (px)
const SPRITE_H = 64;     // 포즈 이미지(96x128) 표시 높이 -> 캐릭터 키 약 52px
const FADE_START = 0.25, FADE_END = 1.0; // 사망 후 스프라이트 페이드 (초): 뽕! 연기가 가린 뒤 금방 사라진다
const HURT_T = 0.3;      // 피격 하얀 번쩍임 시간(초)
const HOP_H = 18, HOP_W = 4.6; // 승리 점프: 높이(px)와 각속도(rad/s)
// 빠른 대전 난이도: AI 각도·파워 오차(a°, p)와 적 수(enemies). 시작 화면에서 고른 값이 localStorage에 저장된다
export const DIFF = {
  easy: { a: 8, p: 16, enemies: 2, get label() { return tr('diff.easy'); } },
  normal: { a: 5.5, p: 11, enemies: 3, get label() { return tr('diff.normal'); } },
  hard: { a: 2.8, p: 5.6, enemies: 4, get label() { return tr('diff.hard'); } },
};
export function quickConfig(diff) { return { mode: 'quick', enemies: (DIFF[diff] || DIFF.normal).enemies }; }
const ENEMY_X = { 1: [760], 2: [650, 820], 3: [600, 730, 865], 4: [560, 670, 780, 885] };

// ---------- 스테이지 / 무한 모드 설정 (밸런스 숫자는 README "밸런스" 표 참고) ----------
export const STAGE_COUNT = 10;
// AI 오차 단계(level 1~10): 각도 오차(표준편차, °) 9 → 1, 파워 오차 18 → 2 로 선형 감소. level ≤ 3은 상위 6개 후보 중 무작위 선택
const ERR_A = [9, 1], ERR_P = [18, 2];
// AI가 쓸 수 있는 특수 무기(무기 번호 -> 최소 level): 수류탄 2, 번개 3, 화염탄 4, 공습 4. level이 없는 빠른 대전은 모두 사용
const AI_UNLOCK = { 2: 2, 3: 3, 4: 4, 5: 4 };
const BONUS_LEVEL = 7, BONUS_GRENADE = 1, BONUS_BOLT = 1; // 우리 팀 보너스 탄약: 적 4마리 구간(level 7+)에서 수류탄 +1, 번개 +1
// 스테이지 모드 AI 오차 [각도 오차 °, 파워 오차]: window.__sim 승률 측정으로 정한 값 (README "밸런스" 표). 보통 플레이어(3°/6 오차) 목표 승률 약 스테이지 1 95% · 3 88% · 5 70% · 7 55% · 9 40% · 10 30%.
// 지형마다 난이도가 달라 오차가 단조롭지 않다(4는 3보다, 10은 9보다 오차가 크다). 스테이지 1~3은 상위 6개 후보 중 무작위로 고르는(pick) 부정확한 조준
const STAGE_AI = [null, [17, 34], [13, 26], [9, 18], [13, 26], [4.6, 9.2], [8, 16], [5.6, 11.2], [3.2, 6.4], [3.3, 6.6], [5.2, 10.4]];
// 스테이지 s(1~10): 고정 시드, 적 수 2→4(1~3: 2마리, 4~6: 3마리, 7~10: 4마리), 바람 범위 ±(3+s), AI level = s
export function stageConfig(s) {
  return { mode: 'stage', stage: s, seed: 20240 + s * 7919, enemies: s <= 3 ? 2 : s <= 6 ? 3 : 4, windMax: 3 + s, level: s };
}
// 무한 모드 웨이브 w(1~): 적 수 2→4(1~2: 2마리, 3~4: 3마리, 5~: 4마리), 바람 ±(4+w, 최대 14), AI level = 1 + 1.5×(w-1) (최대 10, 웨이브 5 ≈ 스테이지 7)
export function waveConfig(w) {
  return { mode: 'endless', wave: w, enemies: Math.min(4, 2 + Math.floor((w - 1) / 2)), windMax: Math.min(14, 4 + w), level: Math.min(10, 1 + Math.round(1.5 * (w - 1))) };
}
// AI 오차 단계(1~10) -> 각도·파워 오차 계수 (1: 매우 쉬움 → 10: 어려움보다 정확)
export function levelErr(level) {
  const t = (clamp(level, 1, 10) - 1) / 9;
  return { a: ERR_A[0] + (ERR_A[1] - ERR_A[0]) * t, p: ERR_P[0] + (ERR_P[1] - ERR_P[0]) * t, pick: level <= 3 };
}

// 우리 팀 경기 기록: shots 발사 수, wpn 무기별 사용 횟수, dealt 적이 잃은 HP, taken 우리 팀이 잃은 HP(아군 오폭·낙하·익사·화염 포함), turns 우리 팀 턴 수
export const blankStats = () => ({ shots: 0, wpn: {}, dealt: 0, taken: 0, turns: 0 });
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
  get name() { return tr('ch.' + this.nameKey); }   // 언어를 바꾸면 이름표도 바로 바뀐다
  constructor(team, idx, sprite, name, x, y, traitKey = 'balanced') {
    this.team = team; this.idx = idx; this.sprite = sprite; this.nameKey = name;
    this.traitKey = traitKey; this.trait = TRAITS[traitKey] || TRAITS.balanced;
    this.maxHp = this.trait.maxHp || BASE_HP;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = this.maxHp; this.alive = true; this.grounded = true;
    this.facing = team === 0 ? 1 : -1;
    this.fallStart = y; this.moving = false; this.phase = Math.random() * 6;
    this.squash = 0; this.hurt = 0;
    this.walkDist = 0; this.shootT = 0; this.deadT = 0; this.drowned = false; this.cvy = 0;
    this.tagColor = TEAMS[team].color; // 이름표·HP 바 색 (기본은 팀 색)
  }
}

export class Game {
  constructor(sprites) {
    this.sprites = sprites;     // 캐릭터 키 -> { 포즈 이름 -> Image }
    this.time = 0;
    this.bg = null; this.theme = THEMES[0];
    this.weather = null;        // 잔잔한 날씨 파티클(눈·모래·꽃잎·반딧불), 헤드리스에서는 없음
    this.state = 'idle';
    this.units = []; this.particles = []; this.floaters = [];
    this.ppool = []; this.fpool = []; // 재사용할 파티클·떠오르는 글자 객체
    this.proj = null; this.shake = 0;
    this.viewScale = 1;         // 캔버스 CSS 폭 / 논리 폭 (작은 화면일수록 글자를 키우는 데 사용)
    this.bigHud = false;        // 접근성: HUD 글자 +25% (설정)
    this.teamMarks = false;     // 접근성: 파랑 원 / 빨강 마름모 팀 표시 (설정)
    this.domHud = false;        // true면 팀 HP·타이머·바람·상태를 DOM HUD(#hud)가 그림 (세로 폰)
    this.reduceMotion = false;  // prefers-reduced-motion이면 화면 흔들림 끔
    this.bolt = null; this.flashT = 0; this.fires = []; this.crates = []; this.turnNo = 0;
    this.keys = { left: false, right: false, up: false, down: false };
    this.touchUI = false;       // 터치 화면이면 캔버스 하단 무기바를 숨기고 DOM 버튼을 쓴다
    this.drag = null;           // 터치 드래그 조준 중: { sx, sy, x, y } (캔버스 좌표)
    this.onOver = () => {}; this.onWave = () => {};
    this.mode = 'quick'; this.stage = 0; this.wave = 0; this.cleared = 0; this.windMax = 10; this.level = null;
    this.airOk = false;         // 공습 해금 여부 (빠른 대전은 항상, 스테이지·웨이브는 AI level 4 이상 = 스테이지 4 / 웨이브 3부터)
    this.air = null;            // 진행 중인 공습: { cx, t, bombs: [{ x, delay, p, done }] }
    this.airX = W / 2;          // 공습 목표 x (조준 마커)
    this.ammo = freshAmmo();    // 매치 시작 전에도 버튼 표시가 올바르도록
    this.stepTimer = 0;
    this.stats = blankStats();  // 우리 팀(팀 0) 경기 기록: 결과 화면에 표시
    this.hover = null;          // 마우스를 올려 둔 유닛 (유닛 정보 줄에 표시)
    this.trajHint = false;      // 설정 '궤적 힌트': 드래그·충전 중 첫 0.6초 궤적을 점선으로 (main.js가 설정과 터치 여부에 따라 켬)
    this.hintDots = 0;          // 마지막 프레임에 그린 힌트 점 수 (검증용)
    this.haptic = null;         // 진동 콜백 (kind: 'fire'|'blast'|'hit') — main.js가 설정에 맞춰 연결
    this.lowFx = false;         // 프레임이 느린 기기에서 main.js가 켬: 날씨 파티클·폭발 파티클을 줄임
    this.sc = 1;                // 글자 캐시용: 지금 캔버스에 걸린 확대 배율
    this.headless = false;      // true면 렌더링 없이 계산만 (window.__sim)
    this.sim = null;            // 시뮬레이션 설정: { skill: [팀0 AI 프로필 | null, ...] } — 있으면 해당 팀을 AI가 조작
  }

  // 팀 t를 AI가 조작하는지 (기본: 팀 1만. 시뮬레이션에서는 팀 0도 AI 프로필로 조작)
  isAI(t) { return t === 1 || !!(this.sim && this.sim.skill[t]); }

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
    this.stats = blankStats();
    const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    // 스테이지 1~3 초원 / 4~6 사막 / 7~8 설원 / 9~10 밤, 빠른 대전·무한은 시드로 결정
    this.buildField(seed, opts.enemies ?? 3, null, this.mode === 'stage' ? themeForStage(this.stage) : themeForSeed(seed));
    this.nextIdx = [0, 0];
    this.turnTeam = 0;
    this.winner = null;
    this.angle = 45; this.power = 0; this.lastPower = 0; this.weapon = 0;
    // 팀별 무기 탄약 (무한 = Infinity, 비활성 무기는 0)
    this.airOk = this.level == null || this.level >= AI_UNLOCK[AIR_IDX];
    this.ammo = this.initAmmo();
    this.charging = false; this.ai = null;
    this.banner = null;
    this.startTurn();
  }

  // 팀별 시작 탄약. 적이 4마리가 되는 level 7 이상(스테이지 7~10, 웨이브 5~)에서는 우리 팀(팀 0)에게 수류탄 +1, 번개 +1
  initAmmo() {
    const a = freshAmmo(this.airOk);
    if (this.level != null && this.level >= BONUS_LEVEL) { a[0][2] += BONUS_GRENADE; a[0][3] += BONUS_BOLT; }
    return a;
  }

  // 지형·배경·유닛을 새로 배치. carry가 있으면 그 팀0 유닛의 체력/생존을 이어받는다 (무한 모드 웨이브 전환)
  buildField(seed, enemies, carry, theme = themeForSeed(seed)) {
    this.seed = seed;
    this.theme = theme;
    this.terrain = new Terrain(seed, theme, this.headless);
    this.bg = this.headless ? null : makeBackground(theme, seed);
    this.weather = this.headless ? null : makeWeather(theme);
    this.units = []; this.particles = []; this.floaters = []; this.proj = null;
    this.bolt = null; this.flashT = 0; this.fires = []; this.crates = []; this.turnNo = 0; this.air = null;
    const rng = mulberry32(seed ^ 0x5bd1e995), jit = () => (rng() * 2 - 1) * 25;
    const baseX = [[95, 230, 360], ENEMY_X[enemies] || ENEMY_X[3]];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < baseX[t].length; i++) {
        const x = clamp(baseX[t][i] + jit(), 20, W - 20);
        const sy = this.terrain.surfaceY(x);
        const [sp, nm, trait, tagColor] = t === 1 && i >= 3 ? EXTRA_ENEMY : CHARACTERS[t][i];
        const u = new Unit(t, i, sp, nm, x, sy - 1, trait);
        u.tagColor = tagColor || TEAMS[t].color;
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
    for (const u of carry) if (u.alive) u.hp = Math.min(u.maxHp, u.hp + 35);
    if ((w - 1) % 3 === 0 && w > 1) {
      const dead = carry.find((u) => !u.alive);
      if (dead) { dead.alive = true; dead.hp = 50; dead.drowned = false; dead.deadT = 0; }
    }
    const cfg = waveConfig(w);
    this.wave = w; this.windMax = cfg.windMax; this.level = cfg.level;
    this.buildField((Math.random() * 1e9) | 0, cfg.enemies, carry);
    this.airOk = this.level == null || this.level >= AI_UNLOCK[AIR_IDX];
    this.ammo = this.initAmmo();
    this.nextIdx = [0, 0]; this.turnTeam = 0; this.winner = null;
    this.angle = 45; this.power = 0; this.weapon = 0; this.charging = false; this.ai = null;
    this.startTurn();
    this.banner = { text: tr('banner.wave', { n: w }) + (this.banner ? ' · ' + this.banner.text : ''), color: TEAMS[0].color, t: 0 };
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
    const nx = clamp(u.x + dir * 70 * (u.trait.speedK || 1) * dt, 12, W - 12), ox = u.x;
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
    u.grounded = false; u.vy = -330 * Math.sqrt(u.trait.jumpK || 1); u.vx = dirHeld * 110; // 점프 높이는 vy²에 비례하므로 +10% 높이 = vy ×√1.1
    u.fallStart = u.y; u.y -= 1; // 낙하 기준 높이를 점프 시작 높이로 (이전 낙하의 값이 남아 있으면 평범한 점프에도 낙하 피해가 들어갔다)
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
    u.deadT += dt; u.hurt = Math.max(0, u.hurt - dt);
    if (!this.feetSolid(u.x, u.y + 1) && u.y < WATER_Y + 40) { u.cvy += UNIT_G * dt; u.y += u.cvy * dt; } else u.cvy = 0;
  }

  land(u) {
    u.grounded = true; u.vx = 0; u.vy = 0; u.squash = 0.3;
    this.unstick(u);
    const dist = u.y - u.fallStart;
    if (dist > FALL_T) {
      const dmg = Math.floor((dist - FALL_T) * 0.4 + 4);
      audio.play('land', { vol: 0.8 });
      this.damage(u, dmg, '#ffd24a');
    }
    u.fallStart = u.y; // 착지한 높이가 다음 낙하·점프의 기준
  }

  // 몸이 지형에 겹쳐 있으면 빼낸다: 바닥에 파묻혔으면 위로(최대 6px), 벽에 붙어 겹쳤으면 옆으로(최대 11px).
  // 예전에는 벽 옆에서도 위로만 올려 발이 뜨는 바람에 유닛이 4프레임마다 6px씩 떨었다 떨어지길 반복했다(그동안 grounded=false라 발사·턴 종료도 지연).
  unstick(u) {
    if (!this.blocked(u.x, u.y)) return;
    const y0 = u.y;
    for (let k = 1; k <= 6; k++) if (!this.blocked(u.x, y0 - k) && this.feetSolid(u.x, y0 - k + 1)) { u.y = y0 - k; return; }
    for (let d = 1; d <= HALF_W + 2; d++) {
      for (const s of [1, -1]) {
        const nx = clamp(u.x + s * d, 12, W - 12);
        for (let c = 0; c <= 4; c++) if (!this.blocked(nx, y0 - c) && this.feetSolid(nx, y0 - c + 1)) { u.x = nx; u.y = y0 - c; return; }
      }
    }
  }

  drown(u) {
    if (!u.alive) return;
    this.countLoss(u, u.hp);
    u.alive = false; u.hp = 0; u.drowned = true;
    for (let i = 0; i < 18; i++) this.pt('splash', u.x + rnd(-8, 8), WATER_Y, rnd(-60, 60), rnd(-260, -100), rnd(2, 5), rnd(0.6, 1.0));
    audio.play('sea_splash', { vol: 0.9 });
    this.ft(u.x, WATER_Y - 10, tr('f.splash'), '#fff');
  }

  // 경기 기록: 팀 1이 잃은 HP = 준 피해, 팀 0이 잃은 HP = 받은 피해
  countLoss(u, n) {
    if (u.team === 1) this.stats.dealt += n; else this.stats.taken += n;
  }

  damage(u, dmg, color = '#fff') {
    if (!u.alive || dmg <= 0) return;
    this.countLoss(u, Math.min(u.hp, dmg));
    u.hp -= dmg; u.hurt = HURT_T;
    if (u.team === 0) { this.hitMine = true; this.buzz('hit'); }
    this.ft(u.x + rnd(-8, 8), Math.max(26, u.y - 92), '-' + dmg, '#ff3b30', true);
    if (u.hp <= 0) {
      u.hp = 0; u.alive = false;
      this.pt('poof', u.x, u.y - 24, 0, -14, 17, 0.55);
      for (let i = 0; i < 6; i++) this.pt('smoke', u.x + rnd(-8, 8), u.y - rnd(5, 30), rnd(-40, 40), rnd(-70, -10), rnd(5, 9), rnd(0.6, 1.0), '255,255,255');
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
    if (r >= 50) this.kick(r >= 58 ? 3.5 : 3); // 로켓·수류탄 같은 큰 폭발만 아주 짧게 흔든다
    audio.play(w.id === 'rocket' ? 'sea_boom_big' : w.id === 'cannon' ? 'sea_boom' : 'sea_boom_small', { rate: w.id === 'rocket' ? 0.95 : 1, vol: 1 });
    let hit = false, near = false;
    this.hitMine = false;
    for (const u of this.units) {
      if (!u.alive) continue;
      const cx = u.x, cy = u.y - BODY_CY;
      const d = Math.hypot(cx - x, cy - y);
      if (u.team === 0 && d < r + 90) near = true; // 우리 유닛 근처(반경+90px)에서 터진 폭발
      const reach = r + 12;
      if (d >= reach) continue;
      const f = 1 - d / reach;
      const dmg = Math.max(2, Math.round(w.damage * f * (u.trait.blastK || 1)));
      let nx = (cx - x) / (d || 1), ny = (cy - y) / (d || 1);
      this.damage(u, dmg, '#ff6b5a'); hit = true;
      if (u.alive) {
        u.grounded = false; u.y -= 2; u.fallStart = u.y;
        u.vx = nx * w.knock * f; u.vy = ny * w.knock * f - 150 * f;
      }
    }
    if (hit) audio.play('hit', { vol: 0.8 });
    if (near && !this.hitMine) this.buzz('blast');
  }

  // 진동 알림: 우리 팀 관련 사건만 (발사 'fire' 짧게, 폭발이 가까이서 'blast', 우리 유닛이 피해를 입으면 'hit' 더 길게). 콜백은 main.js가 설정(진동 켬/끔)·기기 지원을 확인해 처리
  buzz(kind) { if (this.haptic) this.haptic(kind); }
  kick(a) { if (!this.reduceMotion) this.shake = Math.max(this.shake, a); }

  emitExplosion(x, y, r) {
    const P = this.particles;
    this.pt('flash', x, y, 0, 0, r, 0.22);
    const q = this.lowFx ? 0.5 : 1, nf = (18 + (r / 2) | 0) * q | 0; // 느린 기기(lowFx)에서는 파티클을 절반만
    for (let i = 0; i < nf; i++) {
      const a = rnd(0, 6.283), s = rnd(40, 240);
      this.pt('fire', x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, Math.cos(a) * s, Math.sin(a) * s - 40, rnd(r * 0.2, r * 0.45), rnd(0.35, 0.8));
    }
    for (let i = 0, ns = 14 * q | 0; i < ns; i++) {
      const a = rnd(0, 6.283), s = rnd(10, 90);
      this.pt('smoke', x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, Math.cos(a) * s, Math.sin(a) * s - 50, rnd(r * 0.2, r * 0.4), rnd(1.0, 1.9), '70,70,70');
    }
    for (let i = 0, nd = 16 * q | 0; i < nd; i++) {
      const a = rnd(-3.0, -0.15), s = rnd(120, 320);
      this.pt('debris', x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(1.5, 3.5), rnd(0.8, 1.4));
    }
  }

  // 파티클·떠오르는 글자는 객체 풀에서 꺼내 쓰고, 수명이 끝나면 풀로 돌려보낸다 (폭발마다 수십 개를 새로 만들면 느린 폰에서 가비지 수거로 프레임이 끊긴다)
  pt(type, x, y, vx, vy, r, max, color = '', green = false) {
    const p = this.ppool.pop() || { type: '', x: 0, y: 0, vx: 0, vy: 0, r: 0, life: 0, max: 0, color: '', green: false };
    p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = r; p.life = 0; p.max = max; p.color = color; p.green = green;
    this.particles.push(p);
    return p;
  }
  ft(x, y, text, color, dmg = false) {
    const f = this.fpool.pop() || { x: 0, y: 0, text: '', color: '', t: 0, dmg: false };
    f.x = x; f.y = y; f.text = text; f.color = color; f.t = 0; f.dmg = dmg;
    this.floaters.push(f);
    return f;
  }
  updateParticles(dt) {
    const P = this.particles;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'debris' || p.type === 'splash') p.vy += 700 * dt;
      else if (p.type === 'smoke') { p.r += dt * 8; p.vx *= 0.97; p.vy -= 12 * dt; }
      else if (p.type === 'fire') { p.vx *= 0.94; p.vy = p.vy * 0.94 - 20 * dt; }
    }
    // 수명이 끝난 것을 제자리에서 제거해 풀로 돌려보냄 (매 프레임 새 배열을 만들지 않음) + 상한을 넘으면 가장 오래된 것부터 버림
    const pool = this.ppool;
    let n = 0;
    for (let i = 0; i < P.length; i++) { const p = P[i]; if (p.life < p.max) P[n++] = p; else if (pool.length < MAX_PARTICLES) pool.push(p); }
    P.length = n;
    if (n > MAX_PARTICLES) {
      const cut = n - MAX_PARTICLES;
      for (let i = 0; i < cut && pool.length < MAX_PARTICLES; i++) pool.push(P[i]);
      for (let i = cut; i < n; i++) P[i - cut] = P[i];
      P.length = MAX_PARTICLES;
    }
    const F = this.floaters, fp = this.fpool;
    n = 0;
    for (let i = 0; i < F.length; i++) { const f = F[i]; f.t += dt; if (f.t < 1.2) F[n++] = f; else if (fp.length < MAX_FLOATERS) fp.push(f); }
    F.length = n;
    if (n > MAX_FLOATERS) {
      const cut = n - MAX_FLOATERS;
      for (let i = 0; i < cut && fp.length < MAX_FLOATERS; i++) fp.push(F[i]);
      for (let i = cut; i < n; i++) F[i - cut] = F[i];
      F.length = MAX_FLOATERS;
    }
  }

  // ---------- 턴 ----------
  get active() { return this.activeUnit; }

  startTurn() {
    const t = this.turnTeam;
    if (this.burnFires(t)) return;
    this.turnNo++;
    this.regenTeam(t);
    if (this.turnNo % CRATE_EVERY === 0) this.dropCrate();
    const mine = this.units.filter((u) => u.team === t);
    let u = null;
    for (let k = 0; k < mine.length; k++) {
      const c = mine[(this.nextIdx[t] + k) % mine.length];
      if (c.alive) { u = c; this.nextIdx[t] = (this.nextIdx[t] + k + 1) % mine.length; break; }
    }
    this.activeUnit = u;
    if (t === 0 && u) this.stats.turns++;
    this.wind = Math.floor(rnd(-this.windMax, this.windMax + 1));
    this.timer = TURN_TIME;
    this.state = 'aim';
    this.power = 0; this.charging = false; this.drag = null;
    this.weapon = 0;
    this.angle = 45;
    this.banner = { text: tr(t === 0 ? 'banner.mine' : 'banner.foe', { name: u.name }), color: TEAMS[t].color, t: 0 };
    this.lastTick = 99;
    this.ai = this.isAI(t) ? { phase: 'think', t: 0, walks: 0, crateWalks: 0, fled: 0, tries: 0, total: 0, target: null } : null;
  }

  // 재생 특성: 팀 턴이 시작될 때 그 팀의 살아 있는 재생형 유닛이 HP를 회복한다 (최대 HP까지)
  regenTeam(t) {
    for (const u of this.units) {
      const r = u.trait.regen;
      if (!r || !u.alive || u.team !== t || u.hp >= u.maxHp) continue;
      const h = Math.min(r, u.maxHp - u.hp);
      u.hp += h;
      this.ft(u.x, Math.max(26, u.y - 92), '+' + h, '#5dff6e');
    }
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
    this.ft(x, 70, tr('f.crate'), '#7dff8a');
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
        u.hp = Math.min(u.maxHp, u.hp + CRATE_HEAL);
        this.ft(u.x, u.y - 60, '+' + CRATE_HEAL, '#5dff6e');
        for (let k = 0; k < 10; k++) this.pt('spark', c.x + rnd(-8, 8), c.y - rnd(0, 20), rnd(-40, 40), rnd(-120, -40), rnd(2, 3.5), rnd(0.4, 0.8), '', true);
        audio.playSynth('heal');
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
      for (let i = 0; i < 10; i++) this.pt('debris', c.x, c.y - 10, rnd(-160, 160), rnd(-220, -60), rnd(1.5, 3), rnd(0.6, 1.1));
      this.ft(c.x, c.y - 24, tr('f.crateBreak'), '#ddd');
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
      this.banner = { text: tr('banner.waveClear', { n: this.wave }), color: TEAMS[0].color, t: 0 };
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

  get isPlayerTurn() { return this.state === 'aim' && !this.isAI(this.turnTeam); }

  // ---------- 플레이어 조작 ----------
  setWeapon(i) {
    if (!this.isPlayerTurn || this.charging || this.weapon === i) return;
    const w = WEAPONS[i], u = this.activeUnit;
    if (!w) return;
    if (w.disabled || this.ammo[0][i] <= 0) {
      const locked = w.airstrike && !this.airOk;
      this.ft(u.x, u.y - 70, w.disabled ? tr('f.soon') : locked ? tr(this.mode === 'endless' ? 'f.unlockWave' : 'f.unlockStage') : tr('f.noAmmo'), '#ffe27a');
      return;
    }
    this.weapon = i; audio.play('switch', { vol: 0.7 });
    if (w.airstrike) this.airX = this.defaultAirX();
  }
  // 무기 바 더블탭: 지금 무기 다음으로 쓸 수 있는(탄약이 있고 해금된) 무기로 넘긴다. 바꿨으면 true
  cycleWeapon() {
    if (!this.isPlayerTurn || this.charging) return false;
    const n = WEAPONS.length;
    for (let k = 1; k < n; k++) {
      const i = (this.weapon + k) % n, w = WEAPONS[i];
      if (!w.disabled && this.ammo[0][i] > 0) { this.setWeapon(i); return true; }
    }
    return false;
  }
  // 공습 목표 마커 초기 위치: 활성 유닛에서 가장 가까운 상대 유닛의 x
  defaultAirX() {
    const u = this.activeUnit;
    let best = null;
    for (const o of this.units) if (o.alive && o.team !== this.turnTeam && (!best || Math.abs(o.x - u.x) < Math.abs(best.x - u.x))) best = o;
    return clamp(best ? best.x : u.x, 20, W - 20);
  }
  get airMode() { return this.weapon === AIR_IDX && WEAPONS[AIR_IDX].airstrike; }
  setAirX(px) { if (this.isPlayerTurn && this.airMode) this.airX = clamp(px, 20, W - 20); }
  // 캔버스 좌표가 하단 무기 슬롯 위인지 (없으면 -1)
  slotAt(px, py) {
    for (let i = 0; i < WEAPONS.length; i++) {
      const [x, y, w, h] = slotRect(i, this.bigHud);
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
  // 터치 드래그 조준: 각도 = 활성 유닛에서 손가락 방향, 파워 = 누른 지점에서 끈 거리, 떼면 발사
  // max: 파워 100%가 되는 드래그 거리 (캔버스 px, 화면 크기에 맞춰 호출 쪽에서 정함)
  dragBegin(px, py, max = 170) {
    if (!this.isPlayerTurn || this.charging || this.drag) return false;
    this.drag = { sx: px, sy: py, x: px, y: py, max };
    this.power = 0; this.aimTo(px, py);
    return true;
  }
  dragMove(px, py) {
    const d = this.drag;
    if (!d) return;
    if (!this.isPlayerTurn) { this.drag = null; return; }
    d.x = px; d.y = py;
    this.aimTo(px, py);
    this.power = clamp((Math.hypot(px - d.sx, py - d.sy) / d.max) * 100, 0, 100);
  }
  dragEnd(fireIt = true) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const far = Math.hypot(d.x - d.sx, d.y - d.sy) >= DRAG_MIN;
    if (fireIt && far && this.isPlayerTurn && this.activeUnit.grounded) this.fire(Math.max(8, this.power));
    else this.power = 0; // 너무 짧게 끌었거나 취소 -> 발사 안 함
  }
  playerJump() {
    if (!this.isPlayerTurn || this.charging) return;
    const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    this.jump(this.activeUnit, dir);
  }
  beginCharge() {
    if (this.isPlayerTurn && !this.charging && this.airMode) { this.fire(0); return; } // 공습은 충전 없이 마커 위치로 즉시 호출
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
    if (this.turnTeam === 0) { this.stats.shots++; this.stats.wpn[w.id] = (this.stats.wpn[w.id] || 0) + 1; this.buzz('fire'); }
    if (w.instant) return this.fireLightning(u, w);
    if (w.airstrike) return this.fireAirstrike(u, w);
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
    if (w.id === 'cannon' || w.id === 'rocket') audio.play('sea_cannon', { rate: w.id === 'rocket' ? 1.15 : 1, vol: 0.9 });
    else audio.play('fire', { rate: w.id === 'grenade' ? 1.3 : 0.6 });
    if (w.id === 'grenade') audio.playSynth('grenadeTick', { stage: 0, delay: 0.12 });
  }

  // ---------- 공습 ----------
  // 호출 즉시 목표 구역(폭 120px)에 경고 마커를 AIR_WARN초 동안 띄우고, 이어서 폭탄 AIR_N발이 짧은 간격으로 떨어진다.
  fireAirstrike(u, w) {
    if (this.ammo[this.turnTeam][this.weapon] !== Infinity) this.ammo[this.turnTeam][this.weapon]--;
    const cx = clamp(this.airX, 20, W - 20), slot = AIR_W / AIR_N, order = [...Array(AIR_N).keys()].sort(() => Math.random() - 0.5);
    this.air = {
      cx, t: 0, w,
      bombs: order.map((k, i) => ({ x: clamp(cx - AIR_W / 2 + (i + 0.5) * slot + rnd(-slot * 0.35, slot * 0.35), 4, W - 4), delay: k * 0.17 + rnd(0, 0.07), p: null, done: false })),
    };
    this.charging = false; this.power = 0; this.lastPower = 0;
    this.state = 'strike';
    u.squash = -0.2; u.shootT = 0.4;
    audio.play('select', { rate: 0.6, vol: 0.9 });
  }

  updateAirstrike(dt) {
    const a = this.air;
    a.t += dt;
    if (a.t < AIR_WARN) {
      if (Math.floor(a.t * 4) !== Math.floor((a.t - dt) * 4)) audio.play('tick', { vol: 0.5, rate: 1.3 });
      return;
    }
    for (const b of a.bombs) {
      if (b.done || a.t < AIR_WARN + b.delay) continue;
      if (!b.p) { b.p = { x: b.x, y: -24, vx: 0, vy: 240, w: a.w, owner: null, age: 0 }; audio.playSynth('whistle', { vol: 0.5, dur: rnd(0.65, 0.85), pitch: rnd(0.9, 1.12) }); } // 폭탄마다 하강 휘파람
      const r = stepProj(b.p, dt, 0, this.terrain, this.units);
      this.pt('smoke', b.p.x, b.p.y - 8, 0, 0, 2, 0.3, '230,230,230');
      if (!r) continue;
      b.done = true;
      if (r === 'terrain' || r === 'unit') this.explode(b.p.x, b.p.y, a.w);
      else if (r === 'water') {
        for (let i = 0; i < 10; i++) this.pt('splash', b.p.x, WATER_Y, rnd(-60, 60), rnd(-220, -80), rnd(2, 4), rnd(0.5, 0.9));
        audio.play('sea_splash', { vol: 0.6, rate: 1.2 });
      }
    }
    if (a.t > 12) for (const b of a.bombs) b.done = true; // 안전장치
    if (a.bombs.every((b) => b.done)) { this.air = null; this.state = 'settle'; this.settleT = 0; this.settleTotal = 0; }
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
    this.kick(2);
    audio.playSynth('lightning'); // 합성: 하이패스 스윕 노이즈 지지직
    audio.play('explosion', { rate: 1.9, vol: 0.3 });
    u.squash = -0.2; u.shootT = 0.4;
    for (let i = 0; i < 8; i++) this.pt('spark', ox, oy, rnd(-90, 90), rnd(-90, 90), rnd(1.5, 3), rnd(0.2, 0.4));
    if (target) {
      this.damage(target, w.damage, '#9fd0ff');
      this.pt('flash', ex, ey, 0, 0, 34, 0.25);
      for (let i = 0; i < 16; i++) this.pt('spark', ex, ey, rnd(-220, 220), rnd(-220, 160), rnd(1.5, 3.5), rnd(0.25, 0.55));
      audio.play('hit', { vol: 0.8 });
      if (target.alive) {
        target.grounded = false; target.y -= 2; target.fallStart = target.y;
        target.vx = dx * w.knock; target.vy = dy * w.knock - 120;
      }
    }
    this.state = 'settle'; this.settleT = 0; this.settleTotal = 0;
  }

  // ---------- AI ----------
  // 궤적 계산용 임시 투사체·결과 객체 (후보마다 새 객체를 만들지 않도록 재사용; 결과는 호출 즉시 읽는다)
  simulate(u, weapon, angle, power, facing) {
    const w = WEAPONS[weapon], a = rad(angle), v = launchSpeed(w, power);
    const p = this._sp || (this._sp = {}), out = this._so || (this._so = { x: 0, y: 0, kind: '' });
    p.x = u.x + facing * Math.cos(a) * 18; p.y = u.y - 20 - Math.sin(a) * 18; p.vx = facing * Math.cos(a) * v; p.vy = -Math.sin(a) * v; p.w = w; p.owner = u; p.age = 0;
    out.kind = 'out';
    for (let i = 0; i < 1500; i++) {
      const r = stepProj(p, 1 / 60, this.wind, this.terrain, null);
      if (r) { out.kind = r; break; }
    }
    out.x = p.x; out.y = p.y;
    return out;
  }

  simulateGrenade(u, angle, power, facing) {
    const w = WEAPONS[2], a = rad(angle), v = launchSpeed(w, power);
    const p = this._sg || (this._sg = {}), out = this._so || (this._so = { x: 0, y: 0, kind: '' });
    p.x = u.x + facing * Math.cos(a) * 18; p.y = u.y - 20 - Math.sin(a) * 18; p.vx = facing * Math.cos(a) * v; p.vy = -Math.sin(a) * v; p.w = w; p.owner = u; p.age = 0; p.fuse = w.fuse;
    out.kind = 'out';
    for (let i = 0; i < 420; i++) {
      const r = this.stepGrenade(p, 1 / 60, true);
      if (r) { out.kind = r; break; }
    }
    out.x = p.x; out.y = p.y;
    return out;
  }

  // AI 오차 계수 (스테이지/웨이브 단계가 있으면 단계별, 없으면 난이도별)
  aiErr() {
    const e = this.aiBaseErr(), st = (this.activeUnit && this.activeUnit.trait.steady) || 0; // 안정 조준 특성: 오차 -15%
    return { a: e.a * (1 - st), p: e.p * (1 - st), pick: e.pick };
  }
  aiBaseErr() {
    const sk = this.sim && this.sim.skill[this.turnTeam]; // 시뮬레이션에서 AI가 조작하는 우리 팀의 숙련도 프로필
    if (sk) return { a: sk.a, p: sk.p, pick: !!sk.pick };
    if (this.sim && this.sim.err) return { ...this.sim.err }; // 시뮬레이션: 적 AI 오차를 직접 지정해 보는 실험용
    if (this.mode === 'stage' && STAGE_AI[this.stage]) { const [a, p] = STAGE_AI[this.stage]; return { a, p, pick: this.stage <= 3 }; }
    if (this.level != null) return levelErr(this.level);
    const d = DIFF[this.difficulty] || DIFF.normal;
    return { a: d.a, p: d.p, pick: this.difficulty === 'easy' };
  }

  // 목표점 pt({x,y}=몸통 중심)에 무기 weapon(0 대포,1 로켓,2 수류탄,4 화염탄)을 가장 가깝게 떨어뜨리는 (각도, 파워) 탐색
  // 후보가 많아(약 1000회 궤적 계산) 한 프레임에 돌리면 느린 폰에서 프레임이 크게 끊긴다 -> 제너레이터로 만들어 aiRun이 프레임당 몇 ms씩 나눠 돌린다
  *aiPlan(weapon, pt) {
    const u = this.activeUnit;
    const facing = pt.x >= u.x ? 1 : -1;
    const grenade = weapon === 2, step = grenade ? 5 : 2.5;
    const friends = this.units.filter((o) => o.alive && o.team === u.team);
    const rad2 = WEAPONS[weapon].radius * 1.1;
    let best = null;
    const cands = [];
    for (let angle = 12; angle <= 85; angle += step) {
      if (performance.now() > this._aiDeadline) yield; // 이번 프레임의 계산 시간을 다 썼으면 다음 프레임에 이어서
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
      if (tr.target && tr.target.team !== u.team) out.push({ target: tr.target, angle: ang, facing: f });
    }
    return out;
  }

  // 이번 사격의 무기·목표·각도·파워 결정
  // 번개(직선 사선 확보) > 화염탄(적 2명 이상이 60px 이내) > 수류탄(구덩이/지형 뒤 목표) > 대포/로켓
  *aiDecide() {
    const u = this.activeUnit, ai = this.ai, me = u.team, am = this.ammo[me], sk = this.sim && this.sim.skill[me];
    const enemies = this.units.filter((o) => o.alive && o.team !== me);
    const pt = (e) => ({ x: e.x, y: e.y - BODY_CY });
    if (!enemies.length) return null;
    const hidden = enemies.filter((e) => this.aiHidden(u, e));
    // 낮은 스테이지/웨이브에서는 AI의 특수 무기 제한. 시뮬레이션 속 우리 팀은 level과 무관하게 탄약이 있으면 사용(basic이면 대포탄·로켓만)
    const can = (i) => am[i] > 0 && (sk ? !sk.basic : this.level == null || this.level >= AI_UNLOCK[i]);
    if (can(AIR_IDX) && Math.random() < 0.85) { // 공습: 상대 유닛 2마리 이상이 가로 120px 안에 모여 있고 아군이 구역 근처에 없을 때
      let grp = null;
      for (const a of enemies) {
        const g = enemies.filter((o) => o.x >= a.x && o.x <= a.x + AIR_W);
        if (g.length >= 2 && (!grp || g.length > grp.length)) grp = g;
      }
      if (grp) {
        const e = this.aiErr(), cx = clamp((Math.min(...grp.map((o) => o.x)) + Math.max(...grp.map((o) => o.x))) / 2 + gauss() * e.a * 2, 20, W - 20);
        const friendly = this.units.some((o) => o.alive && o.team === me && Math.abs(o.x - cx) < AIR_W / 2 + 10);
        if (!friendly) return { weapon: AIR_IDX, facing: cx >= u.x ? 1 : -1, dist: 0, min: 0, target: grp[0], angle: this.angle, power: 0, x: cx };
      }
    }
    if (can(3)) {
      const opts = this.aiBoltOptions(u, enemies).sort((p, q) => p.target.hp - q.target.hp);
      const o = opts[0];
      if (o && (hidden.includes(o.target) || o.target.hp <= WEAPONS[3].damage || Math.random() < 0.6)) {
        const e = this.aiErr();
        return { weapon: 3, facing: o.facing, dist: 0, min: 0, target: o.target, angle: clamp(o.angle + gauss() * 2 * e.a * 0.5, 5, 88), power: 0 };
      }
    }
    if (can(4)) {
      let pair = null;
      for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
        const d = Math.hypot(enemies[i].x - enemies[j].x, enemies[i].y - enemies[j].y);
        if (d <= 60 && (!pair || d < pair.d)) pair = { d, a: enemies[i], b: enemies[j] };
      }
      if (pair) {
        const plan = yield* this.aiPlan(4, { x: (pair.a.x + pair.b.x) / 2, y: (pair.a.y + pair.b.y) / 2 - BODY_CY });
        if (plan.min <= 40) return { ...plan, target: pair.a };
      }
    }
    if (can(2) && hidden.length) {
      for (const e of hidden.sort((p, q) => Math.abs(p.x - u.x) - Math.abs(q.x - u.x))) {
        const plan = yield* this.aiPlan(2, pt(e));
        if (plan.min <= 45) return { ...plan, target: e };
      }
    }
    if (!ai.target || !ai.target.alive) ai.target = enemies[Math.floor(Math.random() * enemies.length)];
    if (ai.weapon === undefined) ai.weapon = Math.random() < 0.35 ? 1 : 0;
    return { ...(yield* this.aiPlan(ai.weapon, pt(ai.target))), target: ai.target };
  }

  // 제너레이터 job을 이번 프레임 예산(AI_SLICE_MS) 안에서만 진행. 끝났으면 { done: true, value }. 헤드리스(시뮬레이션)는 제한 없이 한 번에 끝까지
  aiRun(job) {
    const dl = this._aiDeadline = this.headless ? Infinity : performance.now() + AI_SLICE_MS;
    for (;;) {
      const r = job.next();
      if (r.done || performance.now() >= dl) return r;
    }
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

  // AI가 쏠 수 없을 때(유효한 사격 없음, 목표 없음, 오류, 시간 초과) 짧게 '생각 중...'을 보여 준 뒤 턴을 넘긴다
  aiSkip() {
    const a = this.ai;
    if (!a || a.phase === 'skip') return;
    a.phase = 'skip'; a.t = 0; this.charging = false; this.power = 0;
    if (this.activeUnit) this.ft(this.activeUnit.x, this.activeUnit.y - 70, tr('f.think'), '#fff');
  }

  aiUpdate(dt) {
    const a = this.ai, u = this.activeUnit;
    a.t += dt; a.total += dt;
    if (a.phase === 'skip') {
      if (a.t >= 1.1) { this.ai = null; this.state = 'settle'; this.settleT = 0; this.settleTotal = 0; }
      return;
    }
    if (a.total > AI_TURN_MAX) { this.aiSkip(); return; }
    if (a.phase === 'think') {
      if (a.t < 0.9) return;
      // 1) 화염 지대 안이면 밖으로 이동 (다음 턴 시작 때 또 화상을 입지 않도록)
      if (!a.job && a.fled < 2 && this.aiFireAt(u.x, u.y)) {
        const f = this.fires.find((q) => Math.hypot(u.x - q.x, (u.y - 14) - q.y) < q.r);
        const first = u.x >= f.x ? 1 : -1;
        const dir = this.aiSafeAhead(u, first) ? first : this.aiSafeAhead(u, -first) ? -first : 0;
        a.fled++;
        if (dir) { a.phase = 'walk'; a.t = 0; a.goal = 'fire'; a.dir = dir; a.dur = 3; return; }
      }
      // 2) 체력 70 미만이고 150px 안에 보급 상자가 있으면 상자 쪽으로 이동
      const crate = !a.job && u.hp < 70 && a.crateWalks < 3 ? this.aiNearCrate(u) : null;
      if (crate && Math.abs(crate.x - u.x) > 8) {
        const dir = crate.x >= u.x ? 1 : -1;
        if (this.aiSafeAhead(u, dir)) {
          a.phase = 'walk'; a.t = 0; a.goal = 'crate'; a.crate = crate; a.dir = dir; a.crateWalks++;
          a.dur = Math.min(3.5, (Math.abs(crate.x - u.x) + 10) / 70 + 0.3);
          return;
        }
      }
      // 3) 사격 계획 (무기 선택 포함). 대포/로켓 계획이 빗나가면 목표 쪽으로 걸어가 다시 계산. 계산은 여러 프레임에 나눠서 한다
      if (!a.job) a.job = this.aiDecide();
      const jr = this.aiRun(a.job);
      if (!jr.done) return;
      a.job = null;
      const plan = jr.value;
      if (!plan || !plan.target) { this.aiSkip(); return; }
      a.target = plan.target;
      // 유효한 착탄이 하나도 없음(모든 후보가 물/화면 밖): 목표 쪽으로 걸어가 다시 계산하되 AI_MAX_TRIES번을 넘기면 포기
      const canWalk = a.walks < 2 && this.aiSafeAhead(u, a.target.x >= u.x ? 1 : -1);
      if (plan.min >= 9999 && (++a.tries >= AI_MAX_TRIES || !canWalk)) { this.aiSkip(); return; }
      if (plan.weapon <= 1 && plan.dist > 110 && canWalk) {
        a.phase = 'walk'; a.t = 0; a.goal = null; a.walks++; a.dur = rnd(0.5, 1.0); a.dir = a.target.x >= u.x ? 1 : -1;
      } else {
        a.plan = plan; a.phase = 'aim'; a.t = 0; a.from = this.angle;
        u.facing = plan.facing; this.weapon = plan.weapon;
        if (plan.x !== undefined) this.airX = plan.x; // 공습: 마커가 목표 위치에 표시됨
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
        if (WEAPONS[a.plan.weapon].instant || WEAPONS[a.plan.weapon].airstrike) { this.fire(0); this.ai = null; } // 번개·공습은 파워 충전 없이 즉시 발사
        else { a.phase = 'charge'; a.t = 0; this.charging = true; this.power = 0; }
      }
    } else if (a.phase === 'charge') {
      this.power = Math.min(100, this.power + 100 * dt / CHARGE_T);
      if (this.power >= a.plan.power) { this.charging = false; this.fire(a.plan.power); this.ai = null; }
    }
  }

  // ---------- 업데이트 ----------
  update(dt) {
    this.time += dt;
    if (this.state === 'idle') return;
    this.updateParticles(dt);
    if (this.weather && !this.reduceMotion) { this.weather.active = this.lowFx ? Math.ceil(this.weather.parts.length * 0.4) : this.weather.parts.length; stepWeather(this.weather, dt, this.wind || 0); }
    if (this.bolt) { this.bolt.t += dt; if (this.bolt.t > 0.3) this.bolt = null; }
    this.flashT = Math.max(0, this.flashT - dt);
    this.updateCrates(dt);
    for (const f of this.fires) {
      if (Math.random() < dt * 24) {
        const x = f.x + rnd(-f.r, f.r), gy = this.fireGround(f, x);
        if (gy !== null) this.pt('fire', x, gy - 2, rnd(-10, 10), rnd(-90, -40), rnd(2, 4), rnd(0.4, 0.8));
      }
    }
    this.shake = Math.max(0, this.shake - dt * 24);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > BANNER_T) this.banner = null; }

    for (const u of this.units) if (u.alive) { u.moving = false; }
    const hu = this.activeUnit;
    if (this.state === 'aim') {
      this.timer -= dt;
      const sec = Math.ceil(this.timer);
      if (sec <= 5 && sec > 0 && sec !== this.lastTick) { this.lastTick = sec; audio.play('tick', { vol: 0.6 }); }
      const human = !this.isAI(this.turnTeam);
      if (human && this.airMode) {
        // 공습: 이동·각도 키(←→/AD, ↑↓와 화면 ◀▶·각도 버튼)가 목표 마커를 좌우로 움직인다
        const d = (this.keys.right || this.keys.up ? 1 : 0) - (this.keys.left || this.keys.down ? 1 : 0);
        if (d) this.airX = clamp(this.airX + d * 200 * dt, 20, W - 20);
      } else if (human) {
        if (this.charging) {
          this.power = Math.min(100, this.power + 100 * dt / (CHARGE_T * (1 + (hu.trait.steady || 0)))); // 안정 조준: 충전이 15% 느려져 원하는 파워에서 떼기 쉽다
        } else if (hu.grounded) {
          const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
          if (dir) this.walk(hu, dir, dt);
        } else if (this.keys.left !== this.keys.right) {
          hu.facing = this.keys.right ? 1 : -1;
        }
        const ad = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
        if (ad && !this.charging) this.aimBy(ad * 45 * dt);
      } else if (this.ai) {
        try { this.aiUpdate(dt); } catch (err) { console.error('AI 오류, 턴을 넘깁니다', err); this.aiSkip(); }
      }
      if (this.timer <= 0 && this.state === 'aim') {
        this.charging = false; this.timer = 0;
        this.ft(hu.x, hu.y - 70, tr('f.timeout'), '#fff');
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
      if (!r && p.age > 25) r = 'out'; // 안전장치: 25초 넘게 날아간 투사체는 사라진 것으로 처리
      if (grenade) {
        const sec = Math.ceil(p.fuse);
        if (sec < p.tickN && sec > 0) { p.tickN = sec; audio.playSynth('grenadeTick', { stage: Math.min(2, Math.round(p.w.fuse - sec)) }); }
        this.pt('fire', p.x + 2, p.y - 6, rnd(-15, 15), rnd(-40, -15), rnd(1.5, 2.5), 0.25);
      } else if (p.w.id === 'fire') {
        this.pt('fire', p.x, p.y, rnd(-25, 25), rnd(-25, 25), rnd(3, 6), 0.4);
      } else if (p.w.id === 'rocket') {
        this.pt('fire', p.x, p.y, rnd(-20, 20), rnd(-20, 20), rnd(3, 5), 0.3);
        this.pt('smoke', p.x, p.y, rnd(-10, 10), rnd(-10, 10), rnd(3, 5), 0.8, '120,120,120');
      } else {
        this.pt('smoke', p.x, p.y, 0, 0, 2, 0.35, '230,230,230');
      }
      if (r) {
        this.proj = null;
        if (r === 'terrain' || r === 'unit' || r === 'explode') {
          this.explode(p.x, p.y, p.w);
          if (p.w.fireR) this.igniteAt(p.x, p.y, p.w);
        }
        else if (r === 'water') {
          for (let i = 0; i < 14; i++) this.pt('splash', p.x, WATER_Y, rnd(-70, 70), rnd(-250, -90), rnd(2, 4), rnd(0.5, 0.9));
          audio.play('sea_splash', { vol: 0.8, rate: 1.1 });
        }
        this.state = 'settle'; this.settleT = 0; this.settleTotal = 0;
      }
    } else if (this.state === 'strike') {
      this.updateAirstrike(dt);
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
      if ((this.settleT > 0.9 && this.settleTotal > 1.3) || this.settleTotal > SETTLE_MAX) { // 유닛이 계속 공중이어도 SETTLE_MAX초 뒤에는 다음 턴
        if (!this.checkWinner()) this.endTurn();
      }
    }
  }

  // ---------- 렌더링 ----------
  // 윤곽선 글자(strokeText+fillText)는 비싸서(약한 폰에서 프레임 시간의 큰 몫) 같은 글자는 한 번만 오프스크린에 그려 두고 drawImage로 찍는다.
  // this.sc: 지금 캔버스에 걸린 확대 배율(HUD 배율 hs, 이름표 배율 ts). 그 배율로 구워 두므로 확대해도 또렷하다. 캐시는 TEXT_CACHE_MAX개를 넘으면 오래된 것부터 버린다.
  text(g, str, x, y, size, color = '#fff', align = 'center', weight = '700') {
    if (this.headless || typeof document === 'undefined') return this.textRaw(g, str, x, y, size, color, align, weight);
    const sc = this.sc || 1;
    let list = TEXT_CACHE.get(str), e = null;
    if (list) for (let i = 0; i < list.length; i++) { const c = list[i]; if (c.size === size && c.sc === sc && c.color === color && c.weight === weight) { e = c; break; } }
    if (!e) e = bakeText(str, size, color, weight, sc);
    let dx = align === 'center' ? -e.tw / 2 : align === 'right' ? -e.tw : 0;
    let dy = -e.hl / 2;
    dx -= e.pad; // 글자 시작이 x가 되도록 여백만큼 당김
    if (sc === 1) { dx = Math.round(x + dx); dy = Math.round(y + dy); } else { dx += x; dy += y; } // 배율 1이면 정수 좌표로 찍어 흐려지지 않게
    g.drawImage(e.c, dx, dy, e.wl, e.hl);
  }

  // 캐시 없이 바로 그리는 글자 (크기가 프레임마다 달라지는 피해 숫자 등)
  textRaw(g, str, x, y, size, color = '#fff', align = 'center', weight = '700') {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align; g.textBaseline = 'middle';
    g.lineWidth = Math.max(2, size / 5); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineJoin = 'round';
    g.strokeText(str, x, y); g.fillStyle = color; g.fillText(str, x, y);
  }

  // 글자 폭 캐시 (프레임마다 measureText를 부르지 않도록)
  textW(str, weight, size) {
    const key = `${weight}|${size}|${str}`;
    let w = WIDTH_CACHE.get(key);
    if (w === undefined) {
      const k = measureCtx(); k.font = `${weight} ${size}px ${FONT}`; w = k.measureText(str).width;
      if (WIDTH_CACHE.size > 400) WIDTH_CACHE.clear();
      WIDTH_CACHE.set(key, w);
    }
    return w;
  }

  // 팀 표시 도형: 파랑 팀은 원, 빨강 팀은 마름모 (색 없이도 구분). 흰 테두리 + 검은 바깥 윤곽으로 대비를 높인다
  mark(g, team, x, y, r) {
    g.save();
    g.beginPath();
    if (team === 0) g.arc(x, y, r, 0, 7);
    else { g.moveTo(x, y - r * 1.2); g.lineTo(x + r * 1.2, y); g.lineTo(x, y + r * 1.2); g.lineTo(x - r * 1.2, y); g.closePath(); }
    g.lineJoin = 'round';
    g.lineWidth = 4; g.strokeStyle = '#000'; g.stroke();
    g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = TEAMS[team].color; g.fill();
    g.restore();
  }

  // 상단 HUD 배율: 작은 화면에서 1~1.3배, '큰 HUD 글씨'를 켜면 +25% (좌우 HP 박스와 중앙 타이머가 겹치지 않도록 최대 1.5배)
  get hudScale() {
    const hs = Math.min(1.3, Math.max(1, 0.85 / this.viewScale));
    return this.bigHud ? Math.min(1.5, hs * 1.25) : hs;
  }

  draw(g) {
    if (!this.bg) { g.fillStyle = '#6bb9ee'; g.fillRect(0, 0, W, H); return; }
    g.save();
    if (this.shake > 0.3) g.translate(rnd(-this.shake, this.shake), rnd(-this.shake, this.shake));
    g.drawImage(this.bg, 0, 0);
    drawBackgroundFx(g, this.bg, this.time);
    g.drawImage(this.terrain.canvas, 0, 0);
    if (this.weather && !this.reduceMotion) drawWeather(g, this.weather);
    for (const c of this.crates) this.drawCrate(g, c);
    for (const u of this.units) if (u.alive || (!u.drowned && u.deadT < FADE_END)) this.drawUnit(g, u);
    this.drawFires(g);
    this.drawWater(g);
    const showAim = this.state === 'aim' && (this.turnTeam === 0 || (this.ai && (this.ai.phase === 'aim' || this.ai.phase === 'charge')));
    if (showAim && !this.airMode) this.drawAim(g);
    if (this.proj) this.drawProj(g, this.proj);
    this.drawAir(g, showAim && this.airMode);
    this.drawBolt(g);
    this.drawParticles(g);
    this.drawTags(g);
    if (showAim && !this.airMode) this.drawCross(g);
    if (this.airLabel && this.airLabel.str) { const l = this.airLabel; this.text(g, l.str, l.x, l.y, l.fs, l.color); } // 이름표 위에 보이도록 마지막에
    const fs = Math.min(34, Math.max(18, 15 / this.viewScale)); // 작은 화면에서도 CSS 15px 안팎
    for (const f of this.floaters) {
      const k = f.t / 1.2, pop = f.dmg ? 1 + Math.max(0, 0.35 - f.t * 1.6) : 1;
      g.globalAlpha = Math.max(0, Math.min(1, (1 - k) * 2));
      if (pop === 1) this.text(g, f.text, f.x, f.y - f.t * 34, fs, f.color, 'center', '800');
      else this.textRaw(g, f.text, f.x, f.y - f.t * 34, fs * pop, f.color, 'center', '800'); // 튀어나오는 0.2초 동안은 크기가 매 프레임 달라 캐시하지 않음
    }
    g.globalAlpha = 1;
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
      g.translate(f.x, f.y + 4); // 원점에 만든 그라디언트를 재사용 (프레임마다 새로 만들지 않음)
      g.fillStyle = fireGlow(g, f.r); g.beginPath(); g.arc(0, 0, f.r, 0, 7); g.fill();
      g.translate(-f.x, -f.y - 4);
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
      this.text(g, tr('f.turns', { n: f.turns }), f.x, f.y - 32, 11, '#ffd27a');
    }
  }

  drawWater(g) {
    const t = this.time, ys = this._waveY || (this._waveY = new Float32Array(W / 8 + 1));
    for (let i = 0; i < ys.length; i++) ys[i] = WATER_Y + Math.sin(i * 8 / 40 + t * 2) * 3; // 파도 높이는 한 번만 계산해 채우기·선에 함께 씀
    g.fillStyle = this.theme.water;
    g.beginPath(); g.moveTo(0, H);
    for (let i = 0; i < ys.length; i++) g.lineTo(i * 8, ys[i]);
    g.lineTo(W, H); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, ys[0]);
    for (let i = 1; i < ys.length; i++) g.lineTo(i * 8, ys[i]);
    g.stroke();
  }

  poseOf(u) {
    if (!u.alive) return 'down';
    if (u.hurt > 0) return 'hit';
    if (this.hopOf(u) > 1) return 'jump';
    if (!u.grounded) return u.vy < 0 ? 'jump' : 'fall';
    if (u.moving) return 'walk' + (Math.floor(u.walkDist / STEP_LEN) % WALK_FRAMES);
    if (u.shootT > 0) return 'attack0';
    if (u === this.activeUnit && this.charging) return 'hold';
    return 'idle';
  }

  // 승리 점프: 경기가 끝나면(결과 화면 뒤에서도) 이긴 팀의 생존 유닛이 차례로 폴짝폴짝. 움직임 줄이기 설정이면 없음
  hopOf(u) {
    if (this.state !== 'over' || !u.alive || u.team !== this.winner || !u.grounded || this.reduceMotion) return 0;
    return Math.max(0, Math.sin(this.time * HOP_W + u.idx * 1.3)) * HOP_H;
  }

  // 피격 번쩍임용 흰 실루엣 (이미지마다 한 번만 만들어 재사용)
  flashSprite(img) {
    let c = FLASH.get(img);
    if (!c) {
      c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const k = c.getContext('2d');
      k.drawImage(img, 0, 0); k.globalCompositeOperation = 'source-atop'; k.fillStyle = '#fff'; k.fillRect(0, 0, c.width, c.height);
      FLASH.set(img, c);
    }
    return c;
  }

  drawUnit(g, u) {
    const set = this.sprites[u.sprite];
    const img = set[this.poseOf(u)] || set.idle;
    const h = SPRITE_H, w = h * (img.naturalWidth / img.naturalHeight);
    let sx = 1, sy = 1;
    if (u.alive && u.grounded && !u.moving) { sx = 1 + u.squash * 0.5; sy = 1 - u.squash * 0.5; }
    g.save();
    if (!u.alive) g.globalAlpha = clamp(1 - (u.deadT - FADE_START) / (FADE_END - FADE_START), 0, 1);
    g.translate(u.x, u.y + 1 - this.hopOf(u)); // 발(이미지 하단)이 지형 위 u.y
    g.scale(sx * (u.facing < 0 ? -1 : 1), sy);
    g.drawImage(img, -w / 2, -h, w, h);
    if (u.hurt > 0) { // 피격 번쩍임: 스프라이트 모양 그대로 하얗게, 0.3초 동안 줄어든다
      const base = g.globalAlpha;
      g.globalAlpha = base * Math.min(1, u.hurt / HURT_T * 1.4) * 0.85;
      g.drawImage(this.flashSprite(img), -w / 2, -h, w, h);
    }
    g.restore();
  }

  // 이름표 + HP 바를 한 블록으로 머리 위에 그린다. 이웃과 겹치면 가로로 밀어낸다.
  drawTags(g) {
    let ts = Math.min(1.7, Math.max(1, 0.8 / this.viewScale)); // 작은 화면에서는 이름표를 키움
    if (this.bigHud) ts = Math.min(2.1, ts * 1.25);   // 큰 HUD 글씨: 이름표도 25% 키움
    // 이름표 블록 객체는 유닛마다 하나를 계속 재사용 (프레임마다 배열·객체를 새로 만들지 않음). 폭은 이름·팀 표시가 바뀔 때만 다시 잰다
    const tags = this._tags || (this._tags = []);
    let nt = 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.alive) continue;
      const t = u.tag || (u.tag = { u, w: 0, x: 0, y: 0, nm: '', tm: false }), nm = u.name;
      if (t.nm !== nm || t.tm !== this.teamMarks) { t.nm = nm; t.tm = this.teamMarks; t.w = Math.max(46, Math.ceil(this.textW(nm, 700, 10)) + 10 + (this.teamMarks ? 14 : 0)); }
      t.x = u.x; t.y = u.y - TAG_TOP;
      tags[nt++] = t;
    }
    tags.length = nt;
    // 가로로 겹치는(세로 범위도 겹치는) 블록 쌍을 서로 밀어낸다
    tags.sort(byUnitX);
    for (let it = 0; it < 10; it++) {
      let moved = false;
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const p = tags[i], q = tags[j];
          if (Math.abs(p.y - q.y) >= (TAG_H + 2) * ts) continue;
          const need = ((p.w + q.w) / 2) * ts + 3 - (q.x - p.x);
          if (need > 0.5) { p.x -= need / 2; q.x += need / 2; moved = true; }
        }
      }
      if (!moved) break;
    }
    for (const t of tags) {
      t.x = clamp(t.x, (t.w / 2) * ts + 2, W - (t.w / 2) * ts - 2);
      if (ts === 1) { this.drawTag(g, t, 1); continue; }
      const ay = t.y + TAG_H; // 블록 아래 중앙을 기준으로 확대 (머리 위쪽으로 자란다)
      g.save(); g.translate(t.x, ay); g.scale(ts, ts); g.translate(-t.x, -ay);
      this.sc = ts;
      this.drawTag(g, t, ts);
      this.sc = 1;
      g.restore();
    }
  }

  drawTag(g, { u, w, x, y }, ts) {
    const col = u.tagColor, left = x - w / 2;
    // 이름표
    g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(left, y, w, 13, 4); g.fill(); g.stroke();
    if (this.teamMarks) { this.mark(g, u.team, left + 9, y + 6.5, 4.5); this.text(g, u.name, x + 7, y + 7, 10); }
    else this.text(g, u.name, x, y + 7, 10);
    // HP 바 (이름표 바로 아래, 숫자는 바 안)
    const by = y + 15;
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(left, by, w, 11);
    g.fillStyle = col; g.fillRect(left + 1, by + 1, (w - 2) * (u.hp / u.maxHp), 9);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(left + 1, by + 1, (w - 2) * (u.hp / u.maxHp), 3);
    this.text(g, String(u.hp), x, by + 6, 9);
    // 머리와 어긋났을 때 연결선 (확대 좌표계에서도 실제 머리 위치로 향하도록 보정)
    if (Math.abs(x - u.x) * ts > 6) {
      const ay = y + TAG_H, tx = x + (u.x - x) / ts, ty = ay + (u.y - 54 - ay) / ts;
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y + TAG_H); g.lineTo(tx, ty); g.stroke();
    }
    if (u === this.activeUnit && (this.state === 'aim' || this.state === 'flying' || this.state === 'strike')) {
      const ay = y - 10 + Math.sin(this.time * 6) * 3;
      g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 7, ay - 8); g.lineTo(x + 7, ay - 8); g.lineTo(x, ay + 2); g.closePath(); g.fill(); g.stroke();
    }
  }

  drawAim(g) {
    const u = this.activeUnit; if (!u) return;
    const a = rad(this.angle), f = u.facing, ox = u.x, oy = u.y - 20;
    const dx = f * Math.cos(a), dy = -Math.sin(a), pw = this.power, pcol = powerColor(pw);
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.setLineDash(DASH_AIM);
    const reach = WEAPONS[this.weapon].instant ? 220 : 62;
    g.beginPath(); g.moveTo(ox + dx * 20, oy + dy * 20); g.lineTo(ox + dx * reach, oy + dy * reach); g.stroke();
    g.setLineDash(DASH_NONE);
    this.hintDots = 0;
    if (this.trajHint && (this.drag || (this.charging && pw > 0))) this.drawHint(g, u);
    if (this.drag) { // 터치 드래그: 누른 지점 -> 손가락 위치 선과 파워 표시
      const d = this.drag;
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(d.sx, d.sy); g.lineTo(d.x, d.y); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.arc(d.sx, d.sy, 12, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(d.sx, d.sy, 12, 0, 7); g.stroke();
      g.fillStyle = pcol;
      g.beginPath(); g.arc(d.x, d.y, 9, 0, 7); g.fill();
      this.text(g, powerLabel(pw), d.x, d.y - 24, 20, '#fff');
    }
    if (this.charging || pw > 0) { // 파워 선: 조준점(반지름 약 12px) 안쪽에서 끝나도록 짧게, 반투명으로 그린다
      const len = 20 + pw * 0.38;
      g.strokeStyle = pcol; g.lineWidth = 4; g.lineCap = 'round'; g.globalAlpha = 0.7;
      g.beginPath(); g.moveTo(ox + dx * 20, oy + dy * 20); g.lineTo(ox + dx * len, oy + dy * len); g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // 조준점: 이름표·파워 선·궤적 힌트·드래그 표시보다 위(맨 마지막)에, 어두운 외곽선과 함께 그려 항상 보이게 한다. 작은 화면에서는 이름표처럼 키운다
  drawCross(g) {
    const u = this.activeUnit; if (!u) return;
    const a = rad(this.angle), cx = u.x + u.facing * Math.cos(a) * 74, cy = u.y - 20 - Math.sin(a) * 74;
    const k = Math.min(1.7, Math.max(1, 0.8 / this.viewScale));
    g.save();
    g.lineCap = 'butt'; g.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      g.strokeStyle = i ? '#ff4d3d' : 'rgba(0,0,0,0.85)'; g.lineWidth = (i ? 2.5 : 6) * k;
      g.beginPath(); g.arc(cx, cy, 8 * k, 0, 7); g.moveTo(cx - 12 * k, cy); g.lineTo(cx + 12 * k, cy); g.moveTo(cx, cy - 12 * k); g.lineTo(cx, cy + 12 * k); g.stroke();
    }
    g.restore();
  }

  // 궤적 힌트(설정 '궤적 힌트'): 지금 각도·파워로 쏘았을 때 첫 HINT_T초(약 0.6초) 동안의 포물선을 옅은 점선으로 보여 준다.
  // 실제 발사와 같은 물리(stepProj: 중력·바람 가속)로 같은 1/60초 스텝을 쓰고, 지형에 닿으면 거기서 멈춘다. 바람은 이 0.6초 동안만 반영되므로 그 뒤의 바람 영향은 보이지 않는다(실제 비행은 더 달라질 수 있음).
  // 번개·공습은 포물선이 아니므로 그리지 않는다. 임시 투사체 객체는 재사용한다
  drawHint(g, u) {
    const w = WEAPONS[this.weapon];
    if (!w || w.instant || w.airstrike) return;
    const a = rad(this.angle), v = launchSpeed(w, Math.max(8, this.power)), f = u.facing;
    const p = this._hp || (this._hp = { x: 0, y: 0, vx: 0, vy: 0, w: null, owner: null, age: 0 });
    p.x = u.x + f * Math.cos(a) * 18; p.y = u.y - 20 - Math.sin(a) * 18; p.vx = f * Math.cos(a) * v; p.vy = -Math.sin(a) * v; p.w = w; p.owner = u; p.age = 0;
    const steps = Math.round(HINT_T * 60);
    g.fillStyle = '#fff';
    let n = 0;
    for (let i = 1; i <= steps; i++) {
      if (stepProj(p, 1 / 60, this.wind, this.terrain, null)) break;
      if (i % HINT_EVERY) continue;
      g.globalAlpha = 0.75 - 0.5 * (i / steps); // 멀어질수록 옅게
      g.beginPath(); g.arc(p.x, p.y, 2.4 - 0.8 * (i / steps), 0, 7); g.fill();
      n++;
    }
    g.globalAlpha = 1;
    this.hintDots = n;
  }

  // 공습: 조준 중에는 목표 구역(폭 120px) 마커, 호출 뒤에는 1초 경고 마커(깜빡임)와 떨어지는 폭탄
  drawAir(g, aiming) {
    const a = this.air;
    this.airLabel = null;
    if (!aiming && !a) return;
    const cx = a ? a.cx : this.airX, x0 = cx - AIR_W / 2;
    const warn = a ? a.t < AIR_WARN : false, blink = warn ? 0.5 + 0.5 * Math.sin(this.time * 22) : 0;
    // 구역 아래쪽은 지형 윤곽을 따라 그린다 (구역 안 지면 높이 샘플)
    const ground = []; for (let x = x0; x <= x0 + AIR_W + 0.1; x += 6) ground.push([x, Math.min(WATER_Y, this.terrain.surfaceY(clamp(x, 0, W - 1))) - 3]);
    const gy = ground[Math.floor(ground.length / 2)][1] + 3, gmin = Math.min(...ground.map((q) => q[1]));
    const hs = this.hudScale;
    const top = clamp(gy - 170, Math.ceil(107 * hs) + 28, Math.max(Math.ceil(107 * hs) + 28, gmin - 30)), fs = Math.min(26, Math.max(13, 13 / this.viewScale));
    g.save();
    const gr = g.createLinearGradient(0, top, 0, gy);
    gr.addColorStop(0, 'rgba(255,70,50,0)'); gr.addColorStop(1, `rgba(255,70,50,${warn ? 0.22 + 0.2 * blink : 0.2})`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + AIR_W, top);
    for (let i = ground.length - 1; i >= 0; i--) g.lineTo(ground[i][0], ground[i][1]);
    g.closePath(); g.fill();
    g.strokeStyle = warn ? `rgba(255,${90 + 100 * blink | 0},60,0.95)` : 'rgba(255,200,120,0.9)'; g.lineWidth = 2.5; g.setLineDash([8, 6]);
    g.beginPath(); g.moveTo(x0, top); g.lineTo(x0, ground[0][1]); g.moveTo(x0 + AIR_W, top); g.lineTo(x0 + AIR_W, ground[ground.length - 1][1]); g.stroke();
    g.setLineDash([]); g.lineWidth = 3; g.strokeStyle = warn ? '#ff4d3d' : '#ffd27a'; g.lineJoin = 'round';
    g.beginPath(); ground.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.fillStyle = warn ? '#ff4d3d' : '#ffd27a'; // 중심을 가리키는 ▼
    const ty = top + 4 + (warn ? 0 : Math.sin(this.time * 6) * 3);
    g.beginPath(); g.moveTo(cx - 11, ty); g.lineTo(cx + 11, ty); g.lineTo(cx, ty + 17); g.closePath(); g.fill();
    g.restore();
    this.airLabel = { str: warn ? tr('air.warn', { s: Math.max(0.1, AIR_WARN - a.t).toFixed(1) }) : a ? '' : this.turnTeam === 0 ? tr('air.target') : tr('air.go'), x: clamp(cx, 90, W - 90), y: top - 8, fs, color: warn ? '#ffb0a0' : '#ffe9b0' };
    if (a) for (const b of a.bombs) if (b.p && !b.done) { // 떨어지는 폭탄
      g.save(); g.translate(b.p.x, b.p.y);
      g.fillStyle = '#2b2b2b'; g.strokeStyle = '#111'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(0, 0, 4.5, 7, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#d33'; g.beginPath(); g.moveTo(-5, -9); g.lineTo(0, -5); g.lineTo(5, -9); g.lineTo(3, -4); g.lineTo(-3, -4); g.closePath(); g.fill();
      g.restore();
    }
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
      g.fillStyle = fireBall(g); g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
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

  // 파티클: 색 문자열을 매 프레임 만들지 않도록 색은 고정 문자열, 투명도는 globalAlpha로 준다 (최대 500개)
  drawParticles(g) {
    const P = this.particles;
    if (!P.length) return;
    g.save();
    const debris = this.theme.debris;
    let dstyle = this._debrisStyle;
    if (this._debrisFor !== debris) { this._debrisFor = debris; dstyle = this._debrisStyle = `rgb(${debris})`; }
    for (let n = 0; n < P.length; n++) {
      const p = P[n], k = p.life / p.max;
      switch (p.type) {
        case 'flash':
          g.globalAlpha = 0.8 * (1 - k); g.fillStyle = '#fffac8';
          g.beginPath(); g.arc(p.x, p.y, p.r * (0.6 + k * 0.7), 0, 7); g.fill();
          break;
        case 'fire':
          g.globalAlpha = 1 - k; g.fillStyle = k < 0.3 ? '#fff096' : k < 0.65 ? '#ff9628' : '#c8321e';
          g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 7); g.fill();
          break;
        case 'smoke':
          g.globalAlpha = 0.55 * (1 - k); g.fillStyle = smokeStyle(p.color);
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
          break;
        case 'poof': { // 뽕! 연기 구름 7덩이가 퍼지고 반짝이 4개가 튄다
          const e = 1 - (1 - k) * (1 - k);
          g.globalAlpha = 0.9 * (1 - k); g.fillStyle = '#fff';
          for (let i = 0; i < 7; i++) {
            const a = i * 0.8976 + 0.3;
            g.beginPath(); g.arc(p.x + Math.cos(a) * p.r * 1.25 * e, p.y + Math.sin(a) * p.r * 0.95 * e, p.r * (0.62 - 0.28 * k), 0, 7); g.fill();
          }
          g.beginPath(); g.arc(p.x, p.y, p.r * (0.9 - 0.5 * k), 0, 7); g.fill();
          g.globalAlpha = 1 - k; g.strokeStyle = '#ffec96'; g.lineWidth = 2; g.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = i * 1.5708 + 0.785, d0 = p.r * (1.5 + 1.3 * e), d1 = d0 + 5 * (1 - k);
            g.moveTo(p.x + Math.cos(a) * d0, p.y + Math.sin(a) * d0); g.lineTo(p.x + Math.cos(a) * d1, p.y + Math.sin(a) * d1);
          }
          g.stroke();
          break;
        }
        case 'debris':
          g.globalAlpha = 1 - k; g.fillStyle = dstyle; g.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6);
          break;
        case 'spark':
          g.globalAlpha = 1 - k; g.fillStyle = p.green ? (k < 0.5 ? '#c8ffc8' : '#5ae66e') : k < 0.5 ? '#fff' : '#8cc8ff';
          g.beginPath(); g.arc(p.x, p.y, p.r * (1 - k * 0.4), 0, 7); g.fill();
          break;
        case 'splash':
          g.globalAlpha = 1 - k; g.fillStyle = '#dcf0ff';
          g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
          break;
      }
    }
    g.restore();
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
    } else if (id === 'airstrike') {
      for (const [bx, by] of [[-9, -2], [0, 3], [9, -2]]) { // 떨어지는 폭탄 3발
        g.fillStyle = '#2b2b2b'; g.beginPath(); g.ellipse(bx, by + 2, 3.6, 5.6, 0, 0, 7); g.fill();
        g.fillStyle = '#e04030'; g.beginPath(); g.moveTo(bx - 4, by - 6); g.lineTo(bx, by - 2); g.lineTo(bx + 4, by - 6); g.lineTo(bx + 2, by - 1); g.lineTo(bx - 2, by - 1); g.closePath(); g.fill();
      }
      g.strokeStyle = '#ffd24a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-12, 12); g.lineTo(12, 12); g.stroke();
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

  // 무기 바는 선택·탄약·해금·언어가 바뀔 때만 오프스크린에 다시 그리고 평소에는 한 번 찍는다
  drawWeaponBar(g) {
    const key = `${this.weapon}|${this.ammo ? this.ammo[0].join() : ''}|${this.airOk}|${this.bigHud}|${getLang()}`;
    let c = HUDC.wbar;
    if (!c) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = WBAR_H;
      c = HUDC.wbar = { cv, q: cv.getContext('2d'), key: '' };
    }
    if (c.key !== key) {
      c.key = key;
      c.q.clearRect(0, 0, W, WBAR_H);
      c.q.save(); c.q.translate(0, WBAR_H - H); // 화면 맨 아래 WBAR_H만큼만 잘라 담는다
      this.paintWeaponBar(c.q);
      c.q.restore();
    }
    g.drawImage(c.cv, 0, H - WBAR_H);
  }

  paintWeaponBar(g) {
    const big = this.bigHud, f = big ? 1.25 : 1, top = big ? H - 70 : H - 62;   // 큰 HUD 글씨: 라벨·탄약 +25%
    g.fillStyle = 'rgba(8,20,35,0.72)'; g.fillRect(0, top, W, H - top);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, top, W, 1);
    WEAPONS.forEach((w, i) => {
      const [x, y, sw, sh] = slotRect(i, big), sel = this.weapon === i;
      const ammo = this.ammo ? this.ammo[0][i] : (w.ammo ?? Infinity);
      const off = !!w.disabled, empty = !off && ammo <= 0;
      const cy = y + (big ? 28 : 22);
      g.fillStyle = sel ? 'rgba(255,226,122,0.92)' : 'rgba(255,255,255,0.12)';
      g.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(x, y, sw, sh, 7); g.fill(); g.stroke();
      g.save();
      if (off || empty) g.globalAlpha = 0.45;
      this.drawWeaponIcon(g, w.id, x + sw / 2, cy, big ? 1 : 0.95);
      this.text(g, String(i + 1), x + 9 * f, y + 9 * f, 10 * f, sel ? '#222' : '#cfe3f7', 'center');
      const lock = w.airstrike && !this.airOk;
      if (!off) this.text(g, lock ? tr('hud.lock') : ammo === Infinity ? '∞' : '×' + ammo, x + sw - 5, y + 9 * f, (lock ? 9 : 11) * f, empty ? '#ff9c9c' : sel ? '#222' : '#ffe27a', 'right');
      this.text(g, w.name, x + sw / 2, y + (big ? 48 : 42), 10 * f, sel ? '#222' : '#fff');
      g.restore();
      if (off) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.roundRect(x + sw / 2 - 18 * f, cy - 8 * f, 36 * f, 15 * f, 7 * f); g.fill();
        this.text(g, 'soon', x + sw / 2, cy, 10 * f, '#bbb');
      }
    });
  }

  drawHUD(g) {
    const dom = this.domHud, big = this.bigHud ? 1.25 : 1;
    // 작은 화면(가로 폰)에서는 상단 HUD를 키워서 글자 크기를 확보 (hs: 1~1.3). 세로 폰은 DOM HUD가 대신 그림.
    const hs = this.hudScale;
    if (!dom) this.drawTopHud(g, hs);
    // 무기 (하단 HUD)
    if (!this.touchUI) this.drawWeaponBar(g);    // 파워 바
    if (this.turnTeam === 0 && this.airMode && this.state === 'aim' && !this.touchUI) { // 공습 조준 안내 (파워 바 대신)
      this.text(g, tr('hud.air', { x: Math.round(this.airX) }), W / 2, H - 26, 12 * big);
    } else if (this.turnTeam === 0 && (this.state === 'aim' || this.state === 'flying') && !(this.touchUI && !dom)) { // 가로 터치 화면은 발사 버튼이 각도·파워를 표시
      const bx = W / 2 - 120, by = H - 30; // 얇고 반투명한 파워 바: 화면 맨 아래 가장자리에 붙여 조준선·조준점과 겹치지 않게 한다
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.roundRect(bx - 3, by - 3, 246, 16, 6); g.fill();
      g.globalAlpha = 0.7; g.fillStyle = powerGrad(g, bx); g.fillRect(bx, by, 240 * this.power / 100, 10); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.strokeRect(bx, by, 240, 10);
      if (this.lastPower) { g.fillStyle = '#fff'; g.fillRect(bx + 240 * this.lastPower / 100 - 1, by - 2, 2, 14); }
      if (!dom) this.text(g, tr('hud.aim', { a: Math.round(this.angle), p: Math.round(this.power) }), W / 2, by - 14 * big, 12 * big);
    }
    if (!dom && !this.touchUI && this.turnTeam === 1 && this.state === 'aim') this.text(g, tr('hud.foeAim'), W / 2, H - 26, 14 * big, '#fff');
    // 턴 배너: "내 차례 - 이름" / "상대 차례 - 이름"을 상단 중앙 HUD 바로 아래 하늘에 짧은 페이드로 보여줌
    if (this.banner) {
      const b = this.banner, a = Math.min(1, b.t / 0.12, (BANNER_T - b.t) / 0.35);
      const fz = Math.min(34, Math.max(18, 15 / this.viewScale)) * big;
      g.font = `800 ${fz}px "Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
      const mine = b.color === TEAMS[0].color, btxt = (this.teamMarks ? (mine ? '● ' : '◆ ') : '') + b.text; // 고대비 팀 표시: 파랑 ● / 빨강 ◆
      const bw = Math.min(W - 40, Math.ceil(g.measureText(btxt).width) + fz * 1.6), bh = fz * 1.8;
      // 상단 중앙 HUD(타이머·바람·시드 알약, 가로 폰에서는 hs배 확대)가 끝나는 곳 바로 아래에 놓아 타이머·HUD를 가리지 않게 함. 세로 폰은 DOM HUD라 맨 위
      const by = dom ? 6 : Math.ceil(107 * hs) + 8;
      g.save(); g.globalAlpha = Math.max(0, a) * 0.95;
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.roundRect(W / 2 - bw / 2, by, bw, bh, bh / 2); g.fill();
      g.strokeStyle = mine ? '#6ea8ff' : '#ff7a7a'; g.lineWidth = 2; g.stroke();
      this.text(g, btxt, W / 2, by + bh / 2 + 1, fz, mine ? '#b5d3ff' : '#ffb3b3', 'center', '800');
      g.restore();
    }
  }

  // 상단 HUD(팀 HP·타이머·바람·유닛 정보 줄·모드/시드 알약)는 값이 바뀔 때만 오프스크린에 다시 그리고 평소에는 한 번 찍는다.
  // 화면 위 기준 TOP_HUD_H(=hs 최대 1.5배일 때 알약 아래끝) 높이만 쓰므로 전체 화면 크기 복사가 아니다
  drawTopHud(g, hs) {
    let tot0 = 0, cap0 = 0, n0 = 0, tot1 = 0, cap1 = 0, n1 = 0;
    for (const u of this.units) {
      if (u.team === 0) { tot0 += u.hp; cap0 += u.maxHp; n0++; } else { tot1 += u.hp; cap1 += u.maxHp; n1++; }
    }
    const iu = this.infoUnit, urgent = this.timer <= 5 && this.state === 'aim';
    const key = `${hs}|${this.bigHud}|${this.teamMarks}|${getLang()}|${tot0}/${cap0}/${n0}|${tot1}/${cap1}/${n1}|${Math.max(0, Math.ceil(this.timer))}|${urgent}|${this.wind}|${iu ? `${iu.team}:${iu.idx}:${iu.hp}/${iu.maxHp}` : ''}|${this.modeLabel}|${this.theme.id}|${this.seed}`;
    let c = HUDC.top;
    if (!c) {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = TOP_HUD_H;
      c = HUDC.top = { cv, q: cv.getContext('2d'), key: '' };
    }
    if (c.key !== key) {
      c.key = key;
      const q = c.q;
      q.clearRect(0, 0, W, TOP_HUD_H);
      this.paintTopHud(q, hs, [[tot0, cap0, n0], [tot1, cap1, n1]], urgent);
      this.sc = 1;
    }
    g.drawImage(c.cv, 0, 0);
  }

  paintTopHud(g, hs, sums, urgent) {
    // 팀 HP
    for (let t = 0; t < 2; t++) {
      const [tot, cap, n] = sums[t];
      const x = t === 0 ? 14 : W - 14 - 230, y = 12;
      g.save(); g.translate(t === 0 ? 14 : W - 14, 12); g.scale(hs, hs); g.translate(t === 0 ? -14 : -(W - 14), -12);
      this.sc = hs;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(x, y, 230, 40, 8); g.fill();
      if (this.teamMarks) this.mark(g, t, x + 15, y + 11, 5);
      this.text(g, `${TEAMS[t].name} (${tr(t === 0 ? 'who.me' : 'who.ai')})`, x + (this.teamMarks ? 26 : 8), y + 11, 13, '#fff', 'left');
      this.text(g, `${tot}/${cap}`, x + 222, y + 11, 13, '#fff', 'right');
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 8, y + 22, 214, 10);
      g.fillStyle = TEAMS[t].color; g.fillRect(x + 8, y + 22, 214 * tot / cap, 10);
      // 유닛별 구분선
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (let k = 1; k < n; k++) g.fillRect(x + 8 + (214 * k) / n, y + 22, 1, 10);
      g.restore();
    }
    // 타이머 + 바람
    g.save(); g.translate(W / 2, 0); g.scale(hs, hs); g.translate(-W / 2, 0);
    this.sc = hs;
    const tm = Math.max(0, Math.ceil(this.timer));
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(W / 2, 30, 24, 0, 7); g.fill();
    this.text(g, String(tm), W / 2, 31, 24, urgent ? '#ff6b5a' : '#fff');
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(W / 2 - 80, 60, 160, 26, 13); g.fill();
    this.text(g, tr('hud.wind'), W / 2 - 62, 73, 12, '#cfe8ff', 'left');
    const wl = Math.abs(this.wind) * 4.5, wd = Math.sign(this.wind), cx = W / 2 + 8;
    if (wd) {
      g.strokeStyle = '#ffe27a'; g.fillStyle = '#ffe27a'; g.lineWidth = 3;
      const x1 = cx - wd * wl / 2, x2 = cx + wd * wl / 2;
      g.beginPath(); g.moveTo(x1, 73); g.lineTo(x2 - wd * 4, 73); g.stroke();
      g.beginPath(); g.moveTo(x2, 73); g.lineTo(x2 - wd * 9, 67); g.lineTo(x2 - wd * 9, 79); g.fill();
    } else this.text(g, tr('hud.none'), cx, 73, 12, '#ffe27a');
    this.text(g, String(Math.abs(this.wind)), W / 2 + 68, 73, 12, '#fff', 'right');
    g.restore();
    this.drawUnitInfo(g, hs);
    // 모드·시드 표시: 양 팀 HUD(상단 좌우)와 겹치지 않도록 바람 표시 바로 아래 중앙에 작은 알약 모양으로 그림
    const info = tr('hud.info', { label: this.modeLabel, theme: this.theme.name, seed: this.seed });
    const iw = Math.ceil(this.textW(info, 400, 11)) + 20;
    g.save(); g.translate(W / 2, 0); g.scale(hs, hs); g.translate(-W / 2, 0);
    this.sc = hs;
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(W / 2 - iw / 2, 90, iw, 17, 8.5); g.fill();
    this.text(g, info, W / 2, 98.5, 11, 'rgba(255,255,255,0.9)', 'center', '400');
    g.restore();
  }

  // 정보를 보여 줄 유닛: 마우스를 올린 유닛, 없으면 지금 차례인 유닛
  get infoUnit() {
    const h = this.hover;
    if (h && h.alive) return h;
    const a = this.activeUnit;
    return a && a.alive && ['aim', 'flying', 'strike', 'settle'].includes(this.state) ? a : null;
  }
  // 마우스 위치 (캔버스 좌표)에 있는 살아 있는 유닛 (몸통 중심에서 24px 안)
  unitAt(px, py) {
    let best = null, bd = 24;
    for (const u of this.units) {
      if (!u.alive) continue;
      const d = Math.hypot(u.x - px, Math.max(0, Math.abs(py - (u.y - BODY_CY)) - BODY_HALF));
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  // 유닛 정보 줄: 해당 팀 HP 박스 바로 아래에 이름 · HP · 특성을 표시 (가로 폰에서는 HUD와 같은 배율 hs)
  drawUnitInfo(g, hs) {
    const u = this.infoUnit;
    if (!u) return;
    const left = u.team === 0, x = left ? 14 : W - 14 - 230, y = 56, ax = left ? 14 : W - 14;
    g.save(); g.translate(ax, 12); g.scale(hs, hs); g.translate(-ax, -12);
    this.sc = hs;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.roundRect(x, y, 230, 34, 8); g.fill();
    g.strokeStyle = u.tagColor; g.lineWidth = 1.5; g.stroke();
    this.text(g, u.name, x + 8, y + 10, 12, '#fff', 'left');
    this.text(g, `HP ${u.hp}/${u.maxHp}`, x + 222, y + 10, 12, '#fff', 'right');
    const tr = `${u.trait.name}: ${u.trait.desc}`;
    this.text(g, tr, x + 8, y + 25, Math.min(11, (11 * 214) / Math.max(1, this.textW(tr, 600, 11))), '#ffe27a', 'left', '600'); // 길면 글자를 줄여 박스 안에 맞춤
    g.restore();
  }

  get modeLabel() {
    return this.mode === 'stage' ? tr('mode.stage', { n: this.stage }) : this.mode === 'endless' ? tr('mode.endless', { n: this.wave }) : DIFF[this.difficulty]?.label || '';
  }
}

// ---------- 로딩 화면 예열 ----------
// 첫 경기에서 처음 쓰는 순간 생기는 프레임 끊김을 없애기 위해 로딩 화면에서 미리 해 두는 작업들:
// 글자 그림 캐시(HP 숫자·피해 숫자·타이머), 그라디언트, 피격 흰 실루엣, 무기 바·상단 HUD 오프스크린 캔버스, 모든 무기·폭발·화염·상자·번개·공습 그리기 경로(JIT)를
// 화면 밖 캔버스에 한 번씩 돌려 본다. 버려지는 임시 Game을 쓰고 캐시는 모듈 전역이라 진짜 경기가 그대로 이어받는다.
// 반환: 순서대로 실행할 작업(함수) 배열 — main.js가 하나씩 실행하며 진행 막대를 채운다
export function warmupSteps(sprites, { viewScale = 1, bigHud = false, teamMarks = false, domHud = false, touchUI = false } = {}) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const w = new Game(sprites);
  Object.assign(w, { viewScale, bigHud, teamMarks, domHud, touchUI });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { w.update(1 / 60); w.draw(g); } };
  const u0 = () => w.units.find((u) => u.team === 0 && u.alive) || w.units[0];
  const ts = Math.min(1.7, Math.max(1, 0.8 / viewScale)) * (bigHud ? 1.25 : 1), hs = w.hudScale;
  const bake = (sc, size, color, weight, strs) => { w.sc = sc; for (const t of strs) w.text(g, t, 0, 0, size, color, 'center', weight); w.sc = 1; };
  const nums = (a, b, f = String) => Array.from({ length: b - a + 1 }, (_, i) => f(a + i));
  const fs = Math.min(34, Math.max(18, 15 / viewScale));
  return [
    () => { w.newMatch('normal', stageConfig(7)); tick(3); },                       // 눈 내리는 스테이지 7: 배경·지형·유닛·이름표·HUD·턴 배너·눈 날씨
    () => { for (const th of THEMES) { const wt = makeWeather(th); if (wt) { stepWeather(wt, 1 / 60, 3); drawWeather(g, wt); } } }, // 네 가지 날씨 그리기 경로
    () => { // 터치 드래그 조준 + 궤적 힌트
      w.trajHint = true; w.power = 60; w.drag = { sx: 600, sy: 300, x: 540, y: 340, max: 170 }; w.weapon = 0; tick(2);
      w.drag = null; w.power = 0; w.trajHint = false;
    },
    () => { // 무기별 투사체·공습 조준 마커
      for (let i = 0; i < WEAPONS.length; i++) {
        const wp = WEAPONS[i]; w.weapon = i; if (wp.airstrike) w.airX = 450;
        if (!wp.instant && !wp.airstrike) { w.proj = { x: 300, y: 200, vx: 100, vy: -50, w: wp, owner: u0(), age: 0.5, fuse: 2 }; w.state = 'flying'; w.draw(g); w.proj = null; w.state = 'aim'; }
        w.draw(g);
      }
      w.weapon = 0; w.state = 'aim';
    },
    () => { w.explode(u0().x + 20, u0().y - 20, WEAPONS[1]); tick(40); },            // 폭발: 크레이터·파티클·피격 번쩍임·피해 숫자
    () => { w.igniteAt(400, 300, WEAPONS[4]); w.dropCrate(); tick(25); },              // 화염 지대·보급 상자
    () => { w.weapon = 3; w.state = 'aim'; w.turnTeam = 0; w.fireLightning(u0(), WEAPONS[3]); tick(20); w.state = 'aim'; }, // 번개
    () => { w.weapon = 5; w.state = 'aim'; w.turnTeam = 0; w.airX = 420; w.fireAirstrike(u0(), WEAPONS[5]); tick(100); }, // 공습
    () => { w.floaters.length = 0; bake(1, fs, '#ff3b30', '800', nums(1, 60, (n) => '-' + n)); },              // 피해 숫자
    () => { bake(1, fs, '#ff3b30', '800', nums(61, 120, (n) => '-' + n)); bake(1, fs, '#5dff6e', '800', ['+5', '+10', '+30']); },
    () => bake(ts, 9, '#fff', '700', nums(0, 115)),                                        // 이름표 HP 숫자
    () => { bake(hs, 24, '#fff', '700', nums(0, 30)); bake(hs, 24, '#ff6b5a', '700', nums(0, 5)); bake(hs, 12, '#fff', '700', nums(0, 14)); }, // 타이머·바람 숫자
    () => { for (const k of new Set(Object.keys(sprites))) warmFlash(sprites, [k]); },     // 피격 흰 실루엣
  ];
}
// 피격 번쩍임용 흰 실루엣을 미리 만든다 (keys: 캐릭터 키). 뒤에서 받은 캐릭터도 받은 뒤에 한 번 불러 준다
export function warmFlash(sprites, keys) {
  const g = Game.prototype;
  for (const k of keys) for (const pose of ['hit', 'down']) { const im = sprites[k] && sprites[k][pose]; if (im && im.naturalWidth) g.flashSprite(im); }
}
