## 목표
사용자가 제공한 신규 프롬프트 문구로 3개 영역의 AI 프롬프트를 일괄 교체합니다.

## 변경 파일 (총 5개, Firebase ↔ Supabase 미러 동시 적용)

### 1. 채팅 인터뷰 프롬프트
- `functions/src/prompts-chat.ts`
- `supabase/functions/_shared/prompts-chat.ts`

변경 내용:
- `turnLimitClause` — 변경 없음
- `chatSystemPrompt` 의 Creative / Fact / Brief 세 모드 KO+EN 본문을 사용자가 제시한 새 문구로 전면 교체
- 종료 조건은 모두 "위의 [응대 횟수 제한] 지침을 따르세요" 로 단일화 (각 모드의 중복된 `[READY_TO_FINISH]` 안내 제거)
- Brief 모드에서 "사진 한 장당 1~2번만 짚고 빠르게 다음 사진으로" 같은 중복 한도 문구도 제거

### 2. 앨범 생성 프롬프트
- `functions/src/prompts-album.ts`
- `supabase/functions/_shared/prompts-album.ts`

변경 내용:
- `albumSystem` Creative/Fact/Brief KO+EN — "내용 정의 / 어조는 별도 지침" 분리를 명확히 한 새 문구로 교체. 캡션 개수 규칙은 유지.
- `toneInstruction` Politely/Friendly/Short KO+EN — "[어조 지침 — 말투만 정의]" 헤더를 포함한 새 문구로 교체
- `albumUserPrompt` — 헤더 뒤에 모드별 출력 스펙(`modeSpec`)을 `[출력 스펙] / [Output Spec]` 블록으로 두고, 그 뒤에 명시적인 JSON 출력 포맷(`{ "title": "...", ..., "captions": [...], "closing": "..." }`)을 항상 붙이도록 구조 변경. "마크다운 코드블록·설명 없이 JSON만" 지시 포함.
- 모드별 출력 스펙(intro 문장 수, captions 글자 수 등)은 현행 그대로 유지

### 3. 후기 인증 (review reward)
- `src/lib/reviewReward.functions.ts`

변경 내용 (`SYSTEM_PROMPT` 상수 본문):
- 인정 플랫폼에 TikTok, YouTube Community, KakaoStory, Naver Blog, Naver Cafe, Band 추가 + 한국 SNS UI 단서(공감/좋아요, 댓글 등) 안내 추가
- "텍스트가 없는 스크린샷도 반려" 조건을 spam rejection 항목에 추가
- `confidence` 필드 설명을 "approved=true면 70 이상, false면 50 이하" 규칙으로 교체
- success_messages 중 첫 번째 항목에서 "이제 2개의 앨범" 하드코딩 숫자를 "이제 추가로 앨범을 만들 수 있어요"로 교체 (나머지 3개는 그대로)
- 그 외 FLOW 1·3, JSON 출력 규칙은 사용자가 제시한 문구로 정렬

## 영향 범위
- 프롬프트 텍스트만 교체. 함수 시그니처/인자/반환 타입/호출부는 변경하지 않음.
- `albumUserPrompt`는 본문 끝에 JSON 포맷 블록을 항상 추가하므로, 기존 호출부(`functions/src/index.ts`, `supabase/functions/album-fallback/index.ts`)는 그대로 동작. JSON 파싱 로직도 영향 없음.
- UI/로직/타입/DB/i18n 변경 없음.

## 비고
사용자 메시지의 `{photoCount}` 표기는 코드상 기존대로 `${photoCount}` 템플릿 리터럴로 치환해 적용합니다(이미 런타임 치환되는 패턴 유지).
