## 문제 진단

스크린샷과 코드 점검 결과, 마무리 로직에 다음 3가지 버그가 있음.

### 1. 사용자가 "정리해줘" 같은 명시적 종료 명령을 반복하면 AI가 계속 PROPOSE만 한다
서버 `index.ts`의 `POSITIVE_KO` 정규식이 `^\s*(...)$`로 anchored 되어 있어, "어 정리해줘"처럼 **단어 사이에 공백이 있는 답변**은 POSITIVE로 인식되지 않음. 결과:
- `userPositive = false`
- `userExplicitFinish = true` → 우선순위 2번 분기로 다시 `[PROPOSE_FINISH]` 추가
- 그래서 사용자가 몇 번을 "정리해줘"라고 해도 계속 다시 묻기만 함.

### 2. 부정 응답("아니", "잠깐만")인데도 강제 마무리되고, "정리해드릴게요" 문구가 두 줄로 중복
- 모델이 프롬프트 지시를 따라 자연스럽게 "그럼 지금까지 이야기 나눈 내용으로 앨범을 정리해드릴까요?" 같은 문장을 생성함.
- 서버는 토큰만 제거한 뒤(`replace`로) 같은 의미의 문장을 한 번 더 tail로 붙임 → **같은 문장이 2줄**로 출력됨 (스크린샷의 "그럼 지금까지... / 그럼 지금까지..." 중복).
- 또한 `willBeLastTurn` / `assistantSoFar+1 > totalCap` 분기는 **사용자의 부정 의도와 무관하게** READY/PROPOSE를 강제로 붙여서, "아니/잠깐만" 같은 응답에도 마무리로 진입.

### 3. READY 토큰이 떨어진 이후 2초 딜레이 없이 곧바로 앨범 생성으로 진입
`src/routes/chat.tsx`의 READY 분기는 `setTimeout(..., 400)`으로 0.4초 후 `finish()` 호출. 사용자는 마지막 "정리해드릴게요" 한 줄을 읽을 시간(약 2초)을 원함. 하드캡 분기만 2초가 적용되어 있음.

---

## 수정 계획

### A. `functions/src/index.ts` — chat 콜러블 후처리 로직 정리

1) **정규식 보강** — 공백/조사가 섞인 긍정 답변도 잡도록 변경
   ```ts
   const POSITIVE_KO =
     /(^|\s)(네+|넵+|넹+|예+|응+|웅+|어+|ㅇㅇ+|ㅇㅋ+|오케이|콜|그래(요)?|좋아(요)?|좋습니다|좋지|해(줘|주세요)?|만들어(줘|주세요)?|정리해(줘|주세요)?|마무리해(줘|주세요)?)(\s|[!.~ㅋㅎ]|$)/;
   ```
   - 명시적 종료 명령("정리해줘", "어 정리해줘", "그래 만들어줘" 등)이 wrapProposedPrev 상태에서 들어오면 모두 POSITIVE로 잡힘.

2) **NEGATIVE 정규식 추가** — 부정 의도가 명확하면 어떤 강제 분기도 발동하지 않도록
   ```ts
   const NEGATIVE_KO = /^(아니(요|야)?|아냐|잠깐(만)?|잠시(만)?|기다려(줘)?|아직|싫어|싫|노노|ㄴㄴ|놉|안 ?돼|좀 ?더|더 ?할래|계속)/;
   const NEGATIVE_EN = /^(no|nope|nah|wait|hold on|not yet|later|continue|keep going|one more)/i;
   const userNegative = NEGATIVE_KO.test(lastUserText.trim()) || NEGATIVE_EN.test(lastUserText.trim());
   ```

3) **분기 우선순위 재정의** (가장 중요한 변경)
   ```text
   if (userNegative) {
     // 어떤 강제 토큰도 붙이지 않음. 일반 대화 진행.
   } else if (wrapProposedPrev && (userPositive || userExplicitFinish)) {
     // 모델 응답에서 "정리/마무리해드릴게요" 류 문장이 이미 있으면 제거 후 READY tail.
     // → "네, 바로 정리해드릴게요. [READY_TO_FINISH]" 한 줄만 남도록.
   } else if (userExplicitFinish) {
     // PROPOSE tail. 단, 모델 응답에 이미 wrap 제안 문장이 있으면 그 문장은 그대로 두고 [PROPOSE_FINISH] 토큰만 부착.
   } else if (assistantSoFar + 1 > totalCap) {
     READY tail (안전망).
   } else if (willBeLastTurn) {
     PROPOSE tail (단, 모델이 이미 만든 wrap 제안 문장과 중복되면 토큰만 부착).
   }
   ```

4) **중복 문장 제거 유틸**
   ```ts
   const WRAP_SENT_KO = /(네,?\s*)?(그럼 )?(지금까지 [^.\n]*?)?(앨범으로 )?(정리|마무리|완성)해 ?(드릴까요\??|드릴게요\.?)/g;
   const WRAP_SENT_EN = /(shall i (put|wrap|finish)[^.\n]*?\.?|let me put[^.\n]*?\.?|putting it together now\.?)/gi;
   ```
   - tail을 붙이기 전에 모델 출력에서 위 정규식 매칭을 제거하고 trim. 그 다음 우리 표준 문장 + 토큰을 1회만 부착 → 중복 2줄 방지.

### B. `functions/src/prompts-chat.ts` — 프롬프트 보강

- 마무리 규칙 1번에 `사용자가 부정적으로 응답하면(예: "아니", "잠깐만") 절대 [READY_TO_FINISH]를 붙이지 말고 일반 대화를 이어가라` 룰 추가.
- 마무리 규칙 2번에 `wrap 제안 메시지에서는 "정리해드릴까요?" 같은 문장을 한 번만 사용하고, 같은 의미의 문장을 두 번 반복하지 말 것` 추가 (모델 측 중복 억제).

### C. `src/routes/chat.tsx` — 클라이언트 finish 타이밍 통일

1) READY 분기의 딜레이를 400ms → **2000ms**로 변경하여 마지막 "정리해드릴게요." 문구를 사용자가 읽을 수 있게 함.
   ```tsx
   if (aiReady && !finishingRef.current && !leavingRef.current && !streamError) {
     finishingRef.current = true;
     setTimeout(() => { void finish(finalMsgs); }, 2000);
     return;
   }
   ```
2) 하드캡 분기는 기존 2초 유지.
3) (선택) 2초 동안 사용자가 보내기 버튼 누르지 못하도록 `setBusy(true)`를 유지하거나 `generating` 플래그를 미리 켜서 입력창을 잠가둠 — 안 그러면 그 사이 새 메시지가 들어와 race condition.

### D. 배포

- 클라이언트 변경은 자동 반영.
- 서버 변경은 `firebase deploy --only functions:chat` 필요.

---

## 검증 시나리오

1. "정리해줘" → AI: PROPOSE → "어 정리해줘" → AI: "네, 바로 정리해드릴게요. [READY]" → 2초 후 앨범 생성. (이슈 1)
2. "정리해줘" → AI: PROPOSE → "아니 잠깐만" → AI: 일반 응답 (마무리 분기 발동 X). (이슈 2-a)
3. 같은 흐름의 AI 응답이 "그럼 지금까지... / 그럼 지금까지..." 두 줄로 나오지 않음. (이슈 2-b)
4. READY가 떨어진 뒤 "정리해드릴게요" 메시지가 화면에 보이고 정확히 2초 뒤 album 페이지로 이동. (이슈 3)
5. 12 메시지 하드캡 도달 시 기존처럼 "이제 앨범으로 정리해드릴게요." 출력 후 2초 자동 마무리.
