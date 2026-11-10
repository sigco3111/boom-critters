// 언어(한국어/영어) 사전과 도우미. 기본값은 navigator.language(ko*이면 한국어, 아니면 영어)이고 선택은 localStorage('boom-lang')에 저장한다
// (저장소가 막힌 환경에서는 storage.js가 메모리에만 보관). index.html의 한국어 문구는 그대로 두고, data-i18n 속성이 붙은 요소만 영어일 때 사전 값으로 바꾼다
// 사용법: t('키', { 값 }) — JS에서 쓰는 문구. applyDom() — data-i18n(텍스트) · data-i18n-html(서식 포함) · data-i18n-aria · data-i18n-title 속성을 가진 요소를 바꾼다
import { local } from './storage.js?v=2026111046';

const KEY = 'boom-lang';
export const LANGS = ['ko', 'en'];

// ---------- 한국어: JS가 만드는 문구만 (정적 문구는 index.html 원문이 한국어 원본) ----------
const KO = {
  'load.text': '불러오는 중...', 'load.prep': '첫 경기 준비 중...', 'load.count': '{a} / {b}', 'load.sounds': '일부 소리를 불러오지 못했어요', 'load.images': '일부 그림을 불러오지 못했어요',
  'load.fail': '에셋을 불러오지 못했습니다: {msg}', 'load.chars': '캐릭터를 불러오는 중...',
  'ver.stale': '{v} (페이지 {h}와 다름 - 새로고침하세요)', 'ver.none': '없음',
  'team.0': '파랑 팀', 'team.1': '빨강 팀', 'team.short.0': '파랑', 'team.short.1': '빨강', 'who.me': '나', 'who.ai': 'AI',
  'w.cannon': '대포탄', 'w.rocket': '로켓', 'w.grenade': '수류탄', 'w.lightning': '번개', 'w.fire': '화염탄', 'w.airstrike': '공습',
  'tr.balanced.n': '균형형', 'tr.balanced.d': '특별한 능력 없음',
  'tr.jump.n': '높이뛰기', 'tr.jump.d': '점프 높이 +10%',
  'tr.tough.n': '튼튼함', 'tr.tough.d': '최대 HP +10',
  'tr.armor.n': '철갑', 'tr.armor.d': '폭발 피해 -15% · 이동 -20%',
  'tr.regen.n': '재생', 'tr.regen.d': '팀 턴 시작 시 HP +5',
  'tr.steady.n': '안정 조준', 'tr.steady.d': '조준 안정 +15% (AI 오차↓ · 충전 여유↑)',
  'ch.maleAdventurer': '남자 모험가', 'ch.femaleAdventurer': '여자 모험가', 'ch.malePerson': '남자', 'ch.robot': '로봇', 'ch.zombie': '좀비', 'ch.femalePerson': '여자', 'ch.malePerson2': '남자 2',
  'th.grass': '초원', 'th.desert': '사막 노을', 'th.snow': '설원', 'th.night': '별밤',
  'diff.easy': '쉬움', 'diff.normal': '보통', 'diff.hard': '어려움',
  'map.theme': '테마', 'map.terrain': '지형', 'map.random': '랜덤', 'map.rnd': '(랜덤)', 'map.desc': '{t} · {r} — {d}', 'res.map': '맵: {t} · {r} {x}',
  'ter.gentle': '완만', 'ter.hills': '언덕', 'ter.canyon': '협곡',
  'ter.random.d': '매 경기 시드로 정해요', 'ter.gentle.d': '낮고 완만한 땅, 조준이 쉬워요', 'ter.hills.d': '기본 언덕 지형', 'ter.canyon.d': '가운데 깊은 협곡과 높은 벽',
  'mode.stage': '스테이지 {n}', 'mode.endless': '무한 · 웨이브 {n}',
  'banner.mine': '내 차례 - {name}', 'banner.foe': '상대 차례 - {name}', 'banner.wave': '웨이브 {n}', 'banner.waveClear': '웨이브 {n} 클리어!',
  'f.splash': '풍덩!', 'f.crate': '보급 상자 투하!', 'f.crateBreak': '상자 파괴', 'f.soon': '곧 출시', 'f.unlockWave': '웨이브 3부터 해금', 'f.unlockStage': '스테이지 4부터 해금',
  'f.noAmmo': '탄약 없음', 'f.think': '생각 중...', 'f.timeout': '시간 초과', 'f.turns': '{n}턴',
  'air.warn': '공습 경보! {s}', 'air.target': '공습 목표 · 눌러서 호출', 'air.go': '공습!',
  'hud.lock': '잠김', 'hud.wind': '바람', 'hud.none': '없음', 'hud.air': '공습 x{x} · 클릭/Space로 호출', 'hud.aim': '각도 {a}°  파워 {p}',
  'hud.foeAim': '상대가 조준 중...', 'hud.info': '{label} · {theme} · 시드 {seed}', 'hud.power': '파워 {p}', 'hud.unit': '{name} (HP {hp}/{max}) · {tn}: {td}',
  'st.mineAir': '내 차례 · 공습 목표 {x} · 화면을 눌러 호출', 'st.mineAim': '내 차례 · 각도 {a}° · 파워 {p}', 'st.foe': '상대가 조준 중...', 'st.strike': '공습 중!',
  'fire.label': '발사 (꾹)', 'fire.air': '공습 호출', 'fire.target': '목표 {x}', 'fire.foe': '상대 조준 중',
  'on': '켜짐', 'off': '꺼짐', 'set.vib.na': '(미지원)', 'snd.on': '소리 켜짐', 'snd.off': '소리 꺼짐', 'snd.turnOn': '소리 켜기', 'snd.turnOff': '소리 끄기',
  'mute.on': '꺼짐 (누르면 켜기)', 'mute.off': '켜짐 (누르면 끄기)', 'pop.on': '🔇 소리 켜기', 'pop.off': '🔊 소리 끄기',
  'quick.desc': '3 vs {n} · AI 오차 {a}°/{p}', 'best.endless': '최고 기록: {n} 웨이브',
  'stage.enemies': '적 {n}마리', 'stage.locked': '스테이지 {n} 잠김', 'stage.stars': '스테이지 {n} 별 {s}개', 'stage.plain': '스테이지 {n}',
  'res.over': '게임 오버', 'res.endSub': '클리어한 웨이브: {n} · 최고 기록: {b}{rec}', 'res.new': ' (신기록!)',
  'res.clear': '스테이지 {n} 클리어!', 'res.lose': '패배...', 'res.win': '승리!', 'res.draw': '무승부',
  'res.alive': '생존 {n}마리 · 최고 {b}개', 'res.unlock': ' · 스테이지 {n} 해금!',
  'res.allDown': '우리 팀이 모두 쓰러졌습니다.', 'res.bothDown': '양 팀이 모두 쓰러졌습니다.', 'res.foeDown': '상대 팀을 모두 쓰러뜨렸습니다.',
  'res.diff': '난이도: {d} · 적 {n}마리', 'res.again': '다시 하기', 'res.retry': '다시 도전', 'res.menuQuick': '난이도 선택', 'res.menu': '처음으로',
  'rs.shots': '발사 횟수', 'rs.dealt': '준 피해', 'rs.taken': '받은 피해', 'rs.weapons': '사용한 무기', 'rs.turns': '우리 턴',
  'rs.u.shots': '발', 'rs.u.weapons': '종', 'rs.u.turns': '턴', 'rs.first': '첫 기록', 'rs.new': '신기록!', 'rs.best': '최고 {v}{u}',
  'share.word.win': '승리', 'share.word.lose': '패배', 'share.word.draw': '무승부',
  'share.endless': '붐 크리터스 무한 모드 - 웨이브 {n} 클리어{rec}', 'share.stage': '붐 크리터스 스테이지 {n} {w} {s}', 'share.quick': '붐 크리터스 빠른 대전({d}) {w}',
  'share.title': '붐 크리터스', 'share.copied': '결과를 클립보드에 복사했어요', 'share.fail': '복사하지 못했어요. 주소: {url}',
  'tut.next': '다음', 'tut.start': '시작하기',
  'tut.1.t': '이동과 점프', 'tut.1.a.k': '키보드', 'tut.1.a.v': 'A·D (또는 ←·→)로 걷고, W로 점프', 'tut.1.b.k': '터치', 'tut.1.b.v': '화면의 ◀ ▶ 와 점프 버튼', 'tut.1.c.k': '팁', 'tut.1.c.v': '턴마다 30초! 같은 팀 유닛이 차례로 움직여요',
  'tut.2.t': '조준하고 힘을 모아 발사', 'tut.2.a.k': '키보드', 'tut.2.a.v': '↑·↓ 로 각도 → Space를 꾹 눌러 파워를 모았다가 떼면 발사', 'tut.2.b.k': '터치', 'tut.2.b.v': '오른쪽 화면을 끌어 각도·파워를 정하고 손을 떼면 발사 (발사 버튼 꾹도 가능). 끄는 동안 점선 궤적 힌트가 보여요', 'tut.2.c.k': '팁', 'tut.2.c.v': '바람 화살표를 보고 보정하세요',
  'tut.3.t': '무기 1~6', 'tut.3.a.k': '교체', 'tut.3.a.v': '숫자 1~6 키 또는 무기 버튼 (무기 바를 빠르게 두 번 누르면 다음 무기로)', 'tut.3.b.k': '종류', 'tut.3.b.v': '1 대포탄 · 2 로켓 · 3 수류탄(3초 뒤 폭발) · 4 번개(직선) · 5 화염탄(불길 3턴) · 6 공습(목표 지정 후 폭탄 5발)', 'tut.3.c.k': '탄약', 'tut.3.c.v': '3~6번은 개수가 제한돼요 (공습은 스테이지 4부터)',
  'tut.4.t': '보급 상자와 화염 지대', 'tut.4.a.k': '상자', 'tut.4.a.v': '4턴마다 낙하산 상자가 떨어져요. 닿으면 HP +30', 'tut.4.b.k': '화염', 'tut.4.b.v': '불길 안에 서 있으면 턴 시작 때 8 피해 — 벗어나세요', 'tut.4.c.k': '주의', 'tut.4.c.v': '물에 빠지면 즉사! 섬 가장자리와 구덩이를 조심',
  'lang.name': '한국어', 'lang.btn': 'English로 전환',
};

// ---------- English: 정적 문구(data-i18n 키)와 JS 문구 모두 ----------
const EN = {
  // 로딩·공통
  'load.text': 'Loading...', 'load.prep': 'Warming up the first match...', 'load.count': '{a} / {b}', 'load.sounds': 'Some sounds are unavailable', 'load.images': 'Some images are unavailable',
  'load.fail': 'Could not load assets: {msg}', 'load.chars': 'Loading characters...',
  'ver.stale': '{v} (differs from page {h} - please reload)', 'ver.none': 'none',
  'team.0': 'Blue Team', 'team.1': 'Red Team', 'team.short.0': 'Blue', 'team.short.1': 'Red', 'who.me': 'You', 'who.ai': 'AI',
  'w.cannon': 'Cannon', 'w.rocket': 'Rocket', 'w.grenade': 'Grenade', 'w.lightning': 'Bolt', 'w.fire': 'Fire', 'w.airstrike': 'Airstrike',
  'tr.balanced.n': 'Balanced', 'tr.balanced.d': 'No special ability',
  'tr.jump.n': 'High jump', 'tr.jump.d': 'Jump +10%',
  'tr.tough.n': 'Tough', 'tr.tough.d': 'Max HP +10',
  'tr.armor.n': 'Armor', 'tr.armor.d': 'Blast dmg -15% · speed -20%',
  'tr.regen.n': 'Regen', 'tr.regen.d': 'HP +5 at team turn start',
  'tr.steady.n': 'Steady aim', 'tr.steady.d': 'Aim +15% (AI error↓ · easier charge)',
  'ch.maleAdventurer': 'Adventurer', 'ch.femaleAdventurer': 'Adventuress', 'ch.malePerson': 'Man', 'ch.robot': 'Robot', 'ch.zombie': 'Zombie', 'ch.femalePerson': 'Woman', 'ch.malePerson2': 'Man 2',
  'th.grass': 'Meadow', 'th.desert': 'Desert dusk', 'th.snow': 'Snowfield', 'th.night': 'Starry night',
  'diff.easy': 'Easy', 'diff.normal': 'Normal', 'diff.hard': 'Hard',
  'map.theme': 'Theme', 'map.terrain': 'Terrain', 'map.random': 'Random', 'map.rnd': '(random)', 'map.desc': '{t} · {r} — {d}', 'res.map': 'Map: {t} · {r} {x}',
  'ter.gentle': 'Gentle', 'ter.hills': 'Hills', 'ter.canyon': 'Canyon',
  'ter.random.d': 'Picked from the seed each match', 'ter.gentle.d': 'Low, smooth ground; easy aiming', 'ter.hills.d': 'The default hilly terrain', 'ter.canyon.d': 'A deep canyon in the middle with high walls',
  'mode.stage': 'Stage {n}', 'mode.endless': 'Endless · Wave {n}',
  'banner.mine': 'Your turn - {name}', 'banner.foe': 'Enemy turn - {name}', 'banner.wave': 'Wave {n}', 'banner.waveClear': 'Wave {n} clear!',
  'f.splash': 'Splash!', 'f.crate': 'Supply crate!', 'f.crateBreak': 'Crate broken', 'f.soon': 'Coming soon', 'f.unlockWave': 'Unlocks at wave 3', 'f.unlockStage': 'Unlocks at stage 4',
  'f.noAmmo': 'No ammo', 'f.think': 'Thinking...', 'f.timeout': 'Time up', 'f.turns': '{n} turns',
  'air.warn': 'Air raid! {s}', 'air.target': 'Airstrike target · tap to call', 'air.go': 'Airstrike!',
  'hud.lock': 'Locked', 'hud.wind': 'Wind', 'hud.none': 'None', 'hud.air': 'Airstrike x{x} · click/Space to call', 'hud.aim': 'Angle {a}°  Power {p}',
  'hud.foeAim': 'Enemy is aiming...', 'hud.info': '{label} · {theme} · Seed {seed}', 'hud.power': 'Power {p}', 'hud.unit': '{name} (HP {hp}/{max}) · {tn}: {td}',
  'st.mineAir': 'Your turn · Airstrike {x} · tap the screen to call', 'st.mineAim': 'Your turn · Angle {a}° · Power {p}', 'st.foe': 'Enemy is aiming...', 'st.strike': 'Airstrike!',
  'fire.label': 'Fire (hold)', 'fire.air': 'Call strike', 'fire.target': 'Target {x}', 'fire.foe': 'Enemy aiming',
  'on': 'On', 'off': 'Off', 'set.vib.na': '(unsupported)', 'snd.on': 'Sound on', 'snd.off': 'Sound off', 'snd.turnOn': 'Turn sound on', 'snd.turnOff': 'Turn sound off',
  'mute.on': 'Muted (tap to unmute)', 'mute.off': 'Sound on (tap to mute)', 'pop.on': '🔇 Sound on', 'pop.off': '🔊 Sound off',
  'quick.desc': '3 vs {n} · AI error {a}°/{p}', 'best.endless': 'Best: {n} waves',
  'stage.enemies': '{n} enemies', 'stage.locked': 'Stage {n} locked', 'stage.stars': 'Stage {n}, {s} stars', 'stage.plain': 'Stage {n}',
  'res.over': 'Game Over', 'res.endSub': 'Waves cleared: {n} · Best: {b}{rec}', 'res.new': ' (New record!)',
  'res.clear': 'Stage {n} clear!', 'res.lose': 'Defeat...', 'res.win': 'Victory!', 'res.draw': 'Draw',
  'res.alive': '{n} survived · Best {b} stars', 'res.unlock': ' · Stage {n} unlocked!',
  'res.allDown': 'Your whole team was knocked out.', 'res.bothDown': 'Both teams were knocked out.', 'res.foeDown': 'You knocked out the enemy team.',
  'res.diff': 'Difficulty: {d} · {n} enemies', 'res.again': 'Play again', 'res.retry': 'Try again', 'res.menuQuick': 'Choose difficulty', 'res.menu': 'Main menu',
  'rs.shots': 'Shots', 'rs.dealt': 'Damage dealt', 'rs.taken': 'Damage taken', 'rs.weapons': 'Weapons used', 'rs.turns': 'Your turns',
  'rs.u.shots': '', 'rs.u.weapons': '', 'rs.u.turns': '', 'rs.first': 'First record', 'rs.new': 'New record!', 'rs.best': 'Best {v}{u}',
  'share.word.win': 'won', 'share.word.lose': 'lost', 'share.word.draw': 'drew',
  'share.endless': 'Boom Critters Endless - cleared {n} waves{rec}', 'share.stage': 'Boom Critters Stage {n} {w} {s}', 'share.quick': 'Boom Critters Quick Match ({d}) {w}',
  'share.title': 'Boom Critters', 'share.copied': 'Result copied to clipboard', 'share.fail': 'Could not copy. Link: {url}',
  'tut.next': 'Next', 'tut.start': 'Start',
  'tut.1.t': 'Move and jump', 'tut.1.a.k': 'Keyboard', 'tut.1.a.v': 'A·D (or ←·→) to walk, W to jump', 'tut.1.b.k': 'Touch', 'tut.1.b.v': 'Use ◀ ▶ and the Jump button', 'tut.1.c.k': 'Tip', 'tut.1.c.v': '30 seconds per turn! Your units take turns',
  'tut.2.t': 'Aim, charge and fire', 'tut.2.a.k': 'Keyboard', 'tut.2.a.v': '↑·↓ sets the angle. Hold Space to charge, release to fire', 'tut.2.b.k': 'Touch', 'tut.2.b.v': 'Drag on the right side to set angle and power, release to fire (or hold the Fire button). A dotted trajectory hint shows while you drag', 'tut.2.c.k': 'Tip', 'tut.2.c.v': 'Watch the wind arrow and adjust',
  'tut.3.t': 'Weapons 1-6', 'tut.3.a.k': 'Switch', 'tut.3.a.v': 'Keys 1-6 or the weapon buttons (double-tap the weapon bar to cycle to the next weapon)', 'tut.3.b.k': 'Types', 'tut.3.b.v': '1 Cannon · 2 Rocket · 3 Grenade (explodes in 3s) · 4 Bolt (straight line) · 5 Fire (burns 3 turns) · 6 Airstrike (pick a target, 5 bombs)', 'tut.3.c.k': 'Ammo', 'tut.3.c.v': 'Weapons 3-6 are limited (Airstrike from stage 4)',
  'tut.4.t': 'Supply crates and fire', 'tut.4.a.k': 'Crate', 'tut.4.a.v': 'A parachute crate drops every 4 turns. Touch it for HP +30', 'tut.4.b.k': 'Fire', 'tut.4.b.v': 'Standing in flames costs 8 HP at turn start - move away', 'tut.4.c.k': 'Careful', 'tut.4.c.v': 'Falling in water is instant defeat! Watch island edges and craters',
  'lang.name': 'English', 'lang.btn': '한국어로 전환',

  // ---------- index.html 정적 문구 ----------
  'page.title': 'Boom Critters - Artillery Game', 'page.desc': 'A Worms/Pocket Tanks style single-player artillery web game',
  'rot.hint': '📱 Rotate your phone for a bigger view', 'rot.close': 'Close tip',
  'app.aria': 'Boom Critters game screen (move A·D, jump W, angle ↑·↓, fire Space, weapons 1-6, pause Esc)',
  'pause.tx': ' Pause', 'pause.aria': 'Pause', 'gear.aria': 'Settings', 'menu.open': 'Open menu', 'menu.aria': 'Menu', 'pop.pause': '⏸ Pause', 'pop.settings': '⚙ Settings',
  'title': 'Boom Critters', 'start.sub': 'Blast the other team with your 3 cute critters!',
  'quick.h': 'Quick Match', 'quick.note': '3 vs 3 single round', 'diff.aria': 'Difficulty', 'quick.btn': 'Start Quick Match',
  'stage.h': 'Stage Mode', 'stage.note': '10 stages · up to 3 stars', 'stage.btn': 'Stage Mode',
  'endless.h': 'Endless Mode', 'endless.note': 'Best: 0 waves', 'endless.btn': 'Endless Mode',
  'help.btn': 'How to Play', 'credits.btn': 'Credits',
  'start.help': 'Move A/D or ←/→ · Jump W · Angle ↑/↓ or drag · Power: hold Space, release · Weapons 1-6 · Mute M',
  'stagesel.h': 'Select Stage', 'back': 'Back',
  'res.next': 'Next stage', 'res.stageSel': 'Stage select', 'res.share': 'Share result',
  'close': 'Close',
  // 도움말
  'help.h': 'How to Play', 'doc.aria': 'Content (read with arrow keys or scroll)',
  'hp.goal.h': 'Goal', 'hp.goal.p': 'Knock out the whole enemy team with your 3 blue critters. Each turn lasts 30 seconds and your units take turns. The wind (arrow direction and strength) changes every turn. Explosions dig the terrain, and falling in water is instant defeat.',
  'hp.ctl.h': 'Controls',
  'hp.move.k': 'Move / Jump', 'hp.move.v': 'A·D or ←·→ / W (on-screen ◀ ▶ · Jump button)',
  'hp.angle.k': 'Angle', 'hp.angle.v': '↑·↓ or drag the screen (Angle ▲▼ buttons)',
  'hp.touch.k': 'Touch aim', 'hp.touch.v': 'Drag on the right half to set angle and power, release to fire (longer drag = stronger). While dragging, a short dotted <b>trajectory hint</b> (about 0.6 s of flight) shows where the shot starts; turn it on or off in ⚙ Settings (on by default for touch, off for desktop)',
  'hp.fire.k': 'Fire', 'hp.fire.v': 'Hold Space to charge power, release to fire (hold the Fire button)',
  'hp.weapon.k': 'Change weapon', 'hp.weapon.v': 'Keys 1-6 or the bottom weapon buttons (6 Airstrike from stage 4). <b>Double-tap</b> the weapon bar to jump to the next weapon that still has ammo',
  'hp.pause.k': 'Pause', 'hp.pause.v': 'Esc or the ⏸ button (resume · restart match · back to menu)',
  'hp.sound.k': 'Sound', 'hp.sound.v': 'M to mute · ⚙ Settings (music/effects volume). Bolt, airstrike whistle, grenade tick and heal chime follow the effects volume and mute. The win/lose jingle follows the music volume and briefly lowers the music. On old devices that cannot play OGG (e.g. old iOS Safari), music falls back to MP3 and effects/jingles to synthesized sounds, with the same volume and mute',
  'hp.a11y.k': 'Accessibility', 'hp.a11y.v': 'In ⚙ Settings you can turn on <b>Large HUD text</b> (HUD text and weapon buttons +25%) and <b>High-contrast teams</b> (blue ● circle for you, red ◆ diamond for the enemy on name tags, team HP boxes and turn banners). Blue and red stay distinguishable in red-green colour blindness simulations, but turn the marks on if you play in greyscale or still mix them up. Settings are saved. <b>Vibration</b> (on by default) buzzes briefly when you fire, near blasts and when your units are hit, on devices that support it (most Android phones; not iOS or desktop).',
  'hp.bg.k': 'Start screen background', 'hp.bg.v': 'Clouds and stars drift slowly across a night sky. With "reduce motion" on, it stays still, and animation stops while the tab is hidden to save battery',
  'hp.share.k': 'Share result', 'hp.share.v': 'The <b>Share result</b> button shares the stage (or mode), result, stars and the game link. Devices with a share sheet open it; otherwise the text is copied to the clipboard with a small notice',
  'hp.install.k': 'Install app', 'hp.install.v': 'Use "Install app" / "Add to Home screen" in your browser menu to make an icon and run it like a full-screen app. No service worker is used, so updates always load the latest files. Progress is saved in this browser',
  'hp.tut.k': 'Tutorial', 'hp.tut.v': 'A 4-step guide shows once on first launch. Use "Show tutorial" below to see it again (←/→ to move, Esc to skip)',
  'hp.wpn.h': 'Weapons',
  'hp.w1.k': '1 Cannon', 'hp.w1.v': 'Basic shell. Strongly affected by wind, unlimited',
  'hp.w2.k': '2 Rocket', 'hp.w2.v': 'Bigger blast, less wind effect, unlimited',
  'hp.w3.k': '3 Grenade', 'hp.w3.v': 'Bounces on terrain and explodes after 3 seconds. Strong knockback, 3 per team',
  'hp.w4.k': '4 Bolt', 'hp.w4.v': 'Flies straight along the angle and hits the first unit for 35 damage, 2 per team',
  'hp.w5.k': '5 Fire', 'hp.w5.v': 'Leaves flames for 3 turns that deal 8 damage at turn start, 2 per team',
  'hp.w6.k': '6 Airstrike', 'hp.w6.v': 'Tap the terrain to pick a target x. After a 1s warning, 5 bombs fall in a 120px zone (blast radius 28, up to 18 damage). Move the marker with ←/→ then Space. Unlocks at stage 4 (always in Quick Match), 1 per team',
  'hp.trait.h': 'Character traits', 'hp.trait.p': 'Each unit has a small trait. The name, HP and trait of the active unit (or the unit under the mouse) show below the HP box at the top.',
  'hp.c1.k': 'Adventurer', 'hp.c1.v': 'Balanced - no special ability (your team)',
  'hp.c2.k': 'Adventuress', 'hp.c2.v': 'High jump - jump height +10% (your team)',
  'hp.c3.k': 'Man', 'hp.c3.v': 'Tough - max HP +10 (110) (your team)',
  'hp.c4.k': 'Robot', 'hp.c4.v': 'Armor - blast damage -15%, move speed -20% (enemy team)',
  'hp.c5.k': 'Zombie', 'hp.c5.v': 'Regen - HP +5 at the start of its team turn (enemy team)',
  'hp.c6.k': 'Woman', 'hp.c6.v': 'Steady aim +15% - AI aim error -15%; when you control her, power charges 15% slower so it is easier to release at the right power (enemy team)',
  'hp.c7.k': 'Man 2', 'hp.c7.v': 'Balanced - the 4th enemy unit with an orange name tag',
  'hp.crate.h': 'Supply crates', 'hp.crate.p': 'A parachute crate drops every 4th turn. A unit touching it gets HP +30 (max 100) and a clear chime. Explosions destroy it. Standing in flames costs HP at turn start, so move away.',
  'hp.modes.h': 'Modes',
  'hp.m1.k': 'Quick Match', 'hp.m1.v': 'Pick a difficulty on the start screen and press "Start Quick Match". Easy (2 enemies, big AI error) · Normal (3 enemies) · Hard (4 enemies, small AI error). You can also pick the map: Theme (Random · Meadow · Desert · Snow · Night) and Terrain (Random · Gentle · Hills · Canyon). Your choices are saved and shown on the result screen',
  'hp.m2.k': 'Stages', 'hp.m2.v': '10 stages; winning unlocks the next. 1-3 stars by survivors. From stage 7 there are 4 enemies, so your team gets +1 grenade (4) and +1 bolt (3)',
  'hp.m3.k': 'Result screen', 'hp.m3.v': 'Shows shots, damage dealt, damage taken, weapons used and your turns. Stages save the best of each item and show "New record!" when beaten',
  'hp.m4.k': 'Endless', 'hp.m4.v': 'Waves keep coming with more enemies. The run ends when your team is wiped out; the best wave is saved',
  'hp.lang.k': 'Language', 'hp.lang.v': 'Switch Korean/English in ⚙ Settings. The default follows your browser language and your choice is saved',
  'hp.load.k': 'Loading', 'hp.load.v': 'A loading screen with a progress bar appears while the first-screen sounds and sprites load. If something fails, the game continues after about 8 seconds. Other sounds and extra characters load in the background',
  'hp.tutBtn': 'Show tutorial',
  // 튜토리얼·크레딧·일시정지·설정
  'tut.aria': 'Tutorial', 'tut.skip': 'Skip', 'tut.prev': 'Back',
  'cr.h': 'Credits', 'cr.jingle': 'Win/lose jingles on the result screen (jingles_STEEL10, jingles_PIZZI07)',
  'cr.music.p': 'Background music (loop version of the original converted to OGG, with a 0.4s crossfade at the loop seam). On devices that cannot read OGG, the unmodified original <code>Enchanted Festival.mp3</code> loops instead',
  'cr.note': 'CC0 assets need no credit, but we list them with thanks. The game code is MIT licensed. Terrain, stage theme backgrounds (meadow, desert, snow, night), effects and weapon icons are drawn with canvas code, without external images. The app icon (cannon and star) is also hand-drawn.',
  'cr.ver': 'Version', 'cr.script': 'Script',
  'pause.h': 'Paused', 'pause.resume': 'Resume', 'pause.restart': 'Restart match', 'pause.quit': 'Quit to menu', 'pause.help': 'You can also resume with Esc',
  'set.h': 'Settings', 'set.music': 'Music', 'set.music.aria': 'Music volume', 'set.sfx': 'Effects', 'set.sfx.aria': 'Effects volume', 'set.mute': 'Mute',
  'set.bighud': 'Large HUD text (+25%)', 'set.contrast': 'High-contrast teams (● blue / ◆ red)', 'set.vib': 'Vibration (fire / blast / hit)', 'set.hint': 'Trajectory hint while aiming', 'set.lang': 'Language',
  // HUD 라벨(세로 폰 DOM HUD)과 컨트롤
  'hud.windLabel': 'Wind',
  'ctl.left': 'Left', 'ctl.right': 'Right', 'ctl.jump': 'Jump', 'ctl.jump.t': 'Jump', 'ctl.up': 'Raise angle', 'ctl.down': 'Lower angle', 'ctl.up.t': 'Angle ▲', 'ctl.down.t': 'Angle ▼',
};

const DICT = { ko: KO, en: EN };
const html = typeof document !== 'undefined' ? document.documentElement : null;

export function detect() {
  let saved = null;
  try { saved = local.get(KEY); } catch (e) { /* 기본값 */ }
  if (LANGS.includes(saved)) return saved;
  let nav = '';
  try { nav = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (e) { /* 영어 */ }
  return /^ko\b/i.test(nav) ? 'ko' : 'en';
}
let lang = detect();
const listeners = [];
export const getLang = () => lang;
export function onLangChange(fn) { listeners.push(fn); }

export function t(key, vars) {
  let s = DICT[lang][key];
  if (s === undefined) s = KO[key];
  if (s === undefined) s = key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : vars[k])) : s;
}

// data-i18n* 속성 요소 갱신. 처음 만났을 때 HTML의 한국어 원문을 보관해 두었다가 한국어로 돌아올 때 그대로 복원한다
export function applyDom(root) {
  if (!root && typeof document !== 'undefined') root = document;
  if (!root || !root.querySelectorAll) return;
  const en = lang === 'en';
  const each = (sel, attr, store, get, set) => root.querySelectorAll(sel).forEach((el) => {
    const key = el.getAttribute(attr);
    if (el.dataset[store] === undefined) el.dataset[store] = get(el);
    const v = en ? EN[key] : undefined;
    set(el, v === undefined ? el.dataset[store] : v);
  });
  each('[data-i18n]', 'data-i18n', 'koT', (el) => el.textContent, (el, v) => { el.textContent = v; });
  each('[data-i18n-html]', 'data-i18n-html', 'koH', (el) => el.innerHTML, (el, v) => { el.innerHTML = v; });
  each('[data-i18n-aria]', 'data-i18n-aria', 'koA', (el) => el.getAttribute('aria-label') || '', (el, v) => el.setAttribute('aria-label', v));
  each('[data-i18n-title]', 'data-i18n-title', 'koP', (el) => el.getAttribute('title') || '', (el, v) => el.setAttribute('title', v));
  if (root === document) {
    if (html) html.lang = lang;
    document.title = lang === 'en' ? EN['page.title'] : '붐 크리터스 - 포격 웹게임';
    const md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', lang === 'en' ? EN['page.desc'] : '웜즈·포트리스 스타일 싱글플레이 포격 웹게임');
  }
}

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  lang = l;
  local.set(KEY, l);
  applyDom();
  for (const fn of listeners) { try { fn(l); } catch (e) { console.error(e); } }
}
