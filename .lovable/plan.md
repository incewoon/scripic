# Firebase Firestore Edge Function 추가 계획

Supabase Edge Function `firebase-firestore`를 추가해 `FIREBASE_SERVICE_ACCOUNT_JSON` 시크릿으로 Firestore에 대한 CRUD/list 작업을 수행합니다. 이후 `aiClient.ts` 같은 패턴으로 클라이언트에서 호출하거나, 일일 앨범 제한 서버 카운팅의 백엔드로 사용할 수 있습니다.

## 동작 방식

1. **인증**: Service Account JSON에서 `client_email`, `private_key`, `project_id`를 읽어 Google OAuth2 JWT(RS256)을 만들고 `https://oauth2.googleapis.com/token`에서 access token 획득. 토큰을 메모리에 캐시(만료 60초 전까지 재사용).
2. **Firestore REST API** (`https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/...`)로 호출.
3. **JSON ↔ Firestore value 변환** 유틸 포함 (string/integer/double/boolean/null/timestamp/array/map).

## API (단일 POST 엔드포인트)

`POST /functions/v1/firebase-firestore`

요청 body:
```json
{
  "op": "get" | "list" | "create" | "update" | "delete",
  "collection": "albums",
  "id": "optional-doc-id",
  "data": { ... },        // create / update 시
  "merge": true,          // update: true=patch, false=replace (기본 true)
  "pageSize": 50,         // list
  "pageToken": "..."      // list
}
```

응답:
- `get`: `{ id, data }` 또는 404
- `list`: `{ documents: [{id, data}], nextPageToken }`
- `create`: `{ id, data }` (id 없으면 자동생성)
- `update`: `{ id, data }`
- `delete`: `{ ok: true }`

CORS 헤더는 기존 다른 함수(`chat`, `generate-album`)와 동일 패턴.

## 파일 변경

**신규**
- `supabase/functions/firebase-firestore/index.ts` — 위 로직 전체 (Deno, std http serve)
  - JWT 서명: Deno `crypto.subtle` + `private_key` PEM → PKCS8 import → RS256 sign
  - 토큰 캐시: 모듈 스코프 변수
  - `firestoreValue(v)` / `fromFirestoreValue(v)` 변환기

**수정**
- `supabase/config.toml` — 함수 블록 추가:
  ```
  [functions.firebase-firestore]
  verify_jwt = false
  ```

## 사용하지 않는 것

- 별도 Firebase Admin SDK npm 패키지 ❌ (Deno edge에서 무겁고 호환 이슈) → REST + 직접 JWT
- 시크릿 추가 요청 ❌ — `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_PROJECT_ID` 이미 존재

## 검증

배포 후 `supabase--curl_edge_functions`로 create → get → list → update → delete 시퀀스를 한 번 돌려 동작 확인.

## 참고

이번 변경에서는 클라이언트 코드(`aiClient.ts`, 일일 제한 등)는 건드리지 않습니다. 함수만 만들고, 향후 "일일 제한 서버화" 또는 "Gemini 프록시" 단계에서 이 함수를 활용하거나 별도 함수를 추가하면 됩니다.