## 문제 요약
채팅에서 AI가 "바로 정리해드릴게요"라고 응답한 뒤 실제 앨범 생성이 시작되지 않는 핵심 원인은, 종료 경로에서 최신 대화 배열을 만들어 `finish(finalMsgs)`로 넘기고도 실제 `aiGenerateAlbum()` 호출에는 그 값이 아니라 오래된 React state `messages`를 다시 사용하고 있기 때문입니다.

스크린샷의 흐름처럼:
- AI가 "앨범으로 정리해드릴까요?" 제안
- 사용자가 "넹"으로 동의
- AI가 "네, 바로 정리해 드릴게요." 응답
- 그런데 생성 호출은 최신 transcript를 못 쓰고 멈추거나 `talk more`/가드 조건에 걸릴 수 있음

## 구현 계획
1. `src/routes/chat.tsx`의 `finish()`를 수정해, `messagesOverride`가 있으면 그 최신 배열만 일관되게 사용하도록 정리합니다.
   - 현재 `const msgs = messagesOverride ?? messages;`로 계산해놓고
   - 실제 `aiGenerateAlbum({ messages, ... })`에는 여전히 `messages`를 보내는 버그를 수정합니다.

2. 종료 트리거 경로를 다시 정리합니다.
   - 사용자의 명시적 종료 요청
   - AI의 정리 제안 후 사용자의 긍정 응답
   - AI가 `[READY_TO_FINISH]` 또는 마무리 제안을 직접 보낸 경우
   이 3가지가 모두 최신 transcript 기준으로 동일하게 `finish(finalMsgs)`까지 연결되도록 맞춥니다.

3. 비동기 타이밍/중복 호출 가드를 보강합니다.
   - `setTimeout`/state closure 때문에 오래된 값이 섞이지 않게 정리
   - `finishingRef`, `generating`, `leavingRef`가 정상적으로 해제/유지되는지 점검
   - 같은 종료 요청이 2번 들어와도 중복 생성되지 않도록 유지

4. 실패 지점을 확인하기 쉽게 최소한의 진단 로그를 넣습니다.
   - 종료 판단이 true인지
   - `finish()`에 전달된 메시지 수
   - `generateAlbum` 직전 호출 여부
   이렇게 넣어두면 다시 같은 현상이 나와도 즉시 어느 단계에서 멈췄는지 확인 가능합니다.

5. 실제 재현 케이스 기준으로 검증합니다.
   - "정리해드릴까요?" → "넹"
   - "마무리해줘"
   - "어", "그래", "ㅇㅋ", "yes", "ok"
   - 스트리밍 응답 직후 종료되는 케이스

## 기술 메모
- 현재 확인된 직접 원인:
  - `finish(messagesOverride?: Msg[])` 내부에서 `msgs`를 계산하지만
  - `aiGenerateAlbum({ messages, ... })`로 잘못 호출 중
- 이건 직전 수정의 의도(최신 transcript 직접 전달)를 무효화하는 버그라서, 이번 수정은 `src/routes/chat.tsx` 중심의 클라이언트 로직 정합성 복구가 핵심입니다.
- 서버 프롬프트(`functions/src/prompts-chat.ts`)는 이미 종료 지시를 내리도록 되어 있어, 우선순위는 클라이언트 종료 연결부 수정입니다.