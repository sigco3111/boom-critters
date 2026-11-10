// 안전한 저장소: localStorage/sessionStorage 접근이 막힌 환경(사생활 보호 모드, 쿠키 차단, 용량 초과)에서도 예외 없이 동작한다.
// 읽기·쓰기는 try/catch로 감싸고, 값은 항상 메모리에도 보관해 저장소가 막혀 있어도 이번 접속 동안은 유지된다.
const mem = { local: new Map(), session: new Map() };
const area = (kind) => { try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch (e) { return null; } };

function make(kind) {
  const m = mem[kind];
  return {
    get(key) {
      try { const s = area(kind); if (s) { const v = s.getItem(key); if (v !== null && v !== undefined) return v; } } catch (e) { /* 메모리 값 사용 */ }
      return m.has(key) ? m.get(key) : null;
    },
    set(key, value) {
      const v = String(value);
      m.set(key, v);
      try { const s = area(kind); if (s) { s.setItem(key, v); return true; } } catch (e) { /* 메모리에만 보관 */ }
      return false;
    },
  };
}
export const local = make('local');
export const session = make('session');
