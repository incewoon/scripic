## 목표
4개의 주요 AI/네트워크 의존 액션 버튼에 인터넷 연결 체크를 추가하여, 오프라인 상태일 때 동작하지 않고 사용자에게 알림을 표시합니다.

## 대상 버튼
1. 메인화면(`src/routes/index.tsx`) 하단 "새 앨범 만들기" 버튼
2. 앨범 생성 설정화면(`src/routes/create.tsx`) 하단 "AI 대화 시작" 버튼
3. AI 대화화면(`src/routes/chat.tsx`) 상단 우측 "완성하기" 버튼
4. 앨범 보기(`src/routes/album.$id.tsx`)의 "수정" 버튼

## 구현 방식

### 1. 공용 유틸 추가: `src/lib/network.ts`
- `isOnline()`: `navigator.onLine` 기반 동기 체크
- `useOnlineStatus()`: React hook — `online`/`offline` 이벤트 구독해 상태 반환
- `requireOnline(t)`: 오프라인이면 `toast.error(t.offlineNotice)` 띄우고 `false` 반환, 온라인이면 `true`

> `navigator.onLine`은 일부 환경에서 false positive가 있으나, Capacitor + 모바일 브라우저에서 끊김 감지는 충분히 신뢰 가능. (필요 시 Capacitor `@capacitor/network`로 추후 강화 가능)

### 2. i18n 키 추가 (`src/lib/i18n.ts`)
- `offlineNotice` (예: "인터넷 연결을 확인해주세요." / "Please check your internet connection.")
- `offlineDisabled` (버튼 비활성 시 보조 안내, 필요 시)

### 3. 각 화면 적용
공통 패턴:
```tsx
const online = useOnlineStatus();
<Button
  disabled={... || !online}
  onClick={() => { if (!requireOnline(t)) return; /* 기존 로직 */ }}
  title={!online ? t.offlineNotice : undefined}
>
```

- **index.tsx**: "새 앨범 만들기" CTA에 `disabled`와 onClick 가드 추가
- **create.tsx**: 하단 "AI 대화 시작" 버튼에 동일 적용
- **chat.tsx**: 상단 우측 "완성하기" 버튼에 동일 적용 (대화 입력/전송 버튼은 이번 범위 외 — 사용자 요청 4개만)
- **album.$id.tsx**: "수정"(연필) 버튼에 동일 적용

### 4. UX 디테일
- 오프라인일 때 버튼은 시각적으로 `disabled`(opacity 낮춤) 처리
- 클릭 시도 시(터치 영역에서 disabled가 안 먹는 케이스 대비) onClick에서도 `requireOnline` 가드로 한 번 더 차단 + toast
- 온라인 복귀 시 hook이 자동으로 버튼을 다시 활성화

## 범위 외
- 이미 진행 중인 AI 스트림 도중 끊김 처리(별도 retry 배너가 이미 존재)
- 백업/복원, 지도, 검색 등 기타 버튼 (사용자가 명시한 4곳만 처리)
