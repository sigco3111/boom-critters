// 진행 상황 저장 (localStorage): 해금된 스테이지, 스테이지별 최고 별, 무한 모드 최고 기록
const KEY = 'boom-critters-progress-v1';
export const STAGES = 10;

function blank() { return { unlocked: 1, stars: {}, endlessBest: 0 }; }

export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || typeof d !== 'object') return blank();
    const stars = {};
    for (let i = 1; i <= STAGES; i++) { const v = Number(d.stars && d.stars[i]); if (v >= 1 && v <= 3) stars[i] = v | 0; }
    return {
      unlocked: Math.min(STAGES, Math.max(1, Number(d.unlocked) | 0 || 1)),
      stars,
      endlessBest: Math.max(0, Number(d.endlessBest) | 0),
    };
  } catch (e) { return blank(); }
}

function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 저장 불가 환경은 무시 */ } }

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
