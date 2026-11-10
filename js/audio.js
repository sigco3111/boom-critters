// Web Audio 효과음·배경음악
// 효과음: Kenney Impact Sounds / Interface Sounds, Battle at sea by Thimras — 모두 CC0
// 음악: Enchanted Festival by Matthew Pablo (CC-BY 3.0) — CREDITS.md 참고
// 결과 화면 징글: Kenney Music Jingles (CC0) — 음악 볼륨·음소거를 따르고, 재생하는 동안 배경음악을 낮춘다
// 번개·공습·수류탄 카운트다운·치유 효과음은 파일 없이 Web Audio(노이즈·오실레이터)로 합성 — 모두 sfxGain을 거치므로 효과음 볼륨·음소거를 따른다
// OGG를 디코드하지 못하는 기기(구형 iOS Safari 등): 음악은 원곡 MP3(assets/music/enchanted-festival.mp3)로 대체하고,
// 효과음·결과 징글은 파일 없이 합성한 소리(FALLBACK)로 대체한다 — 효과음은 sfxGain, 징글은 musicGain을 거치므로 볼륨·음소거를 그대로 따른다
import { local } from './storage.js?v=2026111042';
const NAMES = ['explosion', 'fire', 'land', 'step', 'hit', 'select', 'win', 'lose', 'tick', 'switch',
  'sea_cannon', 'sea_boom', 'sea_boom_big', 'sea_boom_small', 'sea_splash'];
const MUSIC_URL = 'assets/music/enchanted-festival-loop.ogg';
const MUSIC_URL_MP3 = 'assets/music/enchanted-festival.mp3'; // 원곡 전체(약 2분 6초) — OGG를 못 읽을 때만 받는다
const MUSIC_LEVEL = { menu: 0.7, match: 1, result: 0.3 }; // 화면별 음악 배율
// 결과 화면 징글 (승리: 스틸 드럼이 올라가는 밝은 음 / 패배: 피치카토가 반음씩 내려오는 낮은 음). gain은 파일 음량 차이를 맞추는 값
const JINGLES = { win: { url: 'assets/music/jingle-win.ogg', gain: 1.0 }, lose: { url: 'assets/music/jingle-lose.ogg', gain: 1.5 } };
const JINGLE_DUCK = 0.08;  // 징글이 나오는 동안 배경음악 배율

let ctx = null, sfxGain = null, musicGain = null, duck = null, loading = null;
const buffers = {}, jingleBufs = {};
let jingle = { src: null, gain: null, timer: 0 };
const jingleStats = { played: {}, errors: 0, lastError: '' };
let music = { buf: null, src: null, want: false, mode: 'menu', format: '' };
const sfxFailed = {}, jingleFailed = {}; // 파일을 못 받았거나 디코드에 실패한 이름 -> 합성 대체음을 쓴다
const fallbackStats = { sfx: {}, jingle: {}, errors: 0, lastError: '' };
// 형식 지원 여부 (canPlayType: '' 이면 미지원). 최종 판단은 decodeAudioData 성공 여부
function detectFormats() {
  const f = { ogg: false, mp3: false, wav: false };
  try {
    const a = document.createElement('audio');
    if (a && a.canPlayType) {
      f.ogg = !!a.canPlayType('audio/ogg; codecs="vorbis"');
      f.mp3 = !!a.canPlayType('audio/mpeg');
      f.wav = !!a.canPlayType('audio/wav');
    }
  } catch (e) { f.ogg = f.mp3 = f.wav = false; }
  return f;
}
let formats = { ogg: true, mp3: true, wav: true }; // initAudio에서 실제 값으로 갱신
let muted = false;
const vols = { music: 0.5, sfx: 0.7 }; // 0~1, localStorage('boom-volumes')에 저장
try {
  muted = local.get('boom-muted') === '1';
  const v = JSON.parse(local.get('boom-volumes') || '{}');
  for (const k of ['music', 'sfx']) if (Number.isFinite(v[k])) vols[k] = Math.min(1, Math.max(0, v[k]));
} catch (e) { /* ignore */ }

const synthStats = { calls: {}, errors: 0, lastError: '' }; // 합성 효과음 호출·오류 횟수 (musicInfo로 확인)
let noiseBuf = null;
let hold = false; // true인 동안(로딩 화면 예열 중) 모든 소리를 건너뜀
export function setHold(b) { hold = !!b; }

const applyGains = () => {
  if (!ctx) return;
  sfxGain.gain.value = muted ? 0 : vols.sfx;
  musicGain.gain.value = muted ? 0 : vols.music;
};

// 파일 내려받기(바이트): 같은 주소는 한 번만 받아 Promise를 재사용한다. 로딩 화면의 preload()가 첫 화면용 파일을 미리 받아 두면 initAudio가 다시 받지 않는다.
// 실패하면 캐시에서 빼서 나중에 다시 시도할 수 있게 한다 (컨텍스트 없이 받을 수 있어 사용자 입력 전에도 가능)
const raw = new Map();
function fetchRaw(url) {
  if (!raw.has(url)) {
    raw.set(url, fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    }).catch((e) => { raw.delete(url); throw e; }));
  }
  return raw.get(url);
}
// 첫 화면(시작 메뉴)에 필요한 파일: 배경음악(지원 형식에 맞는 한 가지)과 버튼 효과음. 나머지 효과음·징글은 첫 입력 뒤 initAudio가 뒤에서 받는다
export function firstScreenFiles() {
  const f = detectFormats();
  return f.ogg ? [MUSIC_URL, 'assets/sfx/select.ogg'] : [MUSIC_URL_MP3];
}
// 로딩 화면용: 첫 화면 파일을 미리 받는다. 파일 하나가 끝날 때마다 onEach(성공 여부)를 부르며, 실패해도 예외 없이 끝난다
export function preload(onEach = () => {}) {
  return Promise.all(firstScreenFiles().map((u) => fetchRaw(u).then(() => onEach(true), () => onEach(false))));
}

// 파일을 못 받거나 디코드에 실패하면 reject — 호출하는 쪽에서 조용히 무시한다 (Safari 구버전은 Promise 형태가 없어 콜백 형태로 대체)
async function loadBuffer(url) {
  const data = (await fetchRaw(url)).slice(0); // 복사본을 디코드 (원본은 아래에서 비움)
  raw.delete(url);
  const c = ctx;
  return new Promise((resolve, reject) => {
    try {
      const p = c.decodeAudioData(data, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    } catch (e) { reject(e); }
  });
}

// 컨텍스트가 'suspended'(자동재생 차단·탭 숨김) 또는 'interrupted'(iOS 전화·알람 등)면 다시 깨운다. 실패해도 예외 없이 다음 입력 때 재시도
function wake() {
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
  try { const p = ctx.resume(); if (p && p.catch) p.catch(() => { /* 사용자 동작이 더 필요함 */ }); } catch (e) { /* 무시 */ }
}
// iOS Safari: 사용자 입력 안에서 무음 버퍼를 한 번 재생해야 이후 소리가 난다
let primed = false;
function prime() {
  if (primed || !ctx) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination); src.start(0);
    primed = true;
  } catch (e) { /* 무시 */ }
}
// 첫 touchend/click/keydown(및 이후 입력)마다 호출: 컨텍스트를 만들고/깨우고, 배경음악이 시작되도록 한다
export function unlock() {
  initAudio();
  wake(); prime();
  if (ctx && ctx.state === 'running') startMusic(); else music.want = true;
}

// 배경음악: OGG 지원이면 OGG(루프 편집본), 아니면 MP3(원곡)를 먼저 시도하고 하나가 실패하면 다른 쪽으로. 둘 다 안 되면 음악 없이 진행
async function loadMusic() {
  const order = formats.ogg ? [MUSIC_URL, MUSIC_URL_MP3] : [MUSIC_URL_MP3, MUSIC_URL];
  for (const url of order) {
    try {
      music.buf = await loadBuffer(url);
      music.format = url.endsWith('.mp3') ? 'mp3' : 'ogg';
      if (music.want) startMusic();
      return;
    } catch (e) { /* 다음 형식으로 */ }
  }
}

export function initAudio() {
  if (loading) { wake(); return loading; }
  loading = (async () => {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination);
      musicGain = ctx.createGain(); duck = ctx.createGain();
      duck.connect(musicGain); musicGain.connect(ctx.destination);
      duck.gain.value = MUSIC_LEVEL[music.mode];
      applyGains();
      warmNodes();
      wake();
      ctx.onstatechange = () => { if (ctx && ctx.state === 'running' && music.want) startMusic(); }; // 깨어나면 대기 중이던 음악 시작
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        try {
          if (document.hidden) { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); } else wake();
        } catch (e) { /* 무시 */ }
      });
      formats = detectFormats();
      loadMusic();
      for (const k of Object.keys(JINGLES)) {
        const fail = () => { jingleFailed[k] = true; }; // 징글 파일 없음 -> 합성 징글
        if (!formats.ogg) fail(); else loadBuffer(JINGLES[k].url).then((b) => { jingleBufs[k] = b; }).catch(fail);
      }
      await Promise.all(NAMES.map(async (n) => {
        if (!formats.ogg) { sfxFailed[n] = true; return; } // OGG 미지원: 받지 않고 바로 합성음 사용
        try { buffers[n] = await loadBuffer(`assets/sfx/${n}.ogg`); } catch (e) { sfxFailed[n] = true; } // 디코드 실패 -> 합성음
      }));
    } catch (e) { ctx = null; }
  })();
  return loading;
}

export function play(name, { rate = 1, vol = 1 } = {}) {
  if (hold || !ctx || muted || ctx.state !== 'running') return; // 잠긴 동안 쌓인 소리가 한꺼번에 터지지 않도록 건너뜀
  if (!buffers[name]) { if (sfxFailed[name]) playFallback(name, rate, vol); return; } // 아직 받는 중이면 건너뛰고, 못 받았으면 합성음
  try {
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(sfxGain);
  src.start();
  } catch (e) { /* 소리 없이 진행 */ }
}

// ---------- 합성 효과음 ----------
// 모든 합성음은 try/catch로 감싸 노드 생성이 실패해도 게임이 멈추지 않는다
function noise() { // 1초짜리 화이트 노이즈 버퍼 (한 번만 만들어 재사용)
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    fillNoise(noiseBuf.getChannelData(0));
  }
  return noiseBuf;
}
function fillNoise(d) { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
// 로딩 화면 예열: AudioContext는 첫 터치/키 입력 전에는 만들 수 없지만(브라우저 자동재생 규칙), 노이즈 버퍼는 컨텍스트 없이 `new AudioBuffer`로 미리 만들어 둘 수 있다.
// 번개·물보라·폭발 합성음이 처음 울릴 때 4만 개가 넘는 난수를 만드느라 프레임이 끊기지 않게 한다. 지원하지 않는 브라우저는 예전처럼 처음 쓸 때 만든다
export function prewarm() {
  if (noiseBuf) return;
  try { const b = new AudioBuffer({ numberOfChannels: 1, length: 44100, sampleRate: 44100 }); fillNoise(b.getChannelData(0)); noiseBuf = b; } catch (e) { /* 처음 쓸 때 만든다 */ }
}
// 컨텍스트가 만들어지면 소리 없는 그래프(오실레이터·노이즈 → 필터 → 게인 0)를 한 번 돌려 노드 종류별 첫 생성 비용을 미리 치른다 (경기 중 첫 효과음에서 끊기지 않도록)
function warmNodes() {
  try {
    const t = ctx.currentTime, mute = ctx.createGain();
    mute.gain.value = 0; mute.connect(ctx.destination);
    const f = ctx.createBiquadFilter(); f.connect(mute);
    const n = ctx.createBufferSource(); n.buffer = noise(); n.loop = true; n.connect(f); n.start(t); n.stop(t + 0.03);
    tone('square', 440, 220, t, 0.02, 0.1, 0.005, mute);
    tone('sine', 440, 440, t, 0.02, 0.1, 0.005, f);
  } catch (e) { /* 소리 없이 진행 */ }
}
// 엔벨로프 게인 노드: 0 -> peak(att초) -> 0(dur초에 지수 감쇠)
function env(t, peak, att, dur, out = sfxGain) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  return g;
}
function tone(type, f0, f1, t, dur, peak, att = 0.01, out = sfxGain) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(env(t, peak, att, dur, out));
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
// ---------- OGG를 못 읽을 때 쓰는 합성 대체음 ----------
// 필터 엔벨로프 노이즈 버스트: 필터 주파수가 f0 -> f1로 지수 변화하고 진폭은 att초에 peak까지 올랐다가 dur초에 걸쳐 사라진다
function burst(t, { dur, f0, f1 = f0, type = 'lowpass', q = 1, peak, att = 0.005, out = sfxGain }) {
  const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  src.connect(f); f.connect(env(t, peak, att, dur, out));
  src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.05);
}
// 아르페지오: 음을 step초 간격으로 쌓는다 (마지막 음은 lastDur초). 사인 + 한 옥타브 위 삼각파 배음
function arp(t, notes, step, dur, lastDur, peak, type, out) {
  notes.forEach((f, i) => {
    const s = t + i * step, d = i === notes.length - 1 ? lastDur : dur;
    tone(type, f, f, s, d, peak, 0.01, out);
    tone('sine', f * 2, f * 2, s, d * 0.6, peak * 0.2, 0.01, out);
  });
}
const WIN_NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.5];    // 도-미-솔-도-미 (올라감)
const LOSE_NOTES = [392, 369.99, 349.23, 329.63, 261.63];      // 솔-파#-파-미-도 (내려감)
// 폭발 계열: 필터가 닫히는 노이즈 + 아래로 떨어지는 저음. size는 길이 배율
const boom = (size, low) => (t, { vol, rate }) => {
  const d = 0.55 * size / rate;
  burst(t, { dur: d, f0: 2200 * rate, f1: 110 * rate, q: 0.9, peak: 0.9 * vol });
  tone('sine', low * rate, 32 * rate, t, d * 0.8, 0.8 * vol, 0.004);
};
const FALLBACK = {
  explosion: boom(1.1, 120),
  sea_boom: boom(1.3, 100),
  sea_boom_big: boom(1.9, 80),
  sea_boom_small: boom(0.8, 140),
  sea_cannon(t, { vol, rate }) { // 대포 발사: 짧고 센 노이즈 + 낮은 쿵
    burst(t, { dur: 0.32 / rate, f0: 3000 * rate, f1: 200 * rate, q: 1.2, peak: 0.7 * vol });
    tone('sine', 170 * rate, 45 * rate, t, 0.3 / rate, 0.9 * vol, 0.003);
  },
  fire(t, { vol, rate }) { // 발사 휙: 밴드패스가 올라가는 노이즈 + 톱니파 하강
    burst(t, { dur: 0.25 / rate, f0: 500 * rate, f1: 2400 * rate, type: 'bandpass', q: 1.5, peak: 0.4 * vol, att: 0.03 });
    tone('sawtooth', 320 * rate, 90 * rate, t, 0.16 / rate, 0.14 * vol, 0.003);
  },
  sea_splash(t, { vol, rate }) { // 물보라: 밴드패스 노이즈가 서서히 커졌다 사라짐 + 위쪽 쉬익
    burst(t, { dur: 0.55 / rate, f0: 450 * rate, f1: 1900 * rate, type: 'bandpass', q: 0.8, peak: 0.6 * vol, att: 0.07 });
    burst(t, { dur: 0.35 / rate, f0: 3500, type: 'highpass', peak: 0.15 * vol, att: 0.05 });
  },
  land(t, { vol, rate }) {
    tone('sine', 95 * rate, 50 * rate, t, 0.13, 0.55 * vol, 0.003);
    burst(t, { dur: 0.08, f0: 700, f1: 250, peak: 0.3 * vol, att: 0.002 });
  },
  step(t, { vol, rate }) { burst(t, { dur: 0.05, f0: 900 * rate, f1: 400 * rate, peak: 0.22 * vol, att: 0.002 }); },
  hit(t, { vol, rate }) {
    burst(t, { dur: 0.1, f0: 1300 * rate, f1: 500 * rate, type: 'bandpass', q: 1.2, peak: 0.5 * vol, att: 0.002 });
    tone('square', 230 * rate, 110 * rate, t, 0.09, 0.12 * vol, 0.002);
  },
  select(t, { vol, rate }) { tone('triangle', 660 * rate, 880 * rate, t, 0.09, 0.28 * vol, 0.005); },
  switch(t, { vol, rate }) { tone('square', 520 * rate, 390 * rate, t, 0.05, 0.12 * vol, 0.002); tone('square', 390 * rate, 520 * rate, t + 0.06, 0.05, 0.1 * vol, 0.002); },
  tick(t, { vol, rate }) { tone('square', 1500 * rate, 1200 * rate, t, 0.035, 0.12 * vol, 0.002); },
  win(t, { vol }) { arp(t, WIN_NOTES.slice(0, 4), 0.08, 0.2, 0.4, 0.22 * vol, 'triangle', sfxGain); },
  lose(t, { vol }) { arp(t, LOSE_NOTES.slice(0, 4), 0.13, 0.25, 0.5, 0.22 * vol, 'triangle', sfxGain); },
};
function playFallback(name, rate, vol) {
  const fx = FALLBACK[name];
  if (!fx) return;
  try {
    fx(ctx.currentTime, { rate: Math.min(4, Math.max(0.25, rate || 1)), vol });
    fallbackStats.sfx[name] = (fallbackStats.sfx[name] || 0) + 1;
  } catch (e) { fallbackStats.errors++; fallbackStats.lastError = `${name}: ${e && e.message}`; }
}
// 합성 결과 징글 (musicGain 연결): 승리는 올라가는 아르페지오, 패배는 내려가는 아르페지오. 반환: 길이(초)
function synthJingle(kind, t, out) {
  if (kind === 'win') { arp(t, WIN_NOTES, 0.1, 0.35, 0.8, 0.3, 'triangle', out); return 0.4 + 0.8; }
  arp(t, LOSE_NOTES, 0.2, 0.45, 1.0, 0.3, 'triangle', out); return 0.8 + 1.0;
}

export function playSynth(name, opts = {}) {
  if (hold || !ctx || muted || !sfxGain || !SYNTH[name] || ctx.state !== 'running') return;
  try {
    SYNTH[name](ctx.currentTime + (opts.delay || 0), opts);
    synthStats.calls[name] = (synthStats.calls[name] || 0) + 1;
  } catch (e) { synthStats.errors++; synthStats.lastError = `${name}: ${e && e.message}`; }
}

// 배경음악: 루프 이음매(끝→처음)는 파일 자체에 0.4초 크로스페이드를 구워 두었으므로 버퍼 루프로 틈 없이 반복
export function startMusic() {
  music.want = true;
  if (!ctx || !music.buf || music.src) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = music.buf; src.loop = true;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    src.connect(fade); fade.connect(duck);
    src.start();
    music.src = src;
  } catch (e) { /* 음악 없이 진행 */ }
}
// 'menu' | 'match' | 'result' — 결과 화면에서는 음악을 낮춤
export function setMusicMode(mode) {
  music.mode = mode;
  try { if (duck && ctx && !jingle.src) duck.gain.setTargetAtTime(MUSIC_LEVEL[mode], ctx.currentTime, 0.4); } catch (e) { /* 무시 */ } // 징글이 끝나면 stopJingle이 현재 모드 값으로 되돌린다
}

// 결과 화면 징글: kind 'win' | 'lose'. musicGain(음악 볼륨·음소거)을 거치고, 재생하는 동안 배경음악을 낮췄다가 끝나면 되돌린다.
// 소리가 꺼져 있거나 아직 불러오지 못했으면 아무것도 하지 않는다. 반환: 재생했으면 true
export function playJingle(kind) {
  stopJingle();
  const j = JINGLES[kind], buf = jingleBufs[kind];
  if (hold || !ctx || !musicGain || muted || !j || ctx.state !== 'running') return false;
  if (!buf) return jingleFailed[kind] ? playSynthJingle(kind, j) : false; // 파일을 못 읽었을 때만 합성 징글
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
function playSynthJingle(kind, j) {
  try {
    const g = ctx.createGain();
    g.gain.value = j.gain;
    g.connect(musicGain);
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(JINGLE_DUCK, t, 0.08);
    const len = synthJingle(kind, t + 0.05, g);
    const src = { stop() { /* 노트는 스스로 끝남 */ }, onended: null };
    jingle = { src, gain: g, timer: setTimeout(() => stopJingle(), (len + 0.5) * 1000) };
    fallbackStats.jingle[kind] = (fallbackStats.jingle[kind] || 0) + 1;
    return true;
  } catch (e) { fallbackStats.errors++; fallbackStats.lastError = `jingle ${kind}: ${e && e.message}`; jingle = { src: null, gain: null, timer: 0 }; return false; }
}
// 진행 중인 징글을 멈추고 배경음악 배율을 현재 화면 모드로 되돌림
export function stopJingle() {
  const { src, gain, timer } = jingle;
  if (!src) return;
  clearTimeout(timer);
  jingle = { src: null, gain: null, timer: 0 };
  try { src.onended = null; gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03); src.stop(ctx.currentTime + 0.15); } catch (e) { /* 이미 끝남 */ }
  try { if (duck) duck.gain.setTargetAtTime(MUSIC_LEVEL[music.mode], ctx.currentTime, 0.4); } catch (e) { /* 무시 */ }
}
export function musicInfo() {
  return { ctx: ctx && ctx.state, sfxLoaded: Object.keys(buffers).length, loaded: !!music.buf, format: music.format, formats, fallback: { failedSfx: Object.keys(sfxFailed), failedJingles: Object.keys(jingleFailed), ...fallbackStats }, playing: !!music.src, mode: music.mode, duck: duck && duck.gain.value, music: musicGain && musicGain.gain.value, sfx: sfxGain && sfxGain.gain.value, muted, synth: synthStats, jingles: { loaded: Object.keys(jingleBufs), playing: !!jingle.src, ...jingleStats } };
}

export function getVolumes() { return { ...vols }; }
// kind: 'music' | 'sfx', v: 0~1
export function setVolume(kind, v) {
  vols[kind] = Math.min(1, Math.max(0, v));
  local.set('boom-volumes', JSON.stringify(vols));
  applyGains();
}

export function setMuted(m) {
  muted = m;
  local.set('boom-muted', m ? '1' : '0');
  applyGains();
}
export function isMuted() { return muted; }
