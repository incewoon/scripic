# Plan: `gemini-proxy` Supabase Edge Function

새 Supabase Edge Function `gemini-proxy`를 만들어 Firebase ID Token 검증 → Firestore 일일 사용 제한 확인 → Gemini API 호출 → Firestore 플래그 업데이트의 흐름을 처리합니다.

## 생성/수정할 파일

1. **`supabase/functions/gemini-proxy/index.ts`** (신규)
   - Deno serve 핸들러
   - CORS preflight 처리
   - 로직 흐름 (아래 참조)

2. **`supabase/config.toml`** (수정)
   - `[functions.gemini-proxy]` 블록 추가, `verify_jwt = false` (Firebase ID Token으로 자체 인증하므로 Supabase JWT 검증 비활성)

## 기술 세부사항

### Imports
```ts
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
```

### CORS 헤더
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

### `getAccessToken()` — Google OAuth2
- `FIREBASE_SERVICE_ACCOUNT` JSON 파싱 → `client_email`, `private_key`, `project_id`
- `private_key`의 PEM → PKCS8 변환 후 `crypto.subtle.importKey`로 RS256 키 생성
- djwt `create()`로 JWT 생성
  - header: `{ alg: "RS256", typ: "JWT" }`
  - payload: `{ iss, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", exp: getNumericDate(3600), iat: getNumericDate(0) }`
- `POST https://oauth2.googleapis.com/token`
  - body (urlencoded): `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}`
- 모듈 레벨 캐시: `{ token, expiresAt }`; `expiresAt - 60s` 이전이면 재사용

### 요청 처리 흐름
1. `OPTIONS` → 204 + CORS 헤더
2. `POST` 외 메서드 → 405
3. `Authorization` 헤더에서 `Bearer ` 추출 → 없으면 401
4. Firebase ID Token 검증:
   - `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}` body `{ idToken }`
   - 응답 `users[0].localId` → `uid`, 실패 시 401
5. Access Token 발급 (`getAccessToken()`)
6. Firestore GET `users/${uid}/flags/daily`:
   - 200: `fields.lastUsedDate.stringValue === todayUTC()` → 429 `{ error: "daily_limit_exceeded" }`
   - 404: 신규 사용자, 통과
   - 기타: 500
7. Gemini 호출:
   - 요청 body `{ messages, systemInstruction? }`을 Gemini 포맷으로 변환
     - `contents`: `messages` (role/parts 그대로 사용 가능)
     - `systemInstruction` 있으면 `{ parts: [{ text }] }`
   - `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
   - 응답에서 `candidates[0].content.parts[*].text` join
8. Firestore PATCH `users/${uid}/flags/daily`:
   - body: `{ fields: { lastUsedDate: { stringValue: todayUTC() }, metadata: { mapValue: { fields: {} } } } }`
9. 응답: `{ result: "..." }` 200

### 오늘 날짜 (UTC)
```ts
new Date().toISOString().slice(0, 10)
```

### 에러 처리
- 모든 예외는 `try/catch`로 감싸 `console.error("[gemini-proxy]", ...)` 로그 후 적절한 status + `{ error: message }` JSON 반환

## 비고
- 기존 `chat-fallback`, `album-fallback` 함수는 변경하지 않습니다.
- Secrets `GEMINI_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_WEB_API_KEY`는 이미 프로젝트에 등록되어 있어 추가 작업 불필요합니다.
- 클라이언트 코드(`aiClient.ts` 등) 연결은 이번 작업 범위 밖이며 별도 요청 시 진행합니다.
