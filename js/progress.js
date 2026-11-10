// 진행 상황 저장 (localStorage): 해금된 스테이지, 스테이지별 최고 별, 무한 모드 최고 기록
// 저장소는 storage.js를 거치므로 localStorage가 막힌 환경에서도 이번 접속 동안은 메모리에 유지된다
import { local } from './storage.js?v=2026111044';
const KEY = 'boom-critters-progress-v1';
export const STAGES = 10;

function blank() { return { unlocked: 1, stars: {}, endlessBest: 0, best: {} }; }

// 스테이지별 최고 기록 항목: turns·shots·taken은 작을수록, dealt는 클수록 좋다 (승리한 경기만 기록)
export const BEST_KEYS = { turns: -1, shots: -1, taken: -1, dealt: 1 };

export function load() {
  try {
    const d = JSON.parse(local.get(KEY));
    if (!d || typeof d !== 'object') return blank();
    const stars = {};
    for (let i = 1; i <= STAGES; i++) { const v = Number(d.stars && d.stars[i]); if (v >= 1 && v <= 3) stars[i] = v | 0; }
    const best = {};
    for (let i = 1; i <= STAGES; i++) {
      const b = d.best && d.best[i];
      if (!b || typeof b !== 'object') continue;
      const o = {};
      for (const k in BEST_KEYS) { const v = Number(b[k]); if (Number.isFinite(v) && v >= 0) o[k] = Math.round(v); }
      if (Object.keys(o).length === Object.keys(BEST_KEYS).length) best[i] = o;
    }
    return {
      best,
      unlocked: Math.min(STAGES, Math.max(1, Number(d.unlocked) | 0 || 1)),
      stars,
      endlessBest: Math.max(0, Number(d.endlessBest) | 0),
    };
  } catch (e) { return blank(); }
}

function save(d) { try { local.set(KEY, JSON.stringify(d)); } catch (e) { /* 저장 불가 환경은 무시 */ } }

// 스테이지 승리 기록: 별은 최고값만 유지하고 다음 스테이지를 해금. 반환: { stars, best, unlockedNext }
export function completeStage(stage, stars) {
  const d = load();
  const prev = d.stars[stage] || 0;
  d.stars[stage] = Math.max(prev, stars);
  const next = Math.min(STAGES, stage + 1);
  const unlockedNext = next > d.unlocked;
  d.unlocked = Math.max(d.unlocked, next);
  save(d);
  return { stars, best: d.stars[stage], unlockedNext };
}

// 무한 모드 기록 갱신. 반환: 신기록 여부
export function recordEndless(score) {
  const d = load();
  if (score <= d.endlessBest) return false;
  d.endlessBest = score; save(d);
  return true;
}

// 스테이지 승리 기록: 항목별로 이전 최고와 비교해 갱신하고 저장. 반환: { prev(이전 최고 | null), best(저장된 최고), isNew: { 항목: true } }
// 첫 클리어는 prev가 null (모든 항목이 isNew)
export function recordStats(stage, st) {
  const d = load(), prev = d.best[stage] || null, best = { ...(prev || {}) }, isNew = {};
  for (const k in BEST_KEYS) {
    const v = Math.max(0, Math.round(st[k] || 0));
    if (!prev || (BEST_KEYS[k] < 0 ? v < prev[k] : v > prev[k])) { best[k] = v; isNew[k] = true; }
  }
  d.best[stage] = best; save(d);
  return { prev, best, isNew };
}

// 저장된 스테이지별 최고 기록 (없으면 null)
export function bestOf(stage) { return load().best[stage] || null; }

// 설정 저장 (localStorage 'boom-prefs-v1'): 빠른 대전 난이도, 큰 HUD 글씨, 고대비 팀 표시. 진행 기록과 별도 키
const PREF_KEY = 'boom-prefs-v1';
export const DIFFS = ['easy', 'normal', 'hard'];
export function loadPrefs() {
  const p = { difficulty: 'normal', bigHud: false, contrast: false, vibration: true, hint: null };
  try {
    const d = JSON.parse(local.get(PREF_KEY));
    if (d && typeof d === 'object') {
      if (DIFFS.includes(d.difficulty)) p.difficulty = d.difficulty;
      p.bigHud = d.bigHud === true; p.contrast = d.contrast === true;
      p.vibration = d.vibration !== false; // 저장값이 없으면 켬
      p.hint = typeof d.hint === 'boolean' ? d.hint : null; // null = 기기 기본값(터치 켬 / 데스크톱 끔)
    }
  } catch (e) { /* 기본값 */ }
  return p;
}
export function savePrefs(patch) {
  const p = { ...loadPrefs(), ...patch };
  try { local.set(PREF_KEY, JSON.stringify(p)); } catch (e) { /* 저장 불가 환경은 무시 */ }
  return p;
}
