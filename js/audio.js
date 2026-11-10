// Web Audio 효과음 (Kenney Impact Sounds / Interface Sounds, Battle at sea by Thimras — 모두 CC0)
const NAMES = ['explosion', 'fire', 'land', 'step', 'hit', 'select', 'win', 'lose', 'tick', 'switch',
  'sea_cannon', 'sea_boom', 'sea_boom_big', 'sea_boom_small', 'sea_splash'];
let ctx = null, master = null, loading = null;
const buffers = {};
let muted = false;
try { muted = localStorage.getItem('boom-muted') === '1'; } catch (e) { /* ignore */ }

export function initAudio() {
  if (loading) { if (ctx && ctx.state === 'suspended') ctx.resume(); return loading; }
  loading = (async () => {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ctx.destination);
      if (ctx.state === 'suspended') ctx.resume();
      await Promise.all(NAMES.map(async (n) => {
        try {
          const res = await fetch(`assets/sfx/${n}.ogg`);
          buffers[n] = await ctx.decodeAudioData(await res.arrayBuffer());
        } catch (e) { /* 디코드 실패는 무시 (소리 없이 진행) */ }
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
  src.connect(g); g.connect(master);
  src.start();
}

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('boom-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.7;
}
export function isMuted() { return muted; }
