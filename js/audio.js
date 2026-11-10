// Web Audio 효과음·배경음악
// 효과음: Kenney Impact Sounds / Interface Sounds, Battle at sea by Thimras — 모두 CC0
// 음악: Enchanted Festival by Matthew Pablo (CC-BY 3.0) — CREDITS.md 참고
const NAMES = ['explosion', 'fire', 'land', 'step', 'hit', 'select', 'win', 'lose', 'tick', 'switch',
  'sea_cannon', 'sea_boom', 'sea_boom_big', 'sea_boom_small', 'sea_splash'];
const MUSIC_URL = 'assets/music/enchanted-festival-loop.ogg';
const MUSIC_LEVEL = { menu: 0.7, match: 1, result: 0.3 }; // 화면별 음악 배율
const MUSIC_VOL = 0.45, SFX_VOL = 0.7;

let ctx = null, sfxGain = null, musicGain = null, duck = null, loading = null;
const buffers = {};
let music = { buf: null, src: null, want: false, mode: 'menu' };
let muted = false;
try { muted = localStorage.getItem('boom-muted') === '1'; } catch (e) { /* ignore */ }

const applyGains = () => {
  if (!ctx) return;
  sfxGain.gain.value = muted ? 0 : SFX_VOL;
  musicGain.gain.value = muted ? 0 : MUSIC_VOL;
};

async function loadBuffer(url) {
  const res = await fetch(url);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

export function initAudio() {
  if (loading) { if (ctx && ctx.state === 'suspended') ctx.resume(); return loading; }
  loading = (async () => {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination);
      musicGain = ctx.createGain(); duck = ctx.createGain();
      duck.connect(musicGain); musicGain.connect(ctx.destination);
      duck.gain.value = MUSIC_LEVEL[music.mode];
      applyGains();
      if (ctx.state === 'suspended') ctx.resume();
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
      });
      loadBuffer(MUSIC_URL).then((b) => { music.buf = b; if (music.want) startMusic(); }).catch(() => { /* 음악 없이 진행 */ });
      await Promise.all(NAMES.map(async (n) => {
        try { buffers[n] = await loadBuffer(`assets/sfx/${n}.ogg`); } catch (e) { /* 디코드 실패는 무시 (소리 없이 진행) */ }
      }));
    } catch (e) { ctx = null; }
  })();
  return loading;
}

export function play(name, { rate = 1, vol = 1 } = {}) {
  if (!ctx || muted || !buffers[name]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(sfxGain);
  src.start();
}

// 배경음악: 루프 이음매(끝→처음)는 파일 자체에 0.4초 크로스페이드를 구워 두었으므로 버퍼 루프로 틈 없이 반복
export function startMusic() {
  music.want = true;
  if (!ctx || !music.buf || music.src) return;
  const src = ctx.createBufferSource();
  src.buffer = music.buf; src.loop = true;
  const fade = ctx.createGain();
  fade.gain.setValueAtTime(0, ctx.currentTime);
  fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
  src.connect(fade); fade.connect(duck);
  src.start();
  music.src = src;
}
// 'menu' | 'match' | 'result' — 결과 화면에서는 음악을 낮춤
export function setMusicMode(mode) {
  music.mode = mode;
  if (duck) duck.gain.setTargetAtTime(MUSIC_LEVEL[mode], ctx.currentTime, 0.4);
}
export function musicInfo() {
  return { ctx: ctx && ctx.state, sfxLoaded: Object.keys(buffers).length, loaded: !!music.buf, playing: !!music.src, mode: music.mode, duck: duck && duck.gain.value, music: musicGain && musicGain.gain.value, sfx: sfxGain && sfxGain.gain.value, muted };
}

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('boom-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  applyGains();
}
export function isMuted() { return muted; }
