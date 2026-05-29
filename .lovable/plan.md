# 첫 AI 응답 지연 단축 — A + D + E 적용

B(`minInstances: 1`)와 C(`asia-northeast3` 리전 이전)는 별도 배포로 추후 진행합니다.

## A. 클라이언트 스트리밍 활성화 (가장 큰 효과)

**문제**: 서버는 이미 `geminiStreamText` + `response.sendChunk({ delta })` 로 토큰을 흘려보내지만, 클라이언트가 비-스트리밍 `httpsCallable` 을 호출하므로 `sendChunk` 가 모두 버려지고 사용자는 전체 응답이 완성될 때까지 "..." 만 봄.

**변경**: `src/lib/aiClient.ts` 의 `aiChatStream` 을 Firebase 12의 `httpsCallable(...).stream(payload)` 로 교체.

```ts
const call = httpsCallable<any, { text: string }, { delta?: string }>(getFns(), "chat");
const { stream, data } = await call.stream({ ...payload, deviceId: getDeviceId() });
for await (const chunk of stream) {
  if (chunk?.delta) yield chunk.delta;
}
await data; // 스트리밍 중 발생한 서버 에러 표면화
```

- 서버 (`functions/src/index.ts`) 는 변경 없음 — 이미 `sendChunk` 사용 중.
- `chat.tsx` 는 변경 불필요 — 이미 delta 누적 렌더링.
- 첫 토큰 도착 시각을 콘솔에 로그로 남겨 효과 확인 가능.

## D. Firebase 사전 워밍

**문제**: `/chat` 진입 후에야 `ensureFirebaseUser()` + AppCheck 토큰 발급이 시작되어 첫 호출 앞에 그대로 더해짐.

**변경**: `src/routes/create.tsx` 의 `Create()` 마운트 시점에 `void ensureFirebaseUser()` 호출. 사용자가 사진을 고르고 "AI와 대화하기" 누르는 동안 백그라운드에서 익명 로그인 + AppCheck 토큰 발급 완료. 실패해도 무시 (실제 호출 시 다시 시도).

```ts
// create.tsx 상단 import 추가
import { ensureFirebaseUser } from "@/integrations/firebase/auth";

// Create() 내부 첫 useEffect 부근
useEffect(() => {
  void ensureFirebaseUser().catch(() => {});
}, []);
```

## E. 채팅용 이미지 페이로드 축소

**문제**: `fileToDataUrl(maxDim=1280, q=0.82)` 로 만든 dataURL 을 그대로 callable JSON 에 실어 보냄. 3장 기준 ~1.5~2MB → 업로드/전송 시간 + 서버→Gemini 전송 시간 증가.

**변경**: `src/routes/chat.tsx` 의 자동-시작 effect 에서, 원본 photos 와 별도로 "AI 전송용 축소본"을 비동기 생성 후 첫 send 에 사용. UI 표시(헤더 썸네일, 미리보기 모달)와 저장된 앨범에는 원본(1280px) 유지.

```ts
// chat.tsx 상단
async function downscaleForAi(dataUrl: string, maxDim = 896, q = 0.75): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1) return dataUrl;
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", q);
}

// 자동-시작 effect
const aiPhotos = await Promise.all(ph.map(p => downscaleForAi(p)));
void send(opener, ph, [], aiPhotos);
```

`send()` 시그니처에 `aiPhotos?: string[]` 추가, 내부에서 `aiChatStream({ photos: prior.length === 0 ? (aiPhotos ?? ph) : undefined, ... })` 로 분기. photoCount 등 다른 값은 그대로.

페이로드 약 50~60% 감소 예상 → 업로드 200~500ms 단축.

## 적용 순서

1. `src/lib/aiClient.ts` — `aiChatStream` 을 `.stream()` 으로 교체
2. `src/routes/create.tsx` — 마운트 시 `ensureFirebaseUser()` 사전 호출
3. `src/routes/chat.tsx` — `downscaleForAi` 추가 + 자동-시작에서 축소본 생성 + `send()` 에 `aiPhotos` 파라미터 추가

## 검증

- 빌드 통과 확인
- 콘솔에서 `[AI Client] aiChatStream 첫 토큰 - <ms>` 로그가 종료 로그보다 훨씬 먼저 찍히는지 확인
- 네트워크 탭에서 `chat` 호출의 응답이 `Content-Type: text/event-stream` 으로 chunked 인지 확인
- `/create` 진입 시 콘솔에 `[firebase-auth] anonymous sign-in ok` 또는 `existing user reused` 가 일찍 찍히는지 확인

## 추후 (별도 배포)

- **B**: `functions/src/index.ts` 의 `chat` 함수에 `minInstances: 1` 추가 → 콜드 스타트 제거
- **C**: `setGlobalOptions({ region: "asia-northeast3" })` + 클라이언트 `getFunctions(app, "asia-northeast3")` → 한국 사용자 RTT 100~200ms 단축. 기존 us-central1 함수는 신규 함수 배포 후 삭제.
