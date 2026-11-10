// 진입점: 에셋 로딩, 입력, UI, 메인 루프
// 캐시 버전: index.html의 ?v=, 모듈 import의 ?v=, 크레딧 화면 표시와 함께 올린다 (배포마다 갱신)
const VERSION = '2026111040';
import { Game, W, H, TEAMS, CHARACTERS, WALK_FRAMES, WEAPONS, STAGE_COUNT, DIFF, quickConfig, stageConfig, waveConfig } from './game.js?v=2026111040';
import * as audio from './audio.js?v=2026111040';
import * as progress from './progress.js?v=2026111040';
import { MenuBg } from './menubg.js?v=2026111040';
import * as store from './storage.js?v=2026111040';
import * as loader from './loader.js?v=2026111040';
import { t as tr, getLang, setLang, applyDom, onLangChange } from './i18n.js?v=2026111040';

const POSES = ['idle', ...Array.from({ length: WALK_FRAMES }, (_, i) => 'walk' + i), 'jump', 'fall', 'hit', 'attack0', 'hold', 'down'];
const CHAR_KEYS = CHARACTERS.flat().map(([k]) => k);
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
const updateVer = () => { // 크레딧 화면 버전 표시: HTML(스타일·스크립트 주소)과 실제로 불러온 스크립트 버전이 다르면 오래된 캐시라고 알려줌
  const html = $('verHtml')?.textContent.trim() || '', js = $('verJs');
  if (!js) return;
  const stale = html !== VERSION;
  js.textContent = stale ? tr('ver.stale', { v: VERSION, h: html || tr('ver.none') }) : VERSION;
  js.classList.toggle('stale', stale);
};
applyDom(); // 저장된 언어(없으면 브라우저 언어)로 정적 문구를 바꾼다 — 모듈이 시작되자마자 해서 한국어가 잠깐 비치지 않게 함
updateVer();
canvas.width = W; canvas.height = H;

// 로딩 화면에서 받는 캐릭터: 우리 팀 3명과 첫 두 적(빠른 대전 쉬움·스테이지 1~3에 필요). 세 번째 적부터(보통 이상·스테이지 4~)는 뒤에서 받다가 그 경기를 시작할 때 기다린다
const CORE_KEYS = [...CHARACTERS[0].map(([k]) => k), ...CHARACTERS[1].slice(0, 2).map(([k]) => k)];
const LAZY_KEYS = [...new Set(CHAR_KEYS)].filter((k) => !CORE_KEYS.includes(k));
const BOOT_TIMEOUT = 8000, MIN_SHOW = 500; // 로딩이 이 시간 넘게 걸리면 있는 것만으로 시작 / 로딩 화면 최소 표시 시간(ms)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
const TUT_ICONS = ['🏃', '🎯', '💣', '📦'];   // 문구는 i18n.js의 tut.<단계>.* 키
const TUT_COUNT = TUT_ICONS.length;
const tutStep = (n) => ({ icon: TUT_ICONS[n - 1], title: tr(`tut.${n}.t`), lines: ['a', 'b', 'c'].map((x) => [tr(`tut.${n}.${x}.k`), tr(`tut.${n}.${x}.v`)]) });

// 결과 화면 통계 패널 (#resultStats가 있을 때만): 발사 횟수·준 피해·받은 피해·사용한 무기·턴.
// best가 있으면(스테이지 모드) 항목별로 '신기록!'·'첫 기록' 또는 이전 최고를 함께 보여 준다.
const STAT_ROWS = ['shots', 'dealt', 'taken', 'weapons', 'turns'];
function renderStats(st, rec) {
  const box = $('resultStats');
  if (!box) return;
  const wname = (id) => (WEAPONS.find((w) => w.id === id) || { name: id }).name;
  const used = Object.entries(st.wpn).sort((a, b) => b[1] - a[1]);
  box.textContent = '';
  for (const key of STAT_ROWS) {
    const label = tr('rs.' + key), unit = ['shots', 'weapons', 'turns'].includes(key) ? tr('rs.u.' + key) : '';
    const cell = document.createElement('div'), k = document.createElement('span'), v = document.createElement('b'), note = document.createElement('small');
    cell.className = 'rs'; k.className = 'rk'; v.className = 'rv';
    k.textContent = label;
    v.textContent = key === 'weapons' ? `${used.length}${unit}` : `${st[key]}${unit}`;
    if (key === 'weapons') note.textContent = used.map(([id, n]) => `${wname(id)}×${n}`).join(' · ') || '-';
    else if (rec && key !== 'weapons') {
      if (rec.isNew && rec.isNew[key]) { note.textContent = rec.first ? tr('rs.first') : tr('rs.new'); note.className = 'newbest'; }
      else if (rec.best && rec.best[key] !== undefined) note.textContent = tr('rs.best', { v: rec.best[key], u: unit });
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
    try { await navigator.share({ title: tr('share.title'), text }); return; } catch (e) {
      if (e && e.name === 'AbortError') return; // 사용자가 공유 창을 닫음
    }
  }
  showToast(await copyText(text) ? tr('share.copied') : tr('share.fail', { url: GAME_URL }));
}

let resultView = null; // 결과 화면의 글자를 (다시) 채우는 함수 — 언어를 바꾸면 다시 불러 번역한다
function showResult(winner) {
  setTimeout(() => {
    const mode = current.mode, won = winner === 0, stage = current.stage, record = endlessRecord, stats = game.stats, cleared = game.cleared;
    let starN = 0, alive = 0, r = null, rec = null;
    if (mode === 'stage' && won) {
      alive = game.units.filter((u) => u.team === 0 && u.alive).length;
      starN = Math.max(1, Math.min(3, alive));
      r = progress.completeStage(stage, starN);
    }
    if (mode === 'stage') {
      if (won) { const rr = progress.recordStats(stage, stats); rec = { ...rr, first: !rr.prev }; }
      else rec = { best: progress.bestOf(stage), isNew: {} };
    }
    resultView = () => {
      let title, sub = '';
      if (mode === 'endless') {
        title = tr('res.over');
        sub = tr('res.endSub', { n: cleared, b: progress.load().endlessBest, rec: record && cleared > 0 ? tr('res.new') : '' });
      } else if (mode === 'stage') {
        title = won ? tr('res.clear', { n: stage }) : tr('res.lose');
        if (won) sub = tr('res.alive', { n: alive, b: r.best }) + (r.unlockedNext && stage < STAGE_COUNT ? tr('res.unlock', { n: stage + 1 }) : '');
        else sub = tr(winner === 1 ? 'res.allDown' : 'res.bothDown');
      } else {
        title = won ? tr('res.win') : winner === 1 ? tr('res.lose') : tr('res.draw');
        sub = tr(won ? 'res.foeDown' : winner === 1 ? 'res.allDown' : 'res.bothDown');
      }
      const dl = $('resultDiff');
      if (dl) { // 빠른 대전: 고른 난이도와 적 수를 결과 화면에 표시
        const d = DIFF[current.diff];
        dl.textContent = mode === 'quick' && d ? tr('res.diff', { d: d.label, n: d.enemies }) : '';
        dl.classList.toggle('hidden', !(mode === 'quick' && d));
      }
      { // 공유 글: 모드/스테이지 · 결과 · 별 + 게임 주소
        const word = tr(won ? 'share.word.win' : winner === 1 ? 'share.word.lose' : 'share.word.draw');
        let line;
        if (mode === 'endless') line = tr('share.endless', { n: cleared, rec: record && cleared > 0 ? tr('res.new') : '' });
        else if (mode === 'stage') line = tr('share.stage', { n: stage, w: word, s: stars(starN) });
        else line = tr('share.quick', { d: (DIFF[current.diff] || DIFF.normal).label, w: word });
        shareText = `${line}\n${GAME_URL}`;
      }
      renderStats(stats, rec);
      $('resultTitle').textContent = title;
      $('resultSub').textContent = sub;
      $('resultStars').textContent = starN ? stars(starN) : '';
      show('resultStars', starN > 0);
      show('nextBtn', mode === 'stage' && won && stage < STAGE_COUNT);
      show('stageSelBtn', mode === 'stage');
      $('againBtn').textContent = tr(mode === 'quick' ? 'res.again' : 'res.retry');
      $('menuBtn').textContent = tr(mode === 'quick' ? 'res.menuQuick' : 'res.menu');
    };
    resultView();
    show('resultScreen');
    audio.setMusicMode('result');
    // 결과 징글: 승리/신기록이면 밝은 음, 패배·무승부·게임 오버면 낮은 음 (음악 볼륨·음소거를 따르고 재생 동안 배경음악이 작아진다)
    audio.playJingle(mode === 'endless' ? (record && cleared > 0 ? 'win' : 'lose') : won ? 'win' : 'lose');
  }, 900);
}

// 밸런스 측정용 헤드리스 시뮬레이션 (콘솔): await __sim(30, { stage: 5, skill: 'average' }) / await __sim.table(20)
// 렌더링 없이 AI 대 AI 경기를 빠르게 돌려 승률을 돌려준다. 필요할 때만 sim.js를 불러온다.
window.__audio = audio; // 디버깅/테스트용: __audio.musicInfo()
window.__sim = (n, opts) => import('./sim.js?v=2026111040').then((m) => m.sim(n, opts));
window.__sim.table = (n, stages, skills) => import('./sim.js?v=2026111040').then((m) => m.table(n, stages, skills));
window.__sim.soak = (n, opts) => import('./sim.js?v=2026111040').then((m) => m.soak(n, opts)); // 내구 테스트: await __sim.soak(2) -> { matches, issues }

// 이 경기에 뒤에서 받는 캐릭터가 필요한가: 적이 3마리 이상(보통 이상·스테이지 4~)이거나 무한 모드(웨이브가 오르면 적이 4마리)
function needsLazy(cfg) {
  const n = cfg.mode === 'stage' ? stageConfig(cfg.stage).enemies : cfg.mode === 'endless' ? 4 : (DIFF[cfg.diff] || DIFF.normal).enemies;
  return n >= 3;
}
let launching = false;
async function launch(cfg) {
  if (launching) return;
  if (needsLazy(cfg) && !loader.isLoaded(LAZY_KEYS)) { // 대개 이미 받아 둔 상태. 아직이면 잠깐 안내를 띄우고 최대 BOOT_TIMEOUT까지 기다린 뒤 (없는 그림은 임시 그림) 시작
    launching = true;
    const ld = $('loading'), timer = setTimeout(() => { $('loadText').textContent = tr('load.chars'); ld.classList.remove('hidden', 'fade'); ld.classList.add('slim'); }, 250);
    await Promise.race([loader.loadChars(window.__sprites, LAZY_KEYS, POSES), wait(BOOT_TIMEOUT)]);
    clearTimeout(timer); ld.classList.add('hidden'); ld.classList.remove('slim');
    launching = false;
  }
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
  if (q) q.textContent = tr('quick.desc', { n: x.enemies, a: x.a, p: x.p });
}

const refreshEndless = () => { $('endlessBest').textContent = tr('best.endless', { n: progress.load().endlessBest }); };
function goStart() {
  audio.stopJingle();
  audio.setMusicMode('menu');
  show('resultScreen', false); show('stageScreen', false); show('startScreen');
  refreshEndless();
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
    b.innerHTML = `<b>${i}</b><span class="stars">${locked ? '🔒' : stars(st)}</span><small>${tr('stage.enemies', { n: cfg.enemies })}</small>`;
    b.setAttribute('aria-label', locked ? tr('stage.locked', { n: i }) : st ? tr('stage.stars', { n: i, s: st }) : tr('stage.plain', { n: i }));
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
    if (!w) return `<span style="font-size:14px">${tr('hud.none')}</span>`;
    const len = 16 + Math.abs(w) * 7, h = 20, y = h / 2;
    return `<svg width="${len + 4}" height="${h}" viewBox="0 0 ${len + 4} ${h}" style="${w < 0 ? 'transform:scaleX(-1)' : ''}"><path d="M2 ${y}H${len - 8}" stroke="#ffe27a" stroke-width="5" stroke-linecap="round"/><path d="M${len + 2} ${y}L${len - 10} 2V${h - 2}Z" fill="#ffe27a" stroke="#000" stroke-width="1" stroke-linejoin="round"/></svg>`;
  };
  return {
    update(gm) {
      for (let t = 0; t < 2; t++) {
        const mem = gm.units.filter((u) => u.team === t), tot = mem.reduce((a, u) => a + u.hp, 0), cap = mem.reduce((a, u) => a + u.maxHp, 0), T = teams[t];
        set('n' + t, T.name, 'textContent', (gm.teamMarks ? (t === 0 ? '● ' : '◆ ') : '') + tr('team.short.' + t) + '(' + tr(t === 0 ? 'who.me' : 'who.ai') + ')');
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
      if (gm.state === 'aim') st = gm.turnTeam === 0 ? (gm.airMode ? tr('st.mineAir', { x: Math.round(gm.airX) }) : tr('st.mineAim', { a: Math.round(gm.angle), p: Math.round(gm.power) })) : tr('st.foe');
      else if (gm.state === 'strike') st = tr('st.strike');
      set('st', status, 'textContent', st);
      if (unitEl) { // 지금 차례인 유닛(또는 마우스를 올린 유닛)의 이름·HP·특성
        const u = gm.infoUnit;
        set('un', unitEl, 'textContent', u ? tr('hud.unit', { name: u.name, hp: u.hp, max: u.maxHp, tn: u.trait.name, td: u.trait.desc }) : '');
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
      const b = $(id); if (!b) continue; b.textContent = tr(on ? 'on' : 'off'); b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on);
    }
  };
  $('bigHudToggle')?.addEventListener('click', () => { audio.play('select'); prefs.bigHud = !prefs.bigHud; progress.savePrefs({ bigHud: prefs.bigHud }); applyA11y(); });
  $('contrastToggle')?.addEventListener('click', () => { audio.play('select'); prefs.contrast = !prefs.contrast; progress.savePrefs({ contrast: prefs.contrast }); applyA11y(); });
  applyA11y();
  const refreshMute = () => {
    const m = audio.isMuted();
    muteBtn.innerHTML = `${m ? '🔇' : '🔊'}<span class="tx"> ${tr(m ? 'snd.off' : 'snd.on')}</span>`;
    muteBtn.setAttribute('aria-label', tr(m ? 'snd.turnOn' : 'snd.turnOff'));
    $('muteToggle').textContent = tr(m ? 'mute.on' : 'mute.off');
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
    if (!scr) return { open() {}, close() {}, next() {}, prev() {}, rerender() {}, isOpen: () => false };
    let i = 0;
    const render = () => {
      const st = tutStep(i + 1);
      $('tutStep').textContent = `${i + 1} / ${TUT_COUNT}`;
      $('tutIcon').textContent = st.icon;
      $('tutTitle').textContent = st.title;
      const ul = $('tutBody'); ul.textContent = '';
      for (const [tag, text] of st.lines) {
        const li = document.createElement('li'), b = document.createElement('b');
        b.textContent = tag; li.append(b, ' ' + text); ul.appendChild(li);
      }
      $('tutDots').innerHTML = TUT_ICONS.map((_, n) => `<i class="${n === i ? 'on' : ''}"></i>`).join('');
      $('tutPrev').hidden = i === 0;
      $('tutNext').textContent = tr(i === TUT_COUNT - 1 ? 'tut.start' : 'tut.next');
      $('tutNext').focus({ preventScroll: true });
    };
    const api = {
      rerender() { if (api.isOpen()) render(); },
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
      next() { if (i >= TUT_COUNT - 1) api.close(); else { i++; render(); } },
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
    const t = tr(audio.isMuted() ? 'pop.on' : 'pop.off');
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

  // 언어 선택(설정): 한국어/English. 저장은 i18n.js가 하고, 바뀌면 지금 떠 있는 화면의 글자를 모두 다시 채운다
  const langBtns = [...document.querySelectorAll('[data-lang]')];
  const syncLang = () => langBtns.forEach((b) => { const on = b.dataset.lang === getLang(); b.classList.toggle('sel', on); b.setAttribute('aria-checked', String(on)); });
  langBtns.forEach((b) => b.addEventListener('click', () => { audio.play('select'); setLang(b.dataset.lang); }));
  syncLang();
  onLangChange(() => {
    syncLang(); selectDiff(difficulty, false); refreshEndless(); refreshMute(); applyA11y(); updateVer(); popSoundLabel = '';
    if (!$('stageScreen').classList.contains('hidden')) renderStages();
    if (resultView && !$('resultScreen').classList.contains('hidden')) resultView();
    tutorial.rerender();
  });

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
      const info = mine && game.airMode ? tr('fire.target', { x: Math.round(game.airX) }) : mine ? `${Math.round(game.angle)}° · ${Math.round(game.power)}` : game.turnTeam === 1 && game.state === 'aim' ? tr('fire.foe') : '';
      if (fireFx.textContent !== info) fireFx.textContent = info;
      const pw = mine ? Math.round(game.power) + '%' : '0%';
      if (fireBtn.dataset.pw !== pw) { fireBtn.dataset.pw = pw; fireBtn.style.setProperty('--pw', pw); }
      pauseBtn.disabled = !canPause();
      compactTick();
      const fl = game.airMode ? tr('fire.air') : tr('fire.label');
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
}

// 시작: 로딩 화면(진행 막대)에서 첫 화면에 필요한 소리·그림을 받고, 끝나면(또는 BOOT_TIMEOUT 뒤) 시작 화면으로 부드럽게 넘어간다. 실패해도 게임은 멈추지 않는다
async function boot() {
  const ld = $('loading'), fill = $('loadBar').firstElementChild, count = $('loadCount'), note = $('loadNote');
  $('loadText').textContent = tr('load.text');
  await loader.placeholder();
  const sprites = loader.createSprites([...new Set(CHAR_KEYS)], POSES);
  window.__sprites = sprites; // 디버깅/테스트용
  const sndTotal = audio.firstScreenFiles().length, imgTotal = CORE_KEYS.length * POSES.length, total = sndTotal + imgTotal;
  let snd = 0, img = 0; // 성공한 개수
  let sndEnd = 0, imgEnd = 0; // 끝난(성공+실패) 개수
  const paint = () => {
    const n = sndEnd + imgEnd;
    fill.style.width = `${Math.round((100 * n) / total)}%`;
    $('loadBar').setAttribute('aria-valuenow', String(Math.round((100 * n) / total)));
    count.textContent = `${n} / ${total}`;
  };
  paint();
  const t0 = performance.now();
  const work = Promise.all([
    audio.preload((ok) => { sndEnd++; if (ok) snd++; paint(); }),
    loader.loadChars(sprites, CORE_KEYS, POSES, (ok) => { imgEnd++; if (ok) img++; paint(); }),
  ]);
  await Promise.race([work, wait(BOOT_TIMEOUT)]);
  const bad = [];
  if (snd < sndTotal) bad.push(tr('load.sounds'));
  if (img < imgTotal) bad.push(tr('load.images'));
  if (bad.length) { note.textContent = bad.join(' · '); note.classList.remove('hidden'); }
  await wait(Math.max(bad.length ? 900 : 0, MIN_SHOW - (performance.now() - t0)));
  try { setup(sprites); } catch (err) {
    console.error(err);
    $('loadText').textContent = tr('load.fail', { msg: err.message });
    return;
  }
  if (bad.length) showToast(bad.join(' · '));
  document.body.classList.remove('booting');
  ld.classList.add('fade'); // 부드럽게 사라진 뒤 숨김
  setTimeout(() => ld.classList.add('hidden'), 450);
  setTimeout(() => loader.loadChars(sprites, LAZY_KEYS, POSES), 300); // 나머지 캐릭터는 뒤에서
}
boot();
