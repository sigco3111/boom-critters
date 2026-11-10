// 진입점: 에셋 로딩, 입력, UI, 메인 루프
// 캐시 버전: index.html의 ?v=, 모듈 import의 ?v=, 크레딧 화면 표시와 함께 올린다 (배포마다 갱신)
const VERSION = '2026111035';
import { Game, W, H, TEAMS, CHARACTERS, WALK_FRAMES, WEAPONS, STAGE_COUNT, DIFF, quickConfig, stageConfig, waveConfig } from './game.js?v=2026111035';
import * as audio from './audio.js?v=2026111035';
import * as progress from './progress.js?v=2026111035';
import { MenuBg } from './menubg.js?v=2026111035';
import * as store from './storage.js?v=2026111035';

const POSES = ['idle', ...Array.from({ length: WALK_FRAMES }, (_, i) => 'walk' + i), 'jump', 'fall', 'hit', 'attack0', 'hold', 'down'];
const CHAR_KEYS = CHARACTERS.flat().map(([k]) => k);
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
{ // 크레딧 화면 버전 표시: HTML(스타일·스크립트 주소)과 실제로 불러온 스크립트 버전이 다르면 오래된 캐시라고 알려줌
  const html = $('verHtml')?.textContent.trim() || '', js = $('verJs');
  if (js) {
    js.textContent = VERSION;
    if (html !== VERSION) { js.textContent = `${VERSION} (페이지 ${html || '없음'}와 다름 - 새로고침하세요)`; js.classList.add('stale'); }
  }
}
canvas.width = W; canvas.height = H;

function loadImages() {
  const load = (key, pose) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`이미지 로드 실패: ${key}/${pose}`));
    im.src = `assets/toon/${key}/${pose}.png`;
  });
  return Promise.all(CHAR_KEYS.map(async (key) => {
    const imgs = await Promise.all(POSES.map((p) => load(key, p)));
    return [key, Object.fromEntries(POSES.map((p, i) => [p, imgs[i]]))];
  })).then(Object.fromEntries);
}

// 브라우저 정책상 소리는 사용자 동작 뒤에만 가능 — iOS Safari는 touchstart/pointerdown이 아니라 touchend·click·keydown(제스처 완료)부터 인정한다.
// 이 입력들에서 오디오 컨텍스트를 만들고/깨우고(suspended·interrupted) 배경음악을 시작한다. 이미 running이면 가벼운 확인만 하므로 계속 걸어 둔다
// (전화·알람으로 interrupted 되거나 탭을 다녀온 뒤에도 다음 탭에서 다시 켜짐)
function unlockAudio() { try { audio.unlock(); } catch (e) { /* 소리 없이 진행 */ } }
['touchend', 'click', 'keydown', 'pointerup'].forEach((t) => window.addEventListener(t, unlockAudio, true));

// 터치 화면 판별: 주 입력이 손가락(coarse)이거나 좁은 화면이거나, 실제 터치 입력이 한 번이라도 들어오면 켠다
// 세로 화면 안내(가로로 돌리면 더 크게 보임): 닫으면 이번 접속 동안 다시 안 보임
if (store.session.get('boom-hint-off') === '1') document.body.classList.add('hint-off');
$('rotateHintClose').addEventListener('click', () => {
  document.body.classList.add('hint-off');
  store.session.set('boom-hint-off', '1');
});

const prefs = progress.loadPrefs();   // 저장된 설정: 난이도·큰 HUD 글씨·고대비 팀 표시
let game = null, difficulty = prefs.difficulty, touchSticky = false;
const coarseMQ = window.matchMedia('(pointer: coarse)');
const portraitMQ = window.matchMedia('(orientation: portrait)');
const motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const looksTouch = () => touchSticky || coarseMQ.matches || innerWidth <= 820 || (innerHeight <= 500 && innerWidth <= 1000)
  || (('ontouchstart' in window || navigator.maxTouchPoints > 0) && !window.matchMedia('(any-pointer: fine)').matches);
function setTouchUI(forceOn) {
  if (forceOn) touchSticky = true;
  const on = looksTouch();
  document.body.classList.toggle('touch', on);
  // 세로 폰이면 상단 HUD를 캔버스 대신 DOM HUD(#hud)로 표시해 글자를 14px 이상으로 유지
  const dom = on && portraitMQ.matches;
  document.body.classList.toggle('domhud', dom);
  if (game) { game.touchUI = on; game.domHud = dom; }
}
setTouchUI();
// 크기·방향 변경: 회전 중에는 resize가 연달아 오고 iOS는 orientationchange 직후 innerWidth가 아직 옛 값이므로 잠깐 모아서(디바운스) 처리한다.
// 캔버스는 CSS로 늘어나므로 경기 상태는 그대로 두고 터치 UI 판별과 글자 배율만 다시 계산한다
let viewTimer = 0, viewSync = null;
function onViewportChange() {
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => { setTouchUI(); if (viewSync) viewSync(); }, 150);
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', () => { onViewportChange(); setTimeout(onViewportChange, 500); });
window.visualViewport?.addEventListener('resize', onViewportChange);
coarseMQ.addEventListener?.('change', () => setTouchUI());
portraitMQ.addEventListener?.('change', () => setTouchUI());
let endlessRecord = false;
let current = { mode: 'quick' };   // 현재/마지막 매치: { mode: 'quick'|'stage'|'endless', stage? }
const weaponBtns = [1, 2, 3, 4, 5, 6].map((n) => $('bW' + n)).filter(Boolean); // 6번 공습 버튼은 index.html에 있을 때만
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
// 설정·크레딧·도움말 같은 모달이 열려 있으면 경기를 멈추고 게임 키 입력을 막음
let modalOpen = false;
const MODALS = ['settingsScreen', 'helpScreen', 'creditsScreen', 'pauseScreen', 'tutorialScreen'].filter((id) => document.getElementById(id)); // 없는 화면(구버전 HTML)은 제외

// 첫 실행 튜토리얼 (4단계). 본 적이 있으면 localStorage 플래그로 다시 띄우지 않고, 게임 방법 화면의 '튜토리얼 보기'로 언제든 다시 볼 수 있다
const TUT_KEY = 'boom-tutorial-done';
const TUT_STEPS = [
  { icon: '🏃', title: '이동과 점프', lines: [['키보드', 'A·D (또는 ←·→)로 걷고, W로 점프'], ['터치', '화면의 ◀ ▶ 와 점프 버튼'], ['팁', '턴마다 30초! 같은 팀 유닛이 차례로 움직여요']] },
  { icon: '🎯', title: '조준하고 힘을 모아 발사', lines: [['키보드', '↑·↓ 로 각도 → Space를 꾹 눌러 파워를 모았다가 떼면 발사'], ['터치', '오른쪽 화면을 끌어 각도·파워를 정하고 손을 떼면 발사 (발사 버튼 꾹도 가능)'], ['팁', '바람 화살표를 보고 보정하세요']] },
  { icon: '💣', title: '무기 1~6', lines: [['교체', '숫자 1~6 키 또는 무기 버튼'], ['종류', '1 대포탄 · 2 로켓 · 3 수류탄(3초 뒤 폭발) · 4 번개(직선) · 5 화염탄(불길 3턴) · 6 공습(목표 지정 후 폭탄 5발)'], ['탄약', '3~6번은 개수가 제한돼요 (공습은 스테이지 4부터)']] },
  { icon: '📦', title: '보급 상자와 화염 지대', lines: [['상자', '4턴마다 낙하산 상자가 떨어져요. 닿으면 HP +30'], ['화염', '불길 안에 서 있으면 턴 시작 때 8 피해 — 벗어나세요'], ['주의', '물에 빠지면 즉사! 섬 가장자리와 구덩이를 조심']] },
];

// 결과 화면 통계 패널 (#resultStats가 있을 때만): 발사 횟수·준 피해·받은 피해·사용한 무기·턴.
// best가 있으면(스테이지 모드) 항목별로 '신기록!'·'첫 기록' 또는 이전 최고를 함께 보여 준다.
const STAT_ROWS = [['shots', '발사 횟수', '발'], ['dealt', '준 피해', ''], ['taken', '받은 피해', ''], ['weapons', '사용한 무기', '종'], ['turns', '우리 턴', '턴']];
function renderStats(st, rec) {
  const box = $('resultStats');
  if (!box) return;
  const wname = (id) => (WEAPONS.find((w) => w.id === id) || { name: id }).name;
  const used = Object.entries(st.wpn).sort((a, b) => b[1] - a[1]);
  box.textContent = '';
  for (const [key, label, unit] of STAT_ROWS) {
    const cell = document.createElement('div'), k = document.createElement('span'), v = document.createElement('b'), note = document.createElement('small');
    cell.className = 'rs'; k.className = 'rk'; v.className = 'rv';
    k.textContent = label;
    v.textContent = key === 'weapons' ? `${used.length}${unit}` : `${st[key]}${unit}`;
    if (key === 'weapons') note.textContent = used.map(([id, n]) => `${wname(id)}×${n}`).join(' · ') || '-';
    else if (rec && key !== 'weapons') {
      if (rec.isNew && rec.isNew[key]) { note.textContent = rec.first ? '첫 기록' : '신기록!'; note.className = 'newbest'; }
      else if (rec.best && rec.best[key] !== undefined) note.textContent = `최고 ${rec.best[key]}${unit}`;
    }
    cell.append(k, v, note);
    box.appendChild(cell);
  }
  box.classList.remove('hidden');
}

// 결과 공유: navigator.share가 있으면 공유 창, 없거나 실패하면 같은 글을 클립보드에 복사하고 작은 토스트로 알린다
const GAME_URL = 'https://sigco3111.github.io/boom-critters/';
let shareText = '';
let toastTimer = 0;
function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
async function copyText(t) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { /* 아래 대체 방법으로 */ }
  try { // 권한이 없거나 http 같은 환경: 임시 textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
async function shareResult() {
  if (!shareText) return;
  const text = shareText;
  if (navigator.share) {
    try { await navigator.share({ title: '붐 크리터스', text }); return; } catch (e) {
      if (e && e.name === 'AbortError') return; // 사용자가 공유 창을 닫음
    }
  }
  showToast(await copyText(text) ? '결과를 클립보드에 복사했어요' : `복사하지 못했어요. 주소: ${GAME_URL}`);
}

function showResult(winner) {
  setTimeout(() => {
    const mode = current.mode, won = winner === 0;
    let title, sub = '', starN = 0;
    if (mode === 'endless') {
      const score = game.cleared, record = endlessRecord;
      title = '게임 오버';
      sub = `클리어한 웨이브: ${score} · 최고 기록: ${progress.load().endlessBest}${record && score > 0 ? ' (신기록!)' : ''}`;
    } else if (mode === 'stage') {
      title = won ? `스테이지 ${current.stage} 클리어!` : '패배...';
      if (won) {
        const alive = game.units.filter((u) => u.team === 0 && u.alive).length;
        starN = Math.max(1, Math.min(3, alive));
        const r = progress.completeStage(current.stage, starN);
        sub = `생존 ${alive}마리 · 최고 ${r.best}개${r.unlockedNext && current.stage < STAGE_COUNT ? ` · 스테이지 ${current.stage + 1} 해금!` : ''}`;
      } else sub = winner === 1 ? '우리 팀이 모두 쓰러졌습니다.' : '양 팀이 모두 쓰러졌습니다.';
    } else {
      title = won ? '승리!' : winner === 1 ? '패배...' : '무승부';
      sub = won ? '상대 팀을 모두 쓰러뜨렸습니다.' : winner === 1 ? '우리 팀이 모두 쓰러졌습니다.' : '양 팀이 모두 쓰러졌습니다.';
    }
    const dl = $('resultDiff');
    if (dl) { // 빠른 대전: 고른 난이도와 적 수를 결과 화면에 표시
      const d = DIFF[current.diff];
      dl.textContent = mode === 'quick' && d ? `난이도: ${d.label} · 적 ${d.enemies}마리` : '';
      dl.classList.toggle('hidden', !(mode === 'quick' && d));
    }
    let rec = null;
    if (mode === 'stage') {
      if (won) { const r = progress.recordStats(current.stage, game.stats); rec = { ...r, first: !r.prev }; }
      else rec = { best: progress.bestOf(current.stage), isNew: {} };
    }
    { // 공유 글: 모드/스테이지 · 결과 · 별 + 게임 주소
      const word = won ? '승리' : winner === 1 ? '패배' : '무승부';
      let line;
      if (mode === 'endless') line = `붐 크리터스 무한 모드 - 웨이브 ${game.cleared} 클리어${endlessRecord && game.cleared > 0 ? ' (신기록!)' : ''}`;
      else if (mode === 'stage') line = `붐 크리터스 스테이지 ${current.stage} ${word} ${stars(starN)}`;
      else line = `붐 크리터스 빠른 대전(${(DIFF[current.diff] || {}).label || '보통'}) ${word}`;
      shareText = `${line}\n${GAME_URL}`;
    }
    renderStats(game.stats, rec);
    $('resultTitle').textContent = title;
    $('resultSub').textContent = sub;
    $('resultStars').textContent = starN ? stars(starN) : '';
    show('resultStars', starN > 0);
    show('nextBtn', mode === 'stage' && won && current.stage < STAGE_COUNT);
    show('stageSelBtn', mode === 'stage');
    $('againBtn').textContent = mode === 'quick' ? '다시 하기' : '다시 도전';
    $('menuBtn').textContent = mode === 'quick' ? '난이도 선택' : '처음으로';
    show('resultScreen');
    audio.setMusicMode('result');
    // 결과 징글: 승리/신기록이면 밝은 음, 패배·무승부·게임 오버면 낮은 음 (음악 볼륨·음소거를 따르고 재생 동안 배경음악이 작아진다)
    audio.playJingle(mode === 'endless' ? (endlessRecord && game.cleared > 0 ? 'win' : 'lose') : won ? 'win' : 'lose');
  }, 900);
}

// 밸런스 측정용 헤드리스 시뮬레이션 (콘솔): await __sim(30, { stage: 5, skill: 'average' }) / await __sim.table(20)
// 렌더링 없이 AI 대 AI 경기를 빠르게 돌려 승률을 돌려준다. 필요할 때만 sim.js를 불러온다.
window.__sim = (n, opts) => import('./sim.js?v=2026111035').then((m) => m.sim(n, opts));
window.__sim.table = (n, stages, skills) => import('./sim.js?v=2026111035').then((m) => m.table(n, stages, skills));
window.__sim.soak = (n, opts) => import('./sim.js?v=2026111035').then((m) => m.soak(n, opts)); // 내구 테스트: await __sim.soak(2) -> { matches, issues }

function launch(cfg) {
  current = cfg; endlessRecord = false;
  audio.stopJingle();
  audio.initAudio();
  audio.play('select');
  audio.setMusicMode('match');
  ['startScreen', 'stageScreen', 'resultScreen'].forEach((id) => show(id, false));
  if (cfg.mode === 'stage') game.newMatch('normal', stageConfig(cfg.stage));
  else if (cfg.mode === 'endless') game.newMatch('normal', waveConfig(1));
  else { difficulty = cfg.diff; game.newMatch(cfg.diff, quickConfig(cfg.diff)); }
}
const startMatch = (diff) => launch({ mode: 'quick', diff });
// 시작 화면 난이도 선택(쉬움/보통/어려움): 고른 값은 localStorage에 저장되고 '빠른 대전 시작'으로 시작
function selectDiff(d, save = true) {
  if (!DIFF[d]) d = 'normal';
  difficulty = d;
  if (save) progress.savePrefs({ difficulty: d });
  document.querySelectorAll('[data-diff]').forEach((b) => { const on = b.dataset.diff === d; b.classList.toggle('sel', on); b.setAttribute('aria-checked', String(on)); });
  const x = DIFF[d], q = $('quickDesc');
  if (q) q.textContent = `3 vs ${x.enemies} · AI 오차 ${x.a}°/${x.p}`;
}

function goStart() {
  audio.stopJingle();
  audio.setMusicMode('menu');
  show('resultScreen', false); show('stageScreen', false); show('startScreen');
  $('endlessBest').textContent = `최고 기록: ${progress.load().endlessBest} 웨이브`;
}

// 스테이지 선택 화면: 잠긴 스테이지는 비활성, 클리어한 스테이지는 별 표시
function renderStages() {
  const d = progress.load(), grid = $('stageGrid');
  grid.textContent = '';
  for (let i = 1; i <= STAGE_COUNT; i++) {
    const locked = i > d.unlocked, st = d.stars[i] || 0, cfg = stageConfig(i);
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.stage = String(i);
    b.className = (locked ? 'locked ' : '') + (st ? 'done' : '');
    b.disabled = locked;
    b.innerHTML = `<b>${i}</b><span class="stars">${locked ? '🔒' : stars(st)}</span><small>적 ${cfg.enemies}마리</small>`;
    b.setAttribute('aria-label', locked ? `스테이지 ${i} 잠김` : `스테이지 ${i}${st ? ` 별 ${st}개` : ''}`);
    b.addEventListener('click', () => launch({ mode: 'stage', stage: i }));
    grid.appendChild(b);
  }
}
function goStageSelect() {
  audio.stopJingle();
  audio.play('select');
  renderStages();
  show('startScreen', false); show('resultScreen', false); show('stageScreen');
}

function bindHold(el, onDown, onUp) {
  const down = (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('down'); onDown(); };
  const up = (e) => { e.preventDefault(); el.classList.remove('down'); onUp(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', () => { if (el.classList.contains('down')) up({ preventDefault() {} }); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// 세로 폰 DOM HUD: 값이 바뀔 때만 DOM을 갱신 (프레임당 비용 최소화)
function makeHud() {
  const q = (sel) => document.querySelector(sel), cache = {};
  const set = (key, el, prop, val) => { if (cache[key] !== val) { cache[key] = val; el[prop] = val; } };
  const teams = [q('#hudMe'), q('#hudFoe')].map((el) => ({ el, name: el.querySelector('.hud-name'), tot: el.querySelector('.hud-tot'), bar: el.querySelector('.hud-bar i'), units: el.querySelector('.hud-units') }));
  const unitEl = $('hudUnit'), timer = $('hudTimer'), arrow = $('hudWindArrow'), num = $('hudWindNum'), mode = $('hudMode'), status = $('hudStatus');
  const windSvg = (w) => {
    if (!w) return '<span style="font-size:14px">없음</span>';
    const len = 16 + Math.abs(w) * 7, h = 20, y = h / 2;
    return `<svg width="${len + 4}" height="${h}" viewBox="0 0 ${len + 4} ${h}" style="${w < 0 ? 'transform:scaleX(-1)' : ''}"><path d="M2 ${y}H${len - 8}" stroke="#ffe27a" stroke-width="5" stroke-linecap="round"/><path d="M${len + 2} ${y}L${len - 10} 2V${h - 2}Z" fill="#ffe27a" stroke="#000" stroke-width="1" stroke-linejoin="round"/></svg>`;
  };
  return {
    update(gm) {
      for (let t = 0; t < 2; t++) {
        const mem = gm.units.filter((u) => u.team === t), tot = mem.reduce((a, u) => a + u.hp, 0), cap = mem.reduce((a, u) => a + u.maxHp, 0), T = teams[t];
        set('n' + t, T.name, 'textContent', (gm.teamMarks ? (t === 0 ? '● ' : '◆ ') : '') + TEAMS[t].name.replace(' 팀', '') + (t === 0 ? '(나)' : '(AI)'));
        set('t' + t, T.tot, 'textContent', `${tot}/${cap}`);
        set('b' + t, T.bar, 'style', `width:${cap ? (100 * tot) / cap : 0}%;--tc:${TEAMS[t].color}`);
        const act = gm.state === 'aim' || gm.state === 'flying' || gm.state === 'strike' ? gm.activeUnit : null;
        set('u' + t, T.units, 'innerHTML', mem.map((u) => `<span class="${u.alive ? (u === act ? 'act' : '') : 'dead'}">${u.alive ? u.hp : '✕'}</span>`).join(''));
      }
      const tm = Math.max(0, Math.ceil(gm.timer || 0));
      set('tm', timer, 'textContent', String(tm));
      set('tl', timer, 'className', tm <= 5 && gm.state === 'aim' ? 'low' : '');
      set('wa', arrow, 'innerHTML', windSvg(gm.wind || 0));
      set('wn', num, 'textContent', String(Math.abs(gm.wind || 0)));
      set('md', mode, 'textContent', gm.modeLabel);
      let st = '';
      if (gm.state === 'aim') st = gm.turnTeam === 0 ? (gm.airMode ? `내 차례 · 공습 목표 ${Math.round(gm.airX)} · 화면을 눌러 호출` : `내 차례 · 각도 ${Math.round(gm.angle)}° · 파워 ${Math.round(gm.power)}`) : '상대가 조준 중...';
      else if (gm.state === 'strike') st = '공습 중!';
      set('st', status, 'textContent', st);
      if (unitEl) { // 지금 차례인 유닛(또는 마우스를 올린 유닛)의 이름·HP·특성
        const u = gm.infoUnit;
        set('un', unitEl, 'textContent', u ? `${u.name} (HP ${u.hp}/${u.maxHp}) · ${u.trait.name}: ${u.trait.desc}` : '');
      }
    },
  };
}

function setup(sprites) {
  game = new Game(sprites);
  window.__game = game; // 디버깅/테스트용
  game.onOver = showResult;
  setTouchUI();
  const syncMotion = () => { game.reduceMotion = motionMQ.matches; };
  syncMotion(); motionMQ.addEventListener?.('change', syncMotion);
  const syncScale = () => { game.viewScale = Math.max(0.2, canvas.clientWidth / W); };
  syncScale(); viewSync = syncScale;
  try { new ResizeObserver(syncScale).observe(canvas); } catch (e) { /* 구형 브라우저: resize 이벤트로 대체 */ }
  const hud = makeHud();
  const k = game.keys;

  // 시작 화면
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => { audio.play('select'); selectDiff(b.dataset.diff); }));
  selectDiff(difficulty, false);
  $('quickStartBtn')?.addEventListener('click', () => startMatch(difficulty));
  $('stageModeBtn').addEventListener('click', goStageSelect);
  $('endlessModeBtn').addEventListener('click', () => launch({ mode: 'endless' }));
  $('stageBackBtn').addEventListener('click', () => { audio.play('select'); goStart(); });
  $('againBtn').addEventListener('click', () => launch({ ...current }));
  $('nextBtn').addEventListener('click', () => launch({ mode: 'stage', stage: Math.min(STAGE_COUNT, current.stage + 1) }));
  $('stageSelBtn').addEventListener('click', goStageSelect);
  $('menuBtn').addEventListener('click', () => { audio.play('select'); goStart(); });
  $('shareBtn')?.addEventListener('click', () => { audio.play('select'); shareResult(); });
  game.onWave = (n) => { if (progress.recordEndless(n)) endlessRecord = true; };
  goStart();

  // 음소거 + 설정 패널(음악/효과음 볼륨, localStorage 저장)
  const muteBtn = $('muteBtn');
  // 접근성 설정: HUD 큰 글씨(+25%)·고대비 팀 표시(파랑 원 / 빨강 마름모). localStorage에 저장
  const applyA11y = () => {
    game.bigHud = prefs.bigHud; game.teamMarks = prefs.contrast;
    document.body.classList.toggle('bighud', prefs.bigHud);
    document.body.classList.toggle('teammarks', prefs.contrast);
    for (const [id, on] of [['bigHudToggle', prefs.bigHud], ['contrastToggle', prefs.contrast]]) {
      const b = $(id); if (!b) continue; b.textContent = on ? '켜짐' : '꺼짐'; b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on);
    }
  };
  $('bigHudToggle')?.addEventListener('click', () => { audio.play('select'); prefs.bigHud = !prefs.bigHud; progress.savePrefs({ bigHud: prefs.bigHud }); applyA11y(); });
  $('contrastToggle')?.addEventListener('click', () => { audio.play('select'); prefs.contrast = !prefs.contrast; progress.savePrefs({ contrast: prefs.contrast }); applyA11y(); });
  applyA11y();
  const refreshMute = () => {
    muteBtn.innerHTML = audio.isMuted() ? '🔇<span class="tx"> 소리 꺼짐</span>' : '🔊<span class="tx"> 소리 켜짐</span>';
    muteBtn.setAttribute('aria-label', audio.isMuted() ? '소리 켜기' : '소리 끄기');
    $('muteToggle').textContent = audio.isMuted() ? '꺼짐 (누르면 켜기)' : '켜짐 (누르면 끄기)';
  };
  muteBtn.addEventListener('click', () => { audio.initAudio(); audio.setMuted(!audio.isMuted()); refreshMute(); });
  $('muteToggle').addEventListener('click', () => muteBtn.click());
  const vols = audio.getVolumes();
  for (const [kind, id] of [['music', 'musicVol'], ['sfx', 'sfxVol']]) {
    const input = $(id), out = $(id + 'Out');
    input.value = Math.round(vols[kind] * 100); out.textContent = input.value + '%';
    input.addEventListener('input', () => { audio.initAudio(); audio.setVolume(kind, input.value / 100); out.textContent = input.value + '%'; });
    if (kind === 'sfx') input.addEventListener('change', () => audio.play('sea_boom_small', { vol: 0.8 })); // 조절 후 미리 듣기
  }
  refreshMute();
  // 모달 접근성: 열릴 때 안으로 포커스를 옮기고, Tab은 맨 위 모달 안에서만 돌며(포커스 트랩), 뒤쪽 화면은 inert로 막고, 닫히면 연 버튼으로 포커스를 돌려준다. Esc로 닫기는 키보드 처리에서
  const openers = {};  // 모달 id -> 열기 직전 포커스 요소
  const isOpen = (id) => !$(id).classList.contains('hidden');
  const topModal = () => { const t = MODALS.filter(isOpen); return t.includes('tutorialScreen') ? 'tutorialScreen' : t[t.length - 1] || null; }; // 튜토리얼은 항상 위
  const focusables = (root) => [...root.querySelectorAll('button, input, a[href], select, textarea, [tabindex]')]
    .filter((el) => el.tabIndex >= 0 && !el.disabled && !el.hidden && !el.closest('[hidden], .hidden') && el.getClientRects().length > 0);
  const syncModal = () => {
    const top = topModal();
    modalOpen = !!top;
    // 맨 위 모달만 조작 가능, 나머지 화면·버튼·HUD는 inert (포커스·스크린리더 접근 차단)
    document.querySelectorAll('#stage > *, #controls, #hud, #rotateHint').forEach((el) => { el.inert = modalOpen && el.id !== top; });
  };
  const openModal = (id) => {
    openers[id] = document.activeElement;
    show(id); syncModal();
    for (const n in k) k[n] = false; game.releaseCharge(); game.drag = null;
    const root = $(id);
    if (id !== 'tutorialScreen') (focusables(root)[0] || root).focus({ preventScroll: true }); // 튜토리얼은 render()가 '다음'에 포커스
  };
  const closeModal = (id) => {
    show(id, false); syncModal();
    const back = openers[id]; openers[id] = null;
    if (back && back.focus && document.contains(back) && back.getClientRects().length > 0 && !back.disabled) back.focus({ preventScroll: true });
    else { const t = topModal(); if (t) (focusables($(t))[0] || $(t)).focus({ preventScroll: true }); }
  };
  const trapTab = (e) => {
    const t = topModal();
    if (!t) return;
    const list = focusables($(t)), root = $(t);
    if (!list.length) { e.preventDefault(); root.focus(); return; }
    const first = list[0], last = list[list.length - 1], cur = document.activeElement;
    if (!root.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  };
  // 튜토리얼: 키보드(→/←/Enter/Space/Esc)와 터치(다음·이전·건너뛰기 버튼) 모두 지원. 게임 방법 화면 위에서도 열 수 있음
  const tutorial = (() => {
    const scr = $('tutorialScreen');
    if (!scr) return { open() {}, close() {}, next() {}, prev() {}, isOpen: () => false };
    let i = 0;
    const render = () => {
      const st = TUT_STEPS[i];
      $('tutStep').textContent = `${i + 1} / ${TUT_STEPS.length}`;
      $('tutIcon').textContent = st.icon;
      $('tutTitle').textContent = st.title;
      const ul = $('tutBody'); ul.textContent = '';
      for (const [tag, text] of st.lines) {
        const li = document.createElement('li'), b = document.createElement('b');
        b.textContent = tag; li.append(b, ' ' + text); ul.appendChild(li);
      }
      $('tutDots').innerHTML = TUT_STEPS.map((_, n) => `<i class="${n === i ? 'on' : ''}"></i>`).join('');
      $('tutPrev').hidden = i === 0;
      $('tutNext').textContent = i === TUT_STEPS.length - 1 ? '시작하기' : '다음';
      $('tutNext').focus({ preventScroll: true });
    };
    const api = {
      isOpen: () => !scr.classList.contains('hidden'),
      open() {
        if (api.isOpen()) return;
        i = 0;
        store.local.set(TUT_KEY, '1'); // 저장이 막혀 있으면 이번 접속 동안만 기억
        openModal('tutorialScreen'); render();
      },
      close() {
        if (!api.isOpen()) return;
        closeModal('tutorialScreen');
      },
      next() { if (i >= TUT_STEPS.length - 1) api.close(); else { i++; render(); } },
      prev() { if (i > 0) { i--; render(); } },
    };
    $('tutNext').addEventListener('click', () => { audio.play('select'); api.next(); });
    $('tutPrev').addEventListener('click', () => { audio.play('select'); api.prev(); });
    $('tutSkip').addEventListener('click', () => { audio.play('select'); api.close(); });
    return api;
  })();
  $('helpTutorialBtn')?.addEventListener('click', () => { audio.play('select'); tutorial.open(); });

  // 게임 방법·크레딧: 시작 화면에서 열고 닫으면 시작 화면으로 복귀
  for (const [open, scr, close] of [['helpBtn', 'helpScreen', 'helpCloseBtn'], ['creditsBtn', 'creditsScreen', 'creditsCloseBtn']]) {
    $(open).addEventListener('click', () => { audio.play('select'); openModal(scr); });
    $(close).addEventListener('click', () => { audio.play('select'); closeModal(scr); });
  }
  // 일시정지: 모달과 같은 방식으로 game.update를 통째로 멈춤 → 타이머·AI 생각/조준/충전도 그대로 멈췄다가 이어짐 (건너뛰기 불가)
  const pauseBtn = $('pauseBtn');
  pauseBtn.hidden = false;
  const canPause = () => !modalOpen && !game.winner && ['aim', 'flying', 'strike', 'settle', 'wave'].includes(game.state);
  const pauseGame = () => {
    if (!canPause()) return;
    game.charging = false; game.power = 0; // 충전 중이면 발사하지 않고 취소
    audio.play('select'); openModal('pauseScreen');
  };
  pauseBtn.addEventListener('click', pauseGame);
  $('resumeBtn').addEventListener('click', () => { audio.play('select'); closeModal('pauseScreen'); });
  $('restartBtn').addEventListener('click', () => { closeModal('pauseScreen'); launch({ ...current }); });
  $('quitBtn').addEventListener('click', () => {
    closeModal('pauseScreen');
    game.state = 'idle'; game.ai = null; game.charging = false; // 뒤에서 경기가 계속 진행되지 않도록 정지
    audio.play('select'); goStart();
  });
  $('gearBtn').addEventListener('click', () => { audio.play('select'); openModal('settingsScreen'); });
  $('settingsCloseBtn').addEventListener('click', () => { audio.play('select'); closeModal('settingsScreen'); });

  // 작은 가로 화면(폭 700px 이하): 일시정지·설정·소리 버튼 3개가 이름표를 가리므로 메뉴 버튼 하나(#compactBtn)로 합치고, 누르면 작은 팝오버(#menuPop)에 세 항목을 보여 준다
  // (CSS가 이 크기에서만 #compactBtn을 보여 주고 기존 3개 버튼을 숨김. 마크업이 없는 구버전 HTML이면 아무것도 하지 않음)
  const compactBtn = $('compactBtn'), pop = $('menuPop');
  const compactMQ = window.matchMedia('(orientation: landscape) and (max-width: 700px)');
  const popItems = pop ? { pause: $('popPause'), settings: $('popSettings'), sound: $('popSound') } : null;
  const popOpen = () => !!pop && !pop.classList.contains('hidden');
  const closePop = (refocus = false) => {
    if (!popOpen()) return;
    pop.classList.add('hidden'); compactBtn.setAttribute('aria-expanded', 'false');
    if (refocus) compactBtn.focus({ preventScroll: true });
  };
  const openPop = () => {
    if (!pop || modalOpen) return;
    pop.classList.remove('hidden'); compactBtn.setAttribute('aria-expanded', 'true');
    const first = [popItems.pause, popItems.settings, popItems.sound].find((b) => !b.disabled);
    if (first && document.body.classList.contains('kbd')) first.focus({ preventScroll: true });
  };
  if (compactBtn && pop) {
    compactBtn.addEventListener('click', () => { audio.play('select'); if (popOpen()) closePop(); else openPop(); });
    popItems.pause.addEventListener('click', () => { closePop(); pauseGame(); });
    popItems.settings.addEventListener('click', () => { closePop(); $('gearBtn').click(); });
    popItems.sound.addEventListener('click', () => { muteBtn.click(); closePop(); });
    // 바깥을 누르면 닫힘, Esc로도 닫힘 (게임의 Esc=일시정지보다 먼저 처리)
    document.addEventListener('pointerdown', (e) => { if (popOpen() && !pop.contains(e.target) && e.target !== compactBtn && !compactBtn.contains(e.target)) closePop(); }, true);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'ArrowDown' || e.code === 'ArrowUp') document.body.classList.add('kbd');
      if (e.code === 'Escape' && popOpen()) { closePop(true); e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    window.addEventListener('pointerdown', () => document.body.classList.remove('kbd'), true);
    compactMQ.addEventListener?.('change', () => closePop());
  }
  let popSoundLabel = '';
  const compactTick = () => { // 매 프레임: 항목 상태 갱신, 메뉴 화면·모달이 뜨면 팝오버 닫기
    if (!popItems) return;
    popItems.pause.disabled = !canPause();
    const t = audio.isMuted() ? '🔇 소리 켜기' : '🔊 소리 끄기';
    if (t !== popSoundLabel) { popSoundLabel = t; popItems.sound.textContent = t; }
    if (popOpen() && (modalOpen || !compactMQ.matches)) closePop();
  };

  // 키보드
  const map = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalOpen) { // 모달이 열려 있으면 게임 키 대신 M(음소거)·Esc(닫기)만 처리
      if (e.code === 'KeyM' && !e.repeat) muteBtn.click();
      else if (e.code === 'Escape') { const t = topModal(); if (t === 'tutorialScreen') tutorial.close(); else if (t) closeModal(t); } // 맨 위 모달 하나만 닫음 (일시정지면 계속하기)
      else if (e.code === 'Tab') trapTab(e);
      else if (tutorial.isOpen() && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) { e.code === 'ArrowRight' ? tutorial.next() : tutorial.prev(); e.preventDefault(); }
      return;
    }
    if (e.code === 'Escape') { if (!e.repeat) pauseGame(); return; }
    if (map[e.code]) { k[map[e.code]] = true; e.preventDefault(); return; }
    if (e.repeat) { if (['Space', 'KeyW'].includes(e.code)) e.preventDefault(); return; }
    if (e.code === 'KeyW') { game.playerJump(); e.preventDefault(); }
    else if (e.code === 'Space') { game.beginCharge(); e.preventDefault(); }
    else if (/^(Digit|Numpad)[1-6]$/.test(e.code)) game.setWeapon(Number(e.code.slice(-1)) - 1);
    else if (e.code === 'KeyM') muteBtn.click();
  });
  window.addEventListener('keyup', (e) => {
    if (modalOpen) return; // 모달 안의 버튼/슬라이더는 Space·방향키를 기본 동작대로 처리
    if (map[e.code]) { k[map[e.code]] = false; e.preventDefault(); }
    else if (e.code === 'Space') { game.releaseCharge(); e.preventDefault(); }
  });
  window.addEventListener('blur', () => { for (const n in k) k[n] = false; game.releaseCharge(); });

  // 화면 버튼
  bindHold($('bLeft'), () => (k.left = true), () => (k.left = false));
  bindHold($('bRight'), () => (k.right = true), () => (k.right = false));
  bindHold($('bUp'), () => (k.up = true), () => (k.up = false));
  bindHold($('bDown'), () => (k.down = true), () => (k.down = false));
  bindHold($('bJump'), () => game.playerJump(), () => {});
  bindHold($('bFire'), () => game.beginCharge(), () => game.releaseCharge());
  weaponBtns.forEach((b, i) => b.addEventListener('click', () => game.setWeapon(i)));

  // 드래그 조준
  // 마우스: 클릭/드래그로 각도만 조절 (기존 동작). 터치: 오른쪽 절반을 드래그하면 각도(유닛→손가락 방향)와
  // 파워(드래그 거리)를 정하고 손을 떼면 발사, 왼쪽 절반은 각도만 조절.
  let dragging = null, aimPtr = null, airPtr = null; // 각도만 조절 중인 포인터 id / 드래그 발사 중인 포인터 id
  const toGame = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (modalOpen) return;
    const finger = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (finger) setTouchUI(true);
    const [px, py] = toGame(e);
    if (!game.touchUI) { const slot = game.slotAt(px, py); if (slot >= 0) { game.setWeapon(slot); return; } } // 하단 HUD 무기 버튼
    if (game.airMode && game.isPlayerTurn) { // 공습: 누르면 목표 마커가 그 x로 가고, 끌어서 조정, 떼면 호출
      if (airPtr === null) { airPtr = e.pointerId; canvas.setPointerCapture(e.pointerId); game.setAirX(px); }
      return;
    }
    if (finger && px >= W / 2 && aimPtr === null) {
      const max = Math.min(300, (140 * W) / canvas.getBoundingClientRect().width); // 손가락 약 140px 끌면 최대 파워
      if (game.dragBegin(px, py, max)) { aimPtr = e.pointerId; canvas.setPointerCapture(e.pointerId); }
      return;
    }
    dragging = e.pointerId; canvas.setPointerCapture(e.pointerId); game.aimTo(px, py);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') game.hover = game.unitAt(...toGame(e)); // 마우스를 유닛에 올리면 정보 줄에 그 유닛의 특성이 보인다
    if (e.pointerId === airPtr) game.setAirX(toGame(e)[0]);
    else if (e.pointerId === aimPtr) game.dragMove(...toGame(e));
    else if (e.pointerId === dragging) game.aimTo(...toGame(e));
  });
  const endDrag = (fireIt) => (e) => {
    if (e.pointerId === airPtr) { // 공습 호출: 손을 떼면 마커 위치에 투하 (취소되면 호출하지 않음)
      airPtr = null;
      if (fireIt) { game.setAirX(toGame(e)[0]); game.beginCharge(); }
    }
    if (e.pointerId === aimPtr) { aimPtr = null; game.dragEnd(fireIt); }
    if (e.pointerId === dragging) dragging = null;
  };
  canvas.addEventListener('pointerup', endDrag(true));
  canvas.addEventListener('pointercancel', endDrag(false));
  canvas.addEventListener('pointerleave', () => { game.hover = null; });
  // 길게 눌러 나오는 메뉴·글자 선택·더블탭 확대 방지 (캔버스, 화면 버튼, HUD). 설정 슬라이더·링크 등은 그대로 둔다
  const elOf = (e) => (e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement);
  const noMenu = (e) => { const el = elOf(e); if (el && el.closest('#game, #controls, #topBtns, #menuPop, #hud, .overlay')) e.preventDefault(); };
  document.addEventListener('contextmenu', noMenu);
  document.addEventListener('selectstart', (e) => { const el = elOf(e); if (!(el && el.closest('input, textarea, .doc'))) noMenu(e); });
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS 핀치 줌 방지
  let lastTap = 0; // iOS 더블탭 확대: 캔버스는 포인터 이벤트만 쓰므로 빠른 두 번째 touchend의 기본 동작(확대)만 막는다
  canvas.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTap < 350 && e.cancelable) e.preventDefault(); lastTap = n; }, { passive: false });

  // 첫 실행이면 튜토리얼을 자동으로 띄움
  let seen = false;
  seen = store.local.get(TUT_KEY) === '1';
  if (!seen) tutorial.open();

  // 메인 루프
  const fireBtn = $('bFire'), fireFx = fireBtn.querySelector('.fx'), fireLabel = fireBtn.querySelector('.fl');
  let last = performance.now(), raf = 0;
  // 시작·스테이지 선택 화면 배경(index.html의 canvas.menuBg): 메뉴가 보이는 동안에는 경기 대신 이 배경만 그린다. 없으면(구버전 HTML) 예전처럼 경기 화면
  const menuCanvases = [...document.querySelectorAll('canvas.menuBg')], menuBg = menuCanvases.length ? new MenuBg() : null;
  window.__menuBg = menuBg; // 디버깅/테스트용: frames(그린 프레임 수), mode('animated'|'still'|'idle'), t
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    try {
      const menuEl = menuBg && menuCanvases.find((c) => !c.parentElement.classList.contains('hidden'));
      if (menuEl) {
        if (!modalOpen) menuBg.step(menuEl, dt, motionMQ.matches); // 모달이 위를 덮고 있으면 그리지 않음
      } else {
        menuBg && (menuBg.mode = 'idle');
        if (!modalOpen) game.update(dt);
        game.draw(g);
      }
    } catch (err) { console.error(err); }
    if (game.domHud) hud.update(game);
    // 메뉴/모달이 떠 있으면 가로 화면의 겹침 컨트롤을 숨김
    document.body.classList.toggle('menu', ['startScreen', 'stageScreen', 'resultScreen', ...MODALS].some((id) => !$(id).classList.contains('hidden')));
    // 발사 버튼(가로 터치 화면): 각도·파워 표시와 파워 게이지
    {
      const mine = game.turnTeam === 0 && (game.state === 'aim' || game.state === 'flying');
      const info = mine && game.airMode ? `목표 ${Math.round(game.airX)}` : mine ? `${Math.round(game.angle)}° · ${Math.round(game.power)}` : game.turnTeam === 1 && game.state === 'aim' ? '상대 조준 중' : '';
      if (fireFx.textContent !== info) fireFx.textContent = info;
      const pw = mine ? Math.round(game.power) + '%' : '0%';
      if (fireBtn.dataset.pw !== pw) { fireBtn.dataset.pw = pw; fireBtn.style.setProperty('--pw', pw); }
      pauseBtn.disabled = !canPause();
      compactTick();
      const fl = game.airMode ? '공습 호출' : '발사 (꾹)';
      if (fireLabel.textContent !== fl) fireLabel.textContent = fl;
    }
    // 무기 버튼 상태 표시
    weaponBtns.forEach((b, i) => {
      b.classList.toggle('sel', game.weapon === i);
      const w = WEAPONS[i], a = game.ammo ? game.ammo[0][i] : 0;
      b.disabled = !!w.disabled || a <= 0;
      const amt = w.disabled ? 'soon' : w.airstrike && !game.airOk ? '🔒' : a === Infinity ? '∞' : `×${a}`;
      const label = `${i + 1} ${w.name}|${amt}`;
      if (b.dataset.label !== label) { // 터치 화면에서는 두 줄(이름 / 탄약)로 보인다
        b.dataset.label = label;
        b.innerHTML = `<span class="wn"><span class="wk">${i + 1} </span>${w.name}</span><span class="wa">${amt}</span>`; // .wk(번호)는 큰 HUD 글씨 + 터치 화면에서 숨겨 이름·탄약을 더 크게 보여 줌
      }
    });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  // 탭이 숨겨지면 경기를 일시정지하고(돌아와도 자동으로 이어지지 않고 '계속하기'를 눌러야 함) 루프를 완전히 멈춘다(배터리). 돌아오면 시간 간격을 리셋해 다시 시작
  const autoPause = () => { for (const n in k) k[n] = false; pauseGame(); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { autoPause(); cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  window.addEventListener('pagehide', autoPause); // iOS Safari: 앱 전환·홈 이동
  $('loading').classList.add('hidden');
}

loadImages().then(setup).catch((err) => {
  console.error(err);
  $('loading').textContent = '에셋을 불러오지 못했습니다: ' + err.message;
});
