// 진입점: 에셋 로딩, 입력, UI, 메인 루프
import { Game, W, H, CHARACTERS, WALK_FRAMES, WEAPONS } from './game.js';
import * as audio from './audio.js';

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
const weaponBtns = [1, 2, 3, 4, 5].map((n) => $('bW' + n));

function showResult(winner) {
  setTimeout(() => {
    $('resultTitle').textContent = winner === 0 ? '승리!' : winner === 1 ? '패배...' : '무승부';
    $('resultSub').textContent = winner === 0 ? '상대 팀을 모두 쓰러뜨렸습니다.' : winner === 1 ? '우리 팀이 모두 쓰러졌습니다.' : '양 팀이 모두 쓰러졌습니다.';
    $('resultScreen').classList.remove('hidden');
  }, 900);
}

function startMatch(diff) {
  difficulty = diff;
  audio.initAudio();
  audio.play('select');
  $('startScreen').classList.add('hidden');
  $('resultScreen').classList.add('hidden');
  game.newMatch(diff);
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
  $('againBtn').addEventListener('click', () => startMatch(difficulty));
  $('menuBtn').addEventListener('click', () => { audio.play('select'); $('resultScreen').classList.add('hidden'); $('startScreen').classList.remove('hidden'); });

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
  $('startScreen').classList.remove('hidden');
  $('loading').classList.add('hidden');
}

loadImages().then(setup).catch((err) => {
  console.error(err);
  $('loading').textContent = '에셋을 불러오지 못했습니다: ' + err.message;
});
