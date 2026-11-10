// 진입점: 에셋 로딩, 입력, UI, 메인 루프
import { Game, W, H, CHARACTERS, WALK_FRAMES, WEAPONS, STAGE_COUNT, stageConfig, waveConfig } from './game.js';
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

let game = null, difficulty = 'normal';
let endlessRecord = false;
let current = { mode: 'quick' };   // 현재/마지막 매치: { mode: 'quick'|'stage'|'endless', stage? }
const weaponBtns = [1, 2, 3, 4, 5].map((n) => $('bW' + n));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

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
  }, 900);
}

function launch(cfg) {
  current = cfg; endlessRecord = false;
  audio.initAudio();
  audio.play('select');
  ['startScreen', 'stageScreen', 'resultScreen'].forEach((id) => show(id, false));
  if (cfg.mode === 'stage') game.newMatch('normal', stageConfig(cfg.stage));
  else if (cfg.mode === 'endless') game.newMatch('normal', waveConfig(1));
  else { difficulty = cfg.diff; game.newMatch(cfg.diff); }
}
const startMatch = (diff) => launch({ mode: 'quick', diff });

function goStart() {
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
    b.innerHTML = `<b>${i}</b><span class="stars">${locked ? '🔒' : st ? stars(st) : ''}</span><small>적 ${cfg.enemies}마리</small>`;
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

function setup(sprites) {
  game = new Game(sprites);
  window.__game = game; // 디버깅/테스트용
  game.onOver = showResult;
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

  // 음소거
  const muteBtn = $('muteBtn');
  const refreshMute = () => { muteBtn.textContent = audio.isMuted() ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'; };
  muteBtn.addEventListener('click', () => { audio.initAudio(); audio.setMuted(!audio.isMuted()); refreshMute(); });
  refreshMute();

  // 키보드
  const map = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (map[e.code]) { k[map[e.code]] = true; e.preventDefault(); return; }
    if (e.repeat) { if (['Space', 'KeyW'].includes(e.code)) e.preventDefault(); return; }
    if (e.code === 'KeyW') { game.playerJump(); e.preventDefault(); }
    else if (e.code === 'Space') { game.beginCharge(); e.preventDefault(); }
    else if (/^(Digit|Numpad)[1-5]$/.test(e.code)) game.setWeapon(Number(e.code.slice(-1)) - 1);
    else if (e.code === 'KeyM') muteBtn.click();
  });
  window.addEventListener('keyup', (e) => {
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
  let dragging = false;
  const toGame = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  canvas.addEventListener('pointerdown', (e) => {
    const [px, py] = toGame(e), slot = game.slotAt(px, py);
    if (slot >= 0) { game.setWeapon(slot); return; } // 하단 HUD 무기 버튼
    dragging = true; canvas.setPointerCapture(e.pointerId); game.aimTo(px, py);
  });
  canvas.addEventListener('pointermove', (e) => { if (dragging) game.aimTo(...toGame(e)); });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // 메인 루프
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    try {
      game.update(dt);
      game.draw(g);
    } catch (err) { console.error(err); }
    // 무기 버튼 상태 표시
    weaponBtns.forEach((b, i) => {
      b.classList.toggle('sel', game.weapon === i);
      const w = WEAPONS[i], a = game.ammo ? game.ammo[0][i] : 0;
      b.disabled = !!w.disabled || a <= 0;
      const label = `${i + 1} ${w.name}${w.disabled ? ' (soon)' : a === Infinity ? '' : ` ×${a}`}`;
      if (b.textContent !== label) b.textContent = label;
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
