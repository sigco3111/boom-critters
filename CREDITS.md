# 크레딧 (Credits)

게임 코드는 MIT 라이선스(`LICENSE`)입니다. 게임 안에서도 시작 화면의 **크레딧** 버튼으로 같은 목록을 볼 수 있습니다.

## 에셋

| 팩 | 제작자 | 라이선스 | 출처 | 사용 파일 |
|---|---|---|---|---|
| Toon Characters 1 | Kenney Vleugels (Kenney) | CC0 1.0 | https://kenney.nl/assets/toon-characters-1 (다운로드: https://opengameart.org/content/toon-characters-1) | `assets/toon/<캐릭터>/<포즈>.png` (maleAdventurer, femaleAdventurer, malePerson, femalePerson, robot, zombie — 일반 크기 PNG 포즈: idle, walk0~7, run0~2, jump, fall, hit, hurt, attack0, hold, down) |
| Impact Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/impact-sounds (카탈로그: https://github.com/sigco3111/assets-audio) | `assets/sfx/explosion.ogg` (impactPunch_heavy_000), `fire.ogg` (impactMetal_heavy_000), `land.ogg` (impactSoft_heavy_000), `step.ogg` (footstep_grass_000), `hit.ogg` (impactPlate_heavy_000) |
| Interface Sounds | Kenney | CC0 1.0 | https://kenney.nl/assets/interface-sounds (카탈로그: https://github.com/sigco3111/assets-audio) | `assets/sfx/select.ogg` (select_001), `win.ogg` (confirmation_001), `lose.ogg` (error_001), `tick.ogg` (tick_001), `switch.ogg` (switch_001) |
| Music Jingles | Kenney | CC0 1.0 | https://kenney.nl/assets/music-jingles (카탈로그: https://github.com/sigco3111/assets-audio, `kenney_musicjingles.zip`) | `assets/music/jingle-win.ogg` (jingles_STEEL10 — 결과 화면 승리), `jingle-lose.ogg` (jingles_PIZZI07 — 결과 화면 패배). 원본 파일 그대로 사용, 합쳐서 약 35KB |
| Battle at sea | Thimras | CC0 1.0 | https://opengameart.org/content/battle-at-sea (카탈로그: https://github.com/sigco3111/assets-audio) | `assets/sfx/sea_cannon.ogg` (cannon_fire — 대포탄·로켓 발사), `sea_boom.ogg` (cannon_hit_cannon — 대포탄 폭발), `sea_boom_big.ogg` (cannon_hit_ship_short — 로켓 폭발), `sea_boom_small.ogg` (cannon_hit_wall_no_splash — 수류탄·화염탄 폭발, 설정 화면 미리듣기), `sea_splash.ogg` (cannon_miss — 물에 빠질 때). 원본 파일 그대로 사용 |
| Enchanted Festival | Matthew Pablo | **CC-BY 3.0 (표기 필수)** | https://opengameart.org/content/enchanted-festival (카탈로그: https://github.com/sigco3111/assets-audio) | `assets/music/enchanted-festival-loop.ogg` (원곡의 `Enchanted Festival Loop.wav`를 OGG Vorbis로 변환, 루프 이음매에 0.4초 크로스페이드 적용 — 편집본) |

### 필수 표기 (CC-BY 3.0)

> Enchanted Festival by Matthew Pablo, https://opengameart.org/content/enchanted-festival, licensed CC-BY 3.0

라이선스 원문: https://creativecommons.org/licenses/by/3.0/ — 이 곡은 OGG로 변환하고 루프 이음매를 편집한 것입니다(원곡의 변경 사실 고지).

## 그 외

- Kenney 팩(Music Jingles 포함)과 Battle at sea는 **CC0 1.0 (퍼블릭 도메인)** 이라 표기 의무는 없지만 감사의 뜻으로 적습니다. 원문: https://creativecommons.org/publicdomain/zero/1.0/
- 스테이지 테마(초원·사막 노을·설원·별밤)의 하늘, 구름, 별, 달, 언덕, 소나무·선인장 실루엣과 지형 색은 외부 이미지 없이 `js/themes.js`의 캔버스 코드로 직접 그렸습니다(추가 에셋 없음).
- 지형의 잔디/흙 질감, 폭발 이펙트(불꽃·연기 파티클), 번개 줄기, 화염 지대, 보급 상자와 낙하산, 무기 아이콘은 모두 캔버스 코드로 직접 생성했습니다.
