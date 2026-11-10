// 스프라이트 로더: 캐릭터별로 포즈 이미지를 받는다. 실패하거나 아직 받는 중인 포즈는 임시 그림(placeholder)이 대신하므로 게임은 에셋 때문에 멈추지 않는다.
// 처음 필요한 캐릭터만 로딩 화면에서 받고, 나머지(예: 3번째 적)는 뒤에서 받다가 그 캐릭터가 필요한 경기를 시작할 때 기다린다.
const PH_SRC = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128"><rect x="26" y="46" width="44" height="76" rx="20" fill="#cfe3f7"/><circle cx="48" cy="36" r="24" fill="#cfe3f7"/></svg>');
let ph = null;
export function placeholder() {
  if (!ph) { ph = new Image(); ph.src = PH_SRC; }
  return ph.complete && ph.naturalWidth ? Promise.resolve(ph) : new Promise((res) => { ph.addEventListener('load', () => res(ph), { once: true }); ph.addEventListener('error', () => res(ph), { once: true }); });
}

const tryLoad = (src) => new Promise((res) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => res(null);
  im.src = src;
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 캐릭터 키 -> { 포즈 -> Image } 객체. 모든 포즈를 임시 그림으로 채워 두고, 실제 이미지가 도착하면 바꿔 끼운다
export function createSprites(keys, poses) {
  const sprites = {};
  placeholder();
  for (const k of keys) sprites[k] = Object.fromEntries(poses.map((p) => [p, ph]));
  return sprites;
}

const pending = new Map(), done = new Set(); // 캐릭터 키 -> Promise<실패한 포즈 수> (같은 캐릭터를 두 번 받지 않음) / 모두 끝난 캐릭터
// keys의 캐릭터 이미지를 받는다. 이미지 하나가 끝날 때마다 onEach(성공 여부). 한 번 실패하면 잠깐 뒤 한 번 더 시도한다
export function loadChars(sprites, keys, poses, onEach = () => {}) {
  return Promise.all(keys.map((key) => {
    if (!pending.has(key)) {
      pending.set(key, Promise.all(poses.map(async (pose) => {
        const url = `assets/toon/${key}/${pose}.png`;
        let im = await tryLoad(url);
        if (!im) { await wait(400); im = await tryLoad(url); }
        if (im) sprites[key][pose] = im;
        onEach(!!im);
        return im ? 0 : 1;
      })).then((r) => { done.add(key); return r.reduce((a, b) => a + b, 0); }));
    }
    return pending.get(key);
  })).then((r) => r.reduce((a, b) => a + b, 0));
}
export const isLoaded = (keys) => keys.every((k) => done.has(k));
