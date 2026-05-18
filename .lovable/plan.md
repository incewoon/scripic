# 앱명 변경: Memory Weaver → Rementory

저작권 이슈로 모든 사용자 노출 텍스트의 "Memory Weaver"를 **Rementory**로 교체합니다.

## 변경 대상 (사용자 노출 문자열)

1. **메타/매니페스트/네이티브 설정**
   - `src/routes/__root.tsx` — `<title>`, `og:title`, `twitter:title`
   - `public/manifest.json` — `name`, `short_name`, description
   - `capacitor.config.ts` — `appName`
   - `index.html` (있다면 title/메타도 확인)

2. **i18n 문자열 (한/영 양쪽)**
   - `src/lib/i18n.ts` — "Memory Weaver" 포함 모든 문구

3. **라우트 페이지**
   - `src/routes/index.tsx`, `chat.tsx`, `create.tsx`, `album.$id.tsx`, `settings.tsx`, `easter.tsx` 의 모든 "Memory Weaver" 텍스트 (헤더/푸터/카피)

4. **AI 프롬프트 (리뷰 보상 + 앨범 생성)**
   - `src/lib/reviewReward.functions.ts` — 시스템 프롬프트 안의 "Memory Weaver" 브랜드명, 인식 키워드, success_message 4종
   - `functions/src/prompts-album.ts` 및 미러 `supabase/functions/_shared/prompts-album.ts` — "weaving memories" 등 브랜드 연관 문구 (단, "weaver/weaving"이 일반 동사로 쓰인 묘사 표현은 자연스럽게 Rementory 톤으로 수정)

## 변경하지 **않을** 항목 (의도적 보존)

- **localStorage 키** (`memori_albums_v1`, `memori_photo_picks_v1`, `memori_photo_perm_asked_v1`, `memori_storage_notice_seen_v2`) — 변경 시 기존 사용자의 저장된 앨범/설정이 전부 사라집니다. 내부 키이므로 사용자에게 보이지 않아 그대로 유지.
- **`window.__MEMORI_NATIVE__` 플래그** (`src/lib/native.ts`) — Capacitor 네이티브 빌드에서 주입되는 내부 식별자. 변경하려면 안드로이드 네이티브 코드도 함께 바꿔야 하므로 보존.
- **Capacitor `appId: "app.lovable.aialbum"`** — 변경 시 기존 설치 앱과 단절(다른 앱 취급). `appName`만 "Rementory"로.

## 진행 방식

`grep -rl "Memory Weaver"` 결과 11개 파일을 일괄 교체 + 프롬프트 4개 파일에서 브랜드명 참조 부분 정밀 교체. AI 프롬프트의 review reward 시스템 프롬프트는 한국어 success_message 4종도 모두 "Memory Weaver" → "Rementory"로 치환.

## 확인 사항

- 위 "보존" 항목(localStorage 키, native 플래그, Capacitor appId) 그대로 두는 것으로 진행해도 될까요? 만약 **완전 클린 리브랜딩**을 원하시면 키도 `rementory_*`로 마이그레이션(기존 데이터 1회성 이전 코드 포함)할 수 있습니다.
