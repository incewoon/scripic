# AI 연결/응답 지연 진단 로그 보강 계획

## 목적
"AI 연결 준비가 덜 된 채 대화로 넘어가서 첫 응답이 끊기거나 지연되는가?"와 "응답 스트림이 왜 늦거나 중간에 끊기는가?"를 개발자 콘솔만 보고 확실히 판별할 수 있게 로그를 재설계합니다. 로직/기능은 건드리지 않고 **관측(observability)** 만 강화합니다.

## 현재 로그의 한계
- `[AI Client]`는 요청 시작~끝만 봄. 사진 업로드 화면의 **사전 워밍(prewarm)** 이 언제 시작/완료되었는지, 대화 진입 시점에 그것이 **이미 완료 상태였는지**를 알 수 없음.
- App Check 토큰이 캐시 히트인지/신규 발급인지, 발급에 몇 ms 걸렸는지 로그 없음.
- Firebase Functions 스트림에서 **첫 토큰까지 시간(TTFB)**, **토큰 간 최대 공백(silence gap)**, **총 스트리밍 시간** 이 클라이언트/서버 양쪽에서 상관관계로 안 잡힘.
- 서버(`functions/src/index.ts`)의 chat 핸들러는 단계별 시간 로그가 없어서, 지연 원인이 (인증검증 · 페이로드검증 · Gemini 접속 · Gemini 스트리밍 · 후처리) 중 어디인지 구분 불가.

## 변경 개요 (5개 파일, 로그만 추가)

### 1) `src/routes/create.tsx` — Prewarm 관측 지점
`ensureFirebaseUser()` 사전 호출 부분을 상세 로깅으로 감쌈:
- `[Prewarm] start ts=<ms>` — 사진 업로드 화면 마운트 직후.
- `[Prewarm] ensureFirebaseUser ok uid=<...> elapsed=<ms>` / `[Prewarm] failed code=<...> msg=<...>`
- `getFns()` + App Check 토큰까지 실제로 확보되게 워밍을 **강제 트리거**하는 로그 지점 추가 (`getToken(appCheck, false)` 호출 결과 로깅 — 로직 변경 없이 관측 목적으로만 호출).
- 모듈 스코프에 `window.__AI_PREWARM__ = { startedAt, readyAt, ok }` 를 기록해두어 chat 화면에서 "사전 워밍 대비 얼마나 빨리 대화로 넘어갔는지" 를 상관 분석할 수 있게 함.

### 2) `src/integrations/firebase/client.ts` — App Check 토큰 발급 관측
`CustomProvider.getToken` / `ReCaptchaV3Provider` 초기화 및 native bridge 호출을 각각 계측:
- `[AppCheck] init provider=<recaptcha|native|none>`
- native bridge: `[AppCheck] native.getToken start` → `ok tokenLen=<> expIn=<ms> elapsed=<ms>` / `failed code=<> msg=<>`
- reCAPTCHA 경로도 동일한 시작/완료/실패 로그.
- 토큰이 **캐시 히트인지(빠름)** vs **신규 발급인지(느림)** 를 elapsed로 구분할 수 있게 됨.

### 3) `src/lib/aiClient.ts` — 클라이언트 스트림 계측 재정비
기존 `[AI Client]` 로그를 유지하되 **연결 준비 상태** 와 **스트림 지속성** 관점 로그를 추가:
- 진입 시 `window.__AI_PREWARM__` 스냅샷 로깅: `[AI Client] prewarm snapshot { startedAt, readyAt, wasReady, msSincePrewarmStart }` — "사전 워밍이 안 끝난 상태에서 대화로 넘어왔는가?"를 한 줄로 판별 가능.
- `ensureFirebaseUser` → `httpsCallable` → `call.stream()` → 첫 chunk 사이 각 구간 시간 분리 로그:
  - `phase=auth elapsed=<ms>`
  - `phase=callable_setup elapsed=<ms>`
  - `phase=stream_connect elapsed=<ms>` (call.stream() 반환까지)
  - `phase=first_chunk elapsed=<ms>` (TTFB)
- **inter-chunk gap 감시**: 이전 chunk 이후 500ms 이상 침묵이 발생하면 `[AI Client] ⚠ silence gap chunk#<n> gap=<ms>` 로그. → "단어가 뚝뚝 끊긴다"의 원인(네트워크 stall / 서버 stall)을 구분.
- 종료 시 요약: `chunks=<> deltaChars=<> ttfbMs=<> streamMs=<> maxGapMs=<> avgGapMs=<>`.
- `aiGenerateAlbum` 에도 동일하게 `phase=auth / callable / roundtrip / total` 4단계 계측.

### 4) `functions/src/index.ts` — 서버 측 단계별 시간 로그 (chat, generateAlbum)
콘솔(Cloud Functions 로그)에 남기지만, 클라이언트가 `requestId` 를 헤더/데이터로 함께 보내 상관관계를 맞출 수 있게 함.
- 진입: `[chat] recv rid=<id> msgs=<> photos=<> photoBytes=<>`
- 검증 완료: `[chat] validated rid=<id> elapsed=<ms>`
- Gemini 스트림 시작 직전/직후:
  - `[chat] gemini.connect rid=<id> …`
  - `[chat] gemini.firstToken rid=<id> elapsed=<ms>` (TTFB from server view)
  - `[chat] gemini.done rid=<id> streamMs=<ms> chunks=<> chars=<>`
- 후처리(정규식/tail 주입) 소요: `[chat] postprocess rid=<id> elapsed=<ms> replaced=<bool>`
- 종료: `[chat] done rid=<id> totalMs=<ms>`
- 실패 경로: `GeminiUnavailableError` / `GeminiQuotaError` / 기타 각각 `[chat] fail rid=<id> kind=<> status=<> elapsed=<ms>`.
- `generateAlbum` 도 동일 패턴(`[album] recv/gemini/postprocess/done/fail`).

### 5) `src/routes/chat.tsx` — 대화 진입 시점 로그
`send()` 첫 호출 직전에:
- `[Chat] first send prewarm { wasReady, msSincePrewarmStart, uid? }`
- 첫 응답 수신까지 시간, 마지막 chunk 이후 완료까지 시간 요약 로그를 send() 종료 시 남김.

## 상관관계용 requestId
클라이언트에서 `crypto.randomUUID()` 로 `rid` 생성 → `aiChatStream`/`aiGenerateAlbum` 페이로드 필드로 전달 → 서버가 같은 rid로 로그 → 클라이언트/서버 로그를 rid로 조인 가능. (기존 필드에 optional로 추가, 서버는 그대로 통과.)

## 판별표 (콘솔만 보고 원인 결론)
| 증상 | 결정적 로그 |
|---|---|
| 대화 첫 응답이 지연 | `[AI Client] prewarm snapshot wasReady=false` + `phase=auth elapsed` 큼 → 사전 워밍 실패/미완료 |
| 스트림 중간 단어 끊김 | `⚠ silence gap gap=<ms>`, 서버 로그 `gemini.firstToken` 정상인데 클라 gap 크면 네트워크/워커 스톨 |
| 서버측 지연 | 서버 `gemini.firstToken elapsed` 크면 Gemini 업스트림 원인 확정 |
| App Check 지연 | `[AppCheck] native.getToken elapsed` 큼 → Play Integrity 지연 |
| 앨범 생성 지연 | `[album] gemini.done streamMs` vs `postprocess elapsed` 로 구분 |

## 비변경 사항
- 비즈니스 로직, 프롬프트, 에러 처리 흐름, UI, 재시도 정책은 그대로.
- `firestore` 규칙/함수 배포/의존성 추가 없음.
- 서버 함수 변경은 로그 추가만이므로 재배포 시 부작용 없음.

## 파일
- edit `src/routes/create.tsx` (prewarm 관측 지점 강화)
- edit `src/integrations/firebase/client.ts` (App Check 토큰 계측)
- edit `src/lib/aiClient.ts` (phase / TTFB / silence-gap / summary 로그, rid 전달)
- edit `src/routes/chat.tsx` (대화 진입 시 prewarm 상태 로그)
- edit `functions/src/index.ts` (chat / generateAlbum 단계별 rid 로그)
