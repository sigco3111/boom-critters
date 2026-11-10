// 진입점: 에셋 로딩, 입력, UI, 메인 루프
import { Game, W, H, TEAMS, CHARACTERS, WALK_FRAMES, WEAPONS, STAGE_COUNT, stageConfig, waveConfig } from './game.js';
import * as audio from './audio.js';
import * as progress from './progress.js';

const POSES = ['idle', ...Array.from({ length: WALK_FRAMES }, (_, i) => 'walk' + i), 'jump', 'fall', 'hit', 'attack0', 'hold', 'down'];
const CHAR_KEYS = CHARACTERS.flat().map(([k]) => k);
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const g = canvas.getContext('2d');
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

// 브라우저 정책상 소리는 사용자 동작 뒤에만 가능 — 첫 클릭/터치/키 입력에서 오디오와 배경음악 시작
function unlockAudio() { // 재생이 막혀 있으면 다음 입력에서도 재시도 (initAudio가 suspended 상태면 resume)
  audio.initAudio();
  audio.startMusic();
}
['pointerdown', 'touchend', 'keydown'].forEach((t) => window.addEventListener(t, unlockAudio, true));

// 터치 화면 판별: 주 입력이 손가락(coarse)이거나 좁은 화면이거나, 실제 터치 입력이 한 번이라도 들어오면 켠다
// 세로 화면 안내(가로로 돌리면 더 크게 보임): 닫으면 이번 접속 동안 다시 안 보임
try { if (sessionStorage.getItem('boom-hint-off') === '1') document.body.classList.add('hint-off'); } catch (e) { /* ignore */ }
$('rotateHintClose').addEventListener('click', () => {
  document.body.classList.add('hint-off');
  try { sessionStorage.setItem('boom-hint-off', '1'); } catch (e) { /* ignore */ }
});

let game = null, difficulty = 'normal', touchSticky = false;
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
window.addEventListener('resize', () => setTouchUI());
coarseMQ.addEventListener?.('change', () => setTouchUI());
portraitMQ.addEventListener?.('change', () => setTouchUI());
let endlessRecord = false;
let current = { mode: 'quick' };   // 현재/마지막 매치: { mode: 'quick'|'stage'|'endless', stage? }
const weaponBtns = [1, 2, 3, 4, 5].map((n) => $('bW' + n));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
// 설정·크레딧·도움말 같은 모달이 열려 있으면 경기를 멈추고 게임 키 입력을 막음
let modalOpen = false;
const MODALS = ['settingsScreen', 'helpScreen', 'creditsScreen'];

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
  }, 900);
}

function launch(cfg) {
  current = cfg; endlessRecord = false;
  audio.initAudio();
  audio.play('select');
  audio.setMusicMode('match');
  ['startScreen', 'stageScreen', 'resultScreen'].forEach((id) => show(id, false));
  if (cfg.mode === 'stage') game.newMatch('normal', stageConfig(cfg.stage));
  else if (cfg.mode === 'endless') game.newMatch('normal', waveConfig(1));
  else { difficulty = cfg.diff; game.newMatch(cfg.diff); }
}
const startMatch = (diff) => launch({ mode: 'quick', diff });

function goStart() {
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
  const timer = $('hudTimer'), arrow = $('hudWindArrow'), num = $('hudWindNum'), mode = $('hudMode'), status = $('hudStatus');
  const windSvg = (w) => {
    if (!w) return '<span style="font-size:14px">없음</span>';
    const len = 16 + Math.abs(w) * 7, h = 20, y = h / 2;
    return `<svg width="${len + 4}" height="${h}" viewBox="0 0 ${len + 4} ${h}" style="${w < 0 ? 'transform:scaleX(-1)' : ''}"><path d="M2 ${y}H${len - 8}" stroke="#ffe27a" stroke-width="5" stroke-linecap="round"/><path d="M${len + 2} ${y}L${len - 10} 2V${h - 2}Z" fill="#ffe27a" stroke="#000" stroke-width="1" stroke-linejoin="round"/></svg>`;
  };
  return {
    update(gm) {
      for (let t = 0; t < 2; t++) {
        const mem = gm.units.filter((u) => u.team === t), tot = mem.reduce((a, u) => a + u.hp, 0), cap = mem.length * 100, T = teams[t];
        set('n' + t, T.name, 'textContent', TEAMS[t].name.replace(' 팀', '') + (t === 0 ? '(나)' : '(AI)'));
        set('t' + t, T.tot, 'textContent', `${tot}/${cap}`);
        set('b' + t, T.bar, 'style', `width:${cap ? (100 * tot) / cap : 0}%;--tc:${TEAMS[t].color}`);
        const act = gm.state === 'aim' || gm.state === 'flying' ? gm.activeUnit : null;
        set('u' + t, T.units, 'innerHTML', mem.map((u) => `<span class="${u.alive ? (u === act ? 'act' : '') : 'dead'}">${u.alive ? u.hp : '✕'}</span>`).join(''));
      }
      const tm = Math.max(0, Math.ceil(gm.timer || 0));
      set('tm', timer, 'textContent', String(tm));
      set('tl', timer, 'className', tm <= 5 && gm.state === 'aim' ? 'low' : '');
      set('wa', arrow, 'innerHTML', windSvg(gm.wind || 0));
      set('wn', num, 'textContent', String(Math.abs(gm.wind || 0)));
      set('md', mode, 'textContent', gm.modeLabel);
      let st = '';
      if (gm.state === 'aim') st = gm.turnTeam === 0 ? `내 차례 · 각도 ${Math.round(gm.angle)}° · 파워 ${Math.round(gm.power)}` : '상대가 조준 중...';
      set('st', status, 'textContent', st);
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
  syncScale(); new ResizeObserver(syncScale).observe(canvas);
  const hud = makeHud();
  const k = game.keys;

  // 시작 화면
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => startMatch(b.dataset.diff)));
  $('stageModeBtn').addEventListener('click', goStageSelect);
  $('endlessModeBtn').addEventListener('click', () => launch({ mode: 'endless' }));
  $('stageBackBtn').addEventListener('click', () => { audio.play('select'); goStart(); });
  $('againBtn').addEventListener('click', () => launch({ ...current }));
  $('nextBtn').addEventListener('click', () => launch({ mode: 'stage', stage: Math.min(STAGE_COUNT, current.stage + 1) }));
  $('stageSelBtn').addEventListener('click', goStageSelect);
  $('menuBtn').addEventListener('click', () => { audio.play('select'); goStart(); });
  game.onWave = (n) => { if (progress.recordEndless(n)) endlessRecord = true; };
  goStart();

  // 음소거 + 설정 패널(음악/효과음 볼륨, localStorage 저장)
  const muteBtn = $('muteBtn');
  const refreshMute = () => {
    muteBtn.innerHTML = audio.isMuted() ? '🔇<span class="tx"> 소리 꺼짐</span>' : '🔊<span class="tx"> 소리 켜짐</span>';
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
  const openModal = (id) => {
    modalOpen = true; show(id); $('controls').inert = true;
    for (const n in k) k[n] = false; game.releaseCharge(); game.drag = null;
  };
  const closeModal = (id) => { show(id, false); modalOpen = MODALS.some((m) => !$(m).classList.contains('hidden')); $('controls').inert = modalOpen; };
  // 게임 방법·크레딧: 시작 화면에서 열고 닫으면 시작 화면으로 복귀
  for (const [open, scr, close] of [['helpBtn', 'helpScreen', 'helpCloseBtn'], ['creditsBtn', 'creditsScreen', 'creditsCloseBtn']]) {
    $(open).addEventListener('click', () => { audio.play('select'); openModal(scr); });
    $(close).addEventListener('click', () => { audio.play('select'); closeModal(scr); });
  }
  $('gearBtn').addEventListener('click', () => { audio.play('select'); openModal('settingsScreen'); });
  $('settingsCloseBtn').addEventListener('click', () => { audio.play('select'); closeModal('settingsScreen'); });

  // 키보드
  const map = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalOpen) { // 모달이 열려 있으면 게임 키 대신 M(음소거)·Esc(닫기)만 처리
      if (e.code === 'KeyM' && !e.repeat) muteBtn.click();
      else if (e.code === 'Escape') MODALS.forEach((m) => !$(m).classList.contains('hidden') && closeModal(m));
      return;
    }
    if (map[e.code]) { k[map[e.code]] = true; e.preventDefault(); return; }
    if (e.repeat) { if (['Space', 'KeyW'].includes(e.code)) e.preventDefault(); return; }
    if (e.code === 'KeyW') { game.playerJump(); e.preventDefault(); }
    else if (e.code === 'Space') { game.beginCharge(); e.preventDefault(); }
    else if (/^(Digit|Numpad)[1-5]$/.test(e.code)) game.setWeapon(Number(e.code.slice(-1)) - 1);
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
  let dragging = null, aimPtr = null; // 각도만 조절 중인 포인터 id / 드래그 발사 중인 포인터 id
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
    if (finger && px >= W / 2 && aimPtr === null) {
      const max = Math.min(300, (140 * W) / canvas.getBoundingClientRect().width); // 손가락 약 140px 끌면 최대 파워
      if (game.dragBegin(px, py, max)) { aimPtr = e.pointerId; canvas.setPointerCapture(e.pointerId); }
      return;
    }
    dragging = e.pointerId; canvas.setPointerCapture(e.pointerId); game.aimTo(px, py);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === aimPtr) game.dragMove(...toGame(e));
    else if (e.pointerId === dragging) game.aimTo(...toGame(e));
  });
  const endDrag = (fireIt) => (e) => {
    if (e.pointerId === aimPtr) { aimPtr = null; game.dragEnd(fireIt); }
    if (e.pointerId === dragging) dragging = null;
  };
  canvas.addEventListener('pointerup', endDrag(true));
  canvas.addEventListener('pointercancel', endDrag(false));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS 핀치 줌 방지

  // 메인 루프
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    try {
      if (!modalOpen) game.update(dt);
      game.draw(g);
    } catch (err) { console.error(err); }
    if (game.domHud) hud.update(game);
    // 메뉴/모달이 떠 있으면 가로 화면의 겹침 컨트롤을 숨김
    document.body.classList.toggle('menu', ['startScreen', 'stageScreen', 'resultScreen', ...MODALS].some((id) => !$(id).classList.contains('hidden')));
    // 무기 버튼 상태 표시
    weaponBtns.forEach((b, i) => {
      b.classList.toggle('sel', game.weapon === i);
      const w = WEAPONS[i], a = game.ammo ? game.ammo[0][i] : 0;
      b.disabled = !!w.disabled || a <= 0;
      const amt = w.disabled ? 'soon' : a === Infinity ? '∞' : `×${a}`;
      const label = `${i + 1} ${w.name}|${amt}`;
      if (b.dataset.label !== label) { // 터치 화면에서는 두 줄(이름 / 탄약)로 보인다
        b.dataset.label = label;
        b.innerHTML = `<span class="wn">${i + 1} ${w.name}</span><span class="wa">${amt}</span>`;
      }
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  $('loading').classList.add('hidden');
}

loadImages().then(setup).catch((err) => {
  console.error(err);
  $('loading').textContent = '에셋을 불러오지 못했습니다: ' + err.message;
});
