## 현재 상황

앱 첫 실행 시 `StorageNoticeDialog`(메인 진입 시 1회 노출, `memori_storage_notice_seen_v1` 키로 기억)가 이미 떠요. 별도 온보딩 페이지를 새로 만들기보다 이 기존 안내에 무료 정책 안내를 추가하는 게 자연스럽습니다.

## 변경 내용

### 1. `src/lib/i18n.ts` — 새 문구 추가 (en/ko)
- `freeNoticeTitle`: "무료 베타 안내" / "Free during beta"
- `freeNoticeBody`: "현재 Memory Weaver는 무료로 제공돼요. 그래서 한 앨범에 사진 최대 3장, 하루 1개 앨범 만들기 제한이 있어요." / 영어 동등 문구
- `freeNoticeSoon`: "더 많은 사진과 무제한 앨범 제작 등 추가 기능을 빠른 시일 내에 열어드릴게요." / 영어 동등 문구

### 2. `src/components/StorageNoticeDialog.tsx`
- 기존 도메인 분리 안내 박스 아래에 "무료 베타 안내" 섹션 한 블록 추가 (제목 + 본문 + soon 라인). 톤·스타일은 기존 `bg-background/60 border border-border/60` 박스와 동일하게 유지.
- 사용자가 새 공지를 다시 한 번 보도록 SEEN_KEY를 `memori_storage_notice_seen_v2`로 한 번만 bump (이전에 본 사용자도 새 무료 정책 안내를 1회 보게 됨).

### 손대지 않는 것
- 일일 제한 로직(`dailyLimit.ts`), 사진 3장 제한 로직 — 안내 문구만 추가.
- 새 라우트/페이지를 만들지 않음. 기존 1회용 다이얼로그 재활용.
