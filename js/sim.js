// 헤드리스 AI 대 AI 시뮬레이션 (밸런스 측정용). 브라우저 콘솔에서: await __sim(20, { stage: 5, skill: 'average' })
// 우리 팀(팀 0)을 숙련도 프로필의 AI가 조작하고, 렌더링 없이(지형은 높이맵 충돌 배열만) 고정 시간 스텝으로 경기를 끝까지 돌린다.
import { Game, STAGE_COUNT, WEAPONS, W, H, WATER_Y, stageConfig, quickConfig, waveConfig } from './game.js?v=2026111047';

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
  const cfg = stage ? stageConfig(stage) : quickConfig(diff, opts.map); // opts.map: { theme, terrain } (예: { terrain: 'canyon' })
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

// ---------- 소크(내구) 테스트: 많은 경기를 돌리며 예외·멈춘 턴·NaN·월드 이탈·공중에 멈춘 상자를 찾는다 ----------
// 우리 팀을 AI(casual/average/skilled) 또는 무작위 입력의 가짜 사람('human': 이동·점프·무기 교체·충전·공습 마커)이 조작한다.
// 반환 { matches, issues: { 종류: { n, example } }, maxTurnSec } — issues가 비어 있으면 문제 없음.
const KEYS0 = () => ({ left: false, right: false, up: false, down: false });
function fuzzHuman(g, st, dt) {
  if (g.state !== 'aim' || g.isAI(g.turnTeam)) { g.keys = KEYS0(); return; }
  st.t += dt;
  if (st.t > st.next) {
    st.t = 0; st.next = 0.2 + Math.random() * 1.5;
    const k = g.keys = KEYS0(), r = Math.random();
    if (r < 0.2) k.left = true; else if (r < 0.4) k.right = true;
    if (Math.random() < 0.3) k.up = true; else if (Math.random() < 0.2) k.down = true;
    if (Math.random() < 0.15) g.playerJump();
    if (Math.random() < 0.4) g.setWeapon(Math.floor(Math.random() * WEAPONS.length));
    if (g.airMode && Math.random() < 0.5) g.setAirX(Math.random() * W);
    if (Math.random() < 0.25) st.fireAt = Math.random() * 1.8;
    if (Math.random() < 0.05) g.aimTo(Math.random() * W, Math.random() * H);
  }
  if (st.fireAt === undefined) return;
  if (g.airMode) { g.beginCharge(); st.fireAt = undefined; }
  else if (!g.charging) { g.beginCharge(); st.chg = 0; }
  else if ((st.chg += dt) >= st.fireAt) { g.releaseCharge(); st.fireAt = undefined; }
}
function checkWorld(g, add, dt) {
  const fin = Number.isFinite;
  for (const u of g.units) {
    if (![u.x, u.y, u.vx, u.vy, u.hp].every(fin)) add('유닛 좌표·HP가 NaN', JSON.stringify([u.x, u.y, u.hp]));
    if (u.x < 0 || u.x > W) add('유닛이 월드 좌우 밖', `x=${u.x}`);
    if (u.alive && (u.y < -50 || u.y > WATER_Y + 5)) add('살아 있는 유닛이 월드 위아래 밖', `y=${u.y}`);
    if (u.hp < 0 || u.hp > u.maxHp) add('HP 범위 밖', `hp=${u.hp}/${u.maxHp}`);
    if (u.alive) { // 공중에 12초 넘게 떠 있으면 멈춘 것
      u.air = u.grounded ? 0 : (u.air || 0) + dt;
      if (u.air > 12) add('유닛이 12초 넘게 공중', `x=${u.x.toFixed(0)} y=${u.y.toFixed(0)}`);
    }
  }
  for (const c of g.crates) {
    if (![c.x, c.y].every(fin)) add('상자 좌표가 NaN', '');
    c.still = c.y === c.ly ? (c.still || 0) + dt : 0; c.ly = c.y;
    if (!c.landed && c.still > 1.5) add('상자가 공중에 멈춤', `x=${c.x.toFixed(0)} y=${c.y.toFixed(0)}`);
  }
  if (g.proj && ![g.proj.x, g.proj.y].every(fin)) add('투사체 좌표가 NaN', '');
  if (![g.wind, g.timer, g.angle, g.power].every(fin)) add('바람·타이머·각도·파워가 NaN', '');
}
export async function soak(n = 2, opts = {}) {
  const issues = {}, t0 = Date.now();
  const stages = opts.stages || Array.from({ length: STAGE_COUNT }, (_, i) => i + 1);
  const skills = opts.skills || ['casual', 'average', 'skilled', 'human'];
  const cfgs = stages.map((s) => [`stage${s}`, stageConfig(s), 'normal'])
    .concat(['easy', 'normal', 'hard'].map((d) => [`quick-${d}`, quickConfig(d), d]), [1, 3, 5].map((w) => [`wave${w}`, waveConfig(w), 'normal']));
  const errs = [], ce = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  let matches = 0, maxTurn = 0;
  try {
    for (const [label, cfg, diff] of cfgs) for (const sk of skills) for (let i = 0; i < n; i++) {
      const ctx = `${label}/${sk}`, add = (k, ex) => { const e = issues[k] || (issues[k] = { n: 0, example: `${ctx} ${ex}` }); e.n++; };
      const g = new Game({}); g.headless = true; g.onOver = () => {}; g.onWave = () => {};
      g.sim = { skill: [SKILLS[sk] || null, null], err: null };
      g.newMatch(diff, { ...cfg });
      const dt = [1 / 30, 1 / 60, 0.033][matches % 3], st = { t: 0, next: 0.3 };
      let steps = 0, lastTurn = g.turnNo, turnT = g.time;
      try {
        while (g.state !== 'over' && steps++ < 30 * 60 * 40) {
          if (g.state === 'wave' && g.wave >= 4) break; // 무한 모드는 웨이브 4까지만
          if (!SKILLS[sk]) fuzzHuman(g, st, dt);
          g.update(dt);
          checkWorld(g, add, dt);
          if (g.turnNo !== lastTurn) { const d = g.time - turnT; maxTurn = Math.max(maxTurn, d); if (d > 60) add('한 턴이 게임 시간 60초 초과', `${d.toFixed(0)}s`); lastTurn = g.turnNo; turnT = g.time; }
          if (g.time - turnT > 90) { add('턴이 멈춤(90초)', `state=${g.state}`); break; }
        }
        if (g.state !== 'over' && g.mode !== 'endless' && steps > 30 * 60 * 40) add('경기가 40분 안에 끝나지 않음', '');
      } catch (e) { add('예외: ' + e.message, String(e.stack || '').split('\n').slice(0, 3).join(' | ')); }
      matches++;
      if (matches % 4 === 0) await tick();
    }
  } finally { console.error = ce; }
  if (errs.length) issues['console.error 발생'] = { n: errs.length, example: errs[0].slice(0, 200) };
  return { matches, issues, maxTurnSec: +maxTurn.toFixed(1), ms: Date.now() - t0 };
}
export { STAGE_COUNT };
