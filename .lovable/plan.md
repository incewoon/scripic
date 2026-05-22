## 목표
앨범 생성 화면(`/create`)의 "정리 타입(mode)"과 "정리 어조(tone)" 선택값을 localStorage에 저장하여, 다음 앨범 생성 시 기본값으로 자동 선택되도록 한다.

## 변경 사항

**`src/routes/create.tsx`**
- localStorage 키 추가: `scripic_default_mode`, `scripic_default_tone`
- `useState` 초기값을 localStorage에서 읽어오도록 lazy initializer 적용 (없거나 잘못된 값이면 현재 기본값 `creative` / `politely` 사용, SSR 안전 처리 `typeof window`)
- `setMode` / `setTone` 호출을 감싸는 핸들러 추가 → 상태 업데이트 + localStorage 저장
- 기존 버튼 onClick 핸들러를 새 핸들러로 교체

## 건드리지 않는 부분
- 백엔드/서버 함수, i18n, 테마, 다른 라우트 모두 변경 없음
- 세션 단위 키(`memori_mode`, `memori_tone`)는 유지 — 현재 앨범 생성 흐름과 무관하게 작동
- 값 검증은 단순 화이트리스트(`["creative","fact","brief"]`, `["politely","friendly","short"]`)로 처리

## 검증
- 옵션 변경 → 페이지 이동 → `/create` 재방문 시 마지막 선택값이 기본으로 표시되는지 확인
