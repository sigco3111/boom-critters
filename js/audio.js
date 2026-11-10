// Web Audio 효과음·배경음악
// 효과음: Kenney Impact Sounds / Interface Sounds, Battle at sea by Thimras — 모두 CC0
// 음악: Enchanted Festival by Matthew Pablo (CC-BY 3.0) — CREDITS.md 참고
// 결과 화면 징글: Kenney Music Jingles (CC0) — 음악 볼륨·음소거를 따르고, 재생하는 동안 배경음악을 낮춘다
// 번개·공습·수류탄 카운트다운·치유 효과음은 파일 없이 Web Audio(노이즈·오실레이터)로 합성 — 모두 sfxGain을 거치므로 효과음 볼륨·음소거를 따른다
const NAMES = ['explosion', 'fire', 'land', 'step', 'hit', 'select', 'win', 'lose', 'tick', 'switch',
  'sea_cannon', 'sea_boom', 'sea_boom_big', 'sea_boom_small', 'sea_splash'];
const MUSIC_URL = 'assets/music/enchanted-festival-loop.ogg';
const MUSIC_LEVEL = { menu: 0.7, match: 1, result: 0.3 }; // 화면별 음악 배율
// 결과 화면 징글 (승리: 스틸 드럼이 올라가는 밝은 음 / 패배: 피치카토가 반음씩 내려오는 낮은 음). gain은 파일 음량 차이를 맞추는 값
const JINGLES = { win: { url: 'assets/music/jingle-win.ogg', gain: 1.0 }, lose: { url: 'assets/music/jingle-lose.ogg', gain: 1.5 } };
const JINGLE_DUCK = 0.08;  // 징글이 나오는 동안 배경음악 배율

let ctx = null, sfxGain = null, musicGain = null, duck = null, loading = null;
const buffers = {}, jingleBufs = {};
let jingle = { src: null, gain: null, timer: 0 };
const jingleStats = { played: {}, errors: 0, lastError: '' };
let music = { buf: null, src: null, want: false, mode: 'menu' };
let muted = false;
const vols = { music: 0.5, sfx: 0.7 }; // 0~1, localStorage('boom-volumes')에 저장
try {
  muted = localStorage.getItem('boom-muted') === '1';
  const v = JSON.parse(localStorage.getItem('boom-volumes') || '{}');
  for (const k of ['music', 'sfx']) if (Number.isFinite(v[k])) vols[k] = Math.min(1, Math.max(0, v[k]));
} catch (e) { /* ignore */ }

const synthStats = { calls: {}, errors: 0, lastError: '' }; // 합성 효과음 호출·오류 횟수 (musicInfo로 확인)
let noiseBuf = null;

const applyGains = () => {
  if (!ctx) return;
  sfxGain.gain.value = muted ? 0 : vols.sfx;
  musicGain.gain.value = muted ? 0 : vols.music;
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
      for (const k of Object.keys(JINGLES)) loadBuffer(JINGLES[k].url).then((b) => { jingleBufs[k] = b; }).catch(() => { /* 징글 없이 진행 */ });
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

// ---------- 합성 효과음 ----------
// 모든 합성음은 try/catch로 감싸 노드 생성이 실패해도 게임이 멈추지 않는다
function noise() { // 1초짜리 화이트 노이즈 버퍼 (한 번만 만들어 재사용)
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
// 엔벨로프 게인 노드: 0 -> peak(att초) -> 0(dur초에 지수 감쇠)
function env(t, peak, att, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(sfxGain);
  return g;
}
function tone(type, f0, f1, t, dur, peak, att = 0.01) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(t, peak, att, dur));
  o.start(t); o.stop(t + dur + 0.05);
}
const SYNTH = {
  // 번개: 노이즈 버스트를 하이패스 스윕(600Hz -> 7kHz)으로 지지직 + 불규칙한 크랙클 진폭, 아래에 짧은 하강 지직음
  lightning(t, { vol = 1 }) {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.Q.value = 2;
    hp.frequency.setValueAtTime(600, t); hp.frequency.exponentialRampToValueAtTime(7000, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < 14; k++) g.gain.setValueAtTime((k % 2 ? 0.25 : 1) * (0.5 + Math.random() * 0.5) * 0.55 * vol, t + k * 0.02); // 크랙클
    g.gain.setValueAtTime(0.4 * vol, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(hp); hp.connect(g); g.connect(sfxGain);
    src.start(t); src.stop(t + 0.45);
    tone('sawtooth', 1400, 140, t, 0.2, 0.18 * vol, 0.005);
  },
  // 공습 휘파람: 사인파가 높은 음에서 낮은 음으로 떨어지며 점점 커짐 (폭탄마다 음높이를 조금씩 달리)
  whistle(t, { vol = 1, dur = 0.8, pitch = 1 }) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2300 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(520 * pitch, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * vol, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // 수류탄 카운트다운 똑딱: 짧은 사각파 클릭 + 필터링된 노이즈 점 (stage 0~2: 퓨즈가 줄수록 높고 급하게)
  grenadeTick(t, { vol = 1, stage = 0 }) {
    const f = 1500 + stage * 450;
    tone('square', f, f * 0.6, t, 0.045, 0.16 * vol, 0.002);
    tone('square', f * 0.5, f * 0.35, t + 0.07, 0.04, 0.09 * vol, 0.002);
  },
  // 치유 차임: 도-미-솔-도 상승 아르페지오 (사인 + 한 옥타브 위 삼각파 배음)
  heal(t, { vol = 1 }) {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      const s = t + i * 0.085;
      tone('sine', f, f, s, 0.5, 0.2 * vol, 0.01);
      tone('triangle', f * 2, f * 2, s, 0.25, 0.04 * vol, 0.01);
    });
  },
};
export function playSynth(name, opts = {}) {
  if (!ctx || muted || !sfxGain || !SYNTH[name]) return;
  try {
    SYNTH[name](ctx.currentTime + (opts.delay || 0), opts);
    synthStats.calls[name] = (synthStats.calls[name] || 0) + 1;
  } catch (e) { synthStats.errors++; synthStats.lastError = `${name}: ${e && e.message}`; }
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
  if (duck && !jingle.src) duck.gain.setTargetAtTime(MUSIC_LEVEL[mode], ctx.currentTime, 0.4); // 징글이 끝나면 stopJingle이 현재 모드 값으로 되돌린다
}

// 결과 화면 징글: kind 'win' | 'lose'. musicGain(음악 볼륨·음소거)을 거치고, 재생하는 동안 배경음악을 낮췄다가 끝나면 되돌린다.
// 소리가 꺼져 있거나 아직 불러오지 못했으면 아무것도 하지 않는다. 반환: 재생했으면 true
export function playJingle(kind) {
  stopJingle();
  const j = JINGLES[kind], buf = jingleBufs[kind];
  if (!ctx || !musicGain || muted || !j || !buf) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = j.gain;
    src.connect(g); g.connect(musicGain);
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(JINGLE_DUCK, t, 0.08);
    jingle = { src, gain: g, timer: setTimeout(() => stopJingle(), (buf.duration + 0.5) * 1000) };
    src.onended = () => { if (jingle.src === src) stopJingle(); };
    src.start(t + 0.05);
    jingleStats.played[kind] = (jingleStats.played[kind] || 0) + 1;
    return true;
  } catch (e) { jingleStats.errors++; jingleStats.lastError = `${kind}: ${e && e.message}`; jingle = { src: null, gain: null, timer: 0 }; return false; }
}
// 진행 중인 징글을 멈추고 배경음악 배율을 현재 화면 모드로 되돌림
export function stopJingle() {
  const { src, gain, timer } = jingle;
  if (!src) return;
  clearTimeout(timer);
  jingle = { src: null, gain: null, timer: 0 };
  try { src.onended = null; gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03); src.stop(ctx.currentTime + 0.15); } catch (e) { /* 이미 끝남 */ }
  if (duck) duck.gain.setTargetAtTime(MUSIC_LEVEL[music.mode], ctx.currentTime, 0.4);
}
export function musicInfo() {
  return { ctx: ctx && ctx.state, sfxLoaded: Object.keys(buffers).length, loaded: !!music.buf, playing: !!music.src, mode: music.mode, duck: duck && duck.gain.value, music: musicGain && musicGain.gain.value, sfx: sfxGain && sfxGain.gain.value, muted, synth: synthStats, jingles: { loaded: Object.keys(jingleBufs), playing: !!jingle.src, ...jingleStats } };
}

export function getVolumes() { return { ...vols }; }
// kind: 'music' | 'sfx', v: 0~1
export function setVolume(kind, v) {
  vols[kind] = Math.min(1, Math.max(0, v));
  try { localStorage.setItem('boom-volumes', JSON.stringify(vols)); } catch (e) { /* ignore */ }
  applyGains();
}

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('boom-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  applyGains();
}
export function isMuted() { return muted; }
