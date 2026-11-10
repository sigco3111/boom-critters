// 헤드리스 AI 대 AI 시뮬레이션 (밸런스 측정용). 브라우저 콘솔에서: await __sim(20, { stage: 5, skill: 'average' })
// 우리 팀(팀 0)을 숙련도 프로필의 AI가 조작하고, 렌더링 없이(지형은 높이맵 충돌 배열만) 고정 시간 스텝으로 경기를 끝까지 돌린다.
import { Game, STAGE_COUNT, stageConfig } from './game.js?v=2026111024';

// 플레이어 숙련도 프로필: 각도 오차(°, 표준편차) · 파워 오차 · pick(상위 후보 중 무작위) · basic(대포탄·로켓만 사용)
export const SKILLS = {
  casual: { a: 6, p: 12, pick: true, basic: true },   // 가끔 하는 사람: 크게 빗나가고 특수 무기를 거의 안 씀
  average: { a: 3, p: 6, pick: false, basic: false }, // 보통: 빠른 대전 '보통' 수준
  skilled: { a: 1.5, p: 3, pick: false, basic: false }, // 숙련자
};
const DT = 1 / 30, MAX_TURNS = 160; // 양 팀 합산 턴 상한 (넘으면 무승부 처리)
const tick = () => new Promise((r) => setTimeout(r, 0));

// 한 경기. 반환 { winner(0|1|-1), turns(우리 팀 턴 수), hpLeft(우리 팀 남은 HP), alive, timeout, sec }
export function playOne(cfg, diff, skill, err = null) {
  const g = new Game({});
  g.headless = true;
  g.sim = { skill: [skill, null], err };
  g.onOver = () => {};
  g.onWave = () => {};
  g.newMatch(diff, cfg);
  let steps = 0, mine = 0, lastTurn = g.turnNo;
  while (g.state !== 'over' && g.turnNo < MAX_TURNS && steps < 200000) {
    g.update(DT); steps++;
    if (g.turnNo !== lastTurn) { lastTurn = g.turnNo; if (g.turnTeam === 0) mine++; }
  }
  const me = g.units.filter((u) => u.team === 0);
  return {
    winner: g.state === 'over' ? g.winner : -2, turns: mine, timeout: g.state !== 'over',
    hpLeft: me.reduce((s, u) => s + (u.alive ? u.hp : 0), 0), alive: me.filter((u) => u.alive).length, sec: steps * DT,
  };
}

// n경기 시뮬레이션. opts: { stage: 1~10 (생략하면 빠른 대전), diff: 'easy'|'normal'|'hard', skill: 'casual'|'average'|'skilled'|{a,p,pick,basic}, err: {a,p,pick} (적 AI 오차를 직접 지정, 생략하면 게임 설정) }
export async function sim(n = 20, opts = {}) {
  const skill = typeof opts.skill === 'object' ? opts.skill : SKILLS[opts.skill || 'average'];
  const stage = opts.stage | 0, diff = opts.diff || 'normal';
  const cfg = stage ? stageConfig(stage) : { mode: 'quick' };
  const r = { stage: stage || 'quick:' + diff, skill: typeof opts.skill === 'string' ? opts.skill : opts.skill ? 'custom' : 'average', games: n, wins: 0, losses: 0, draws: 0, timeouts: 0 };
  let turns = 0, hp = 0, alive = 0, t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const m = playOne(cfg, diff, skill, opts.err || null);
    if (m.timeout) r.timeouts++;
    else if (m.winner === 0) { r.wins++; hp += m.hpLeft; alive += m.alive; }
    else if (m.winner === 1) r.losses++;
    else r.draws++;
    turns += m.turns;
    if (i % 2 === 1) await tick(); // 브라우저가 멈추지 않도록 양보
  }
  r.winRate = +(r.wins / n).toFixed(2);
  r.avgTurns = +(turns / n).toFixed(1);
  r.avgAliveOnWin = r.wins ? +(alive / r.wins).toFixed(2) : 0;
  r.avgHpOnWin = r.wins ? Math.round(hp / r.wins) : 0;
  r.ms = Date.now() - t0;
  return r;
}

// 스테이지별 승률 표 (기본: 1·3·5·7·10 스테이지 × casual/average/skilled)
export async function table(n = 20, stages = [1, 3, 5, 7, 10], skills = ['casual', 'average', 'skilled']) {
  const rows = [];
  for (const s of stages) for (const k of skills) rows.push(await sim(n, { stage: s, skill: k }));
  if (typeof console.table === 'function') console.table(rows.map((r) => ({ stage: r.stage, skill: r.skill, winRate: r.winRate, avgTurns: r.avgTurns, alive: r.avgAliveOnWin, hp: r.avgHpOnWin, timeouts: r.timeouts, ms: r.ms })));
  return rows;
}
export { STAGE_COUNT };
