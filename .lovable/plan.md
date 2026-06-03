
## 목표

현재 흐름은 (a) AI가 마무리 제안을 하고도 사용자 확인 없이 넘어가거나, (b) 사용자가 명령형 답변("마무리해줘")을 하면 곧바로 생성으로 들어가서, 의도와 어긋남. 또 12턴이 넘도록 종료되지 않는 케이스도 존재.

다음 3가지 룰로 단순화한다.

1. **명시적 종료 명령**(마무리해줘 / 정리해줘 / 만들어줘 / make the album 등)
   - 곧바로 앨범을 만들지 않는다.
   - AI가 "그럼 이대로 앨범으로 정리해드릴까요?" 같은 마무리 제안만 응답한다 (`[PROPOSE_FINISH]`).
   - 다음 턴에 사용자가 긍정 응답("네/넵/넹/ㅇㅋ/ㅇㅇ/그래/좋아/해줘" 등)을 하면 그때 앨범 생성으로 진입.

2. **AI 자발적 마무리 제안 후**(자연 종료턴 or 위 1번에서 만들어진 제안)
   - 사용자의 다음 답변이 긍정이면 → 앨범 생성.
   - 부정/추가 발화면 → 일반 대화 계속.

3. **하드 캡: 총 12번의 대화(AI 6 + 사용자 6 = 12 메시지) 도달 시 강제 종료**
   - 12번째 메시지를 보낸 뒤에는 사용자 응답을 기다리지 않는다.
   - "이제 앨범으로 정리해드릴게요." 한 줄을 채팅에 표시하고 약 2초 후 자동으로 `finish()` 실행.

---

## 변경 파일

### A. `functions/src/index.ts` — `chat` callable

`isProposalTurn` / 강제 토큰 부착 로직 재정의:

- 입력에서 마지막 user 메시지 텍스트를 뽑아 두 가지를 판정:
  - `userExplicitFinish` — 명시적 종료 명령 정규식(클라이언트와 동일 규칙)
  - `userPositive` — 긍정 응답 정규식(네/넵/넹/ㅇㅋ/ㅇㅇ/그래/좋아/해줘/만들어줘 등)
- 직전 assistant 메시지에 `[PROPOSE_FINISH]` 또는 마무리 제안 문구가 있었는지(`wrapProposedPrev`) 판정.
- 응답 생성 후 후처리:
  - **a) `userExplicitFinish === true`**: 모델 응답을 무시하고, 무조건 "그럼 이대로 앨범으로 정리해드릴까요?" + `[PROPOSE_FINISH]` 로 덮어쓴다(또는 모델 응답 뒤에 강제로 부착하고 `[READY_TO_FINISH]`는 제거). 즉 한 번 더 확인을 받게 함.
  - **b) `wrapProposedPrev && userPositive`**: 응답에 `[READY_TO_FINISH]`가 없으면 강제로 부착("네, 바로 정리해드릴게요. [READY_TO_FINISH]"). 이게 실제 앨범 생성 트리거.
  - **c) `assistantSoFar + 1 === totalCap`** (= 6번째 AI 메시지가 될 차례)이고 위 어떤 토큰도 없으면 → 기존처럼 `[PROPOSE_FINISH]`를 강제.
  - **d) `assistantSoFar + 1 > totalCap`** (이미 마지막 턴 넘어선 안전망) → `[READY_TO_FINISH]`를 강제로 부착.

여기서 `totalCap = 6` (= 12 메시지 / 2). `maxTurnsPerPhoto` 계산은 그대로 두되 12 cap을 그대로 유지.

### B. `functions/src/prompts-chat.ts`

`turnLimitClause`의 마무리 룰을 위 a/b/c와 동일한 문장으로 정리:
- 사용자가 명시적 종료 요청을 하면 곧바로 `[READY_TO_FINISH]`를 붙이지 말고, 한 번 더 마무리 제안(`[PROPOSE_FINISH]`)으로 응답하라.
- 이전 AI 응답이 `[PROPOSE_FINISH]`였고 사용자가 긍정이면 `[READY_TO_FINISH]`만 붙여라.
- 그 외 케이스는 일반 인터뷰 진행.

서버 안전망(A) 덕분에 프롬프트 미스가 있어도 클라이언트 흐름은 깨지지 않음.

### C. `src/routes/chat.tsx`

1. **자동 finish 트리거 정리**: `shouldFinish` 조건을 다음으로 좁힌다.
   - `aiNowReady = assistant.includes("[READY_TO_FINISH]")` 또는 `isFinishAcknowledgement(assistant)` (기존 KO/EN 패턴)
   - `shouldFinish = aiNowReady`
   - 즉, **`[READY_TO_FINISH]`가 떨어진 순간에만** `finish()` 호출.
   - `isExplicitFinishRequest` 자체로 finish하지 않음 (서버가 한 번 더 제안하게 됨).
   - `wrapProposed && userAgreed` 같은 클라이언트 단독 추정도 제거 — 서버가 `[READY_TO_FINISH]`를 붙여주는 단일 경로로 통일.

2. **하드 캡 12메시지 강제 종료**:
   - `send()`가 끝난 시점에 `finalMsgs.length >= 12` 이거나 assistant 메시지 수 ≥ 6이면 finishingRef 가드 후 다음을 수행:
     - 화면에 "이제 앨범으로 정리해드릴게요." (또는 영어) assistant 메시지를 한 줄 추가.
     - `setTimeout(() => finish(updatedMsgs), 2000)` 으로 2초 대기 후 자동 마무리.
   - `[READY_TO_FINISH]`가 이미 와서 `shouldFinish`가 true인 경우엔 이 분기 무시(중복 방지).

3. **토큰 렌더링 정리**:
   - 표시용 텍스트에서 `[READY_TO_FINISH]`뿐 아니라 `[PROPOSE_FINISH]`도 정규식으로 제거(`replace(/\[(READY_TO_FINISH|PROPOSE_FINISH)\]/g, "")`).
   - 스트리밍 중에도 메시지 컨텐츠에 토큰이 잠깐 보이지 않도록 동일 sanitize 적용.

4. 진단용 console.log는 유지(원인 추적 용도).

---

## 정규식 (KO 기준)

- 긍정 응답: `/^(\s)*(네+|넵+|넹+|예+|응+|웅+|어+|ㅇㅇ+|ㅇㅋ+|오케이|콜|그래(요)?|좋아(요)?|해(줘|주세요)?|만들어(줘|주세요)?|정리해(줘|주세요)?|마무리해(줘|주세요)?)[!.~ㅋㅎ\s]*$/`
- 명시적 종료: `/(마무리|정리|완성|마감|끝내|앨범\s*만들)\s*(해|해줘|해주세요|할래|할까|하자|부탁|좀)?/`

서버/클라 양쪽에 동일 규칙을 박아 두 곳에서 동일한 의미로 판정한다.

---

## 검증 시나리오

1. 1장 사진, AI 응답 1 → 사용자 "마무리해줘" → AI가 `정리해드릴까요? [PROPOSE_FINISH]` 응답 (앨범 생성 X) → 사용자 "응" → AI `[READY_TO_FINISH]` → 앨범 생성.
2. 1장 사진, AI 응답 5번째에 자발적 `[PROPOSE_FINISH]` → 사용자 "ㄴㄴ 좀 더" → 6번째 응답이 자연스레 진행되다 12메시지 도달 시 강제 마무리.
3. 멀티 사진, 정상 진행 중 12메시지 도달 → "이제 앨범으로 정리해드릴게요." 표시 후 2초 뒤 자동 finish.
4. 사용자 "ㅇㅋ"만 단독 입력 시(직전이 PROPOSE_FINISH가 아닌 일반 질문일 때) → 일반 답변, 종료 X.

---

## 배포

- 클라 변경은 자동 반영.
- 서버 변경은 `firebase deploy --only functions:chat` 필요(사용자 환경에서 수동 배포).
