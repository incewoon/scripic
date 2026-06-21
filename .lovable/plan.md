## 목적

세 곳의 안내(앨범 생성 / AI 대화 / 앨범 상세 편집)를 **한 화면에 모두 나열하던 다이얼로그**에서, `EditCoachmark`처럼 **실제 화면 위에 스포트라이트를 비추며 한 단계씩 넘기는 코치마크**로 바꾼다. 다시보지않기 체크박스는 전부 제거하고, 모든 안내는 **앱 설치 후(=기기당) 딱 한 번만** 표시된다.

---

## 1. 파일 정리 / 이름 변경

- `src/components/PrivacyConsentDialog.tsx` → `src/components/CreateUsageCoachmark.tsx`로 교체
  - 내보내는 이름: `CreateUsageCoachmark`, `shouldShowCreateUsage`
  - 기존 `PRIVACY_POLICY_URL` 상수는 사용처(StorageNoticeDialog)가 있으니, **새 파일 `src/lib/legal.ts`**로 옮기고 양쪽에서 import. (`PrivacyConsentDialog`라는 이름이 코드베이스에서 완전히 사라지게 함.)
- `src/components/ChatUsageDialog.tsx` → `src/components/ChatUsageCoachmark.tsx`로 교체 (이름 동일하게 사용처 갱신)
  - 내보내는 이름: `ChatUsageCoachmark`, `shouldShowChatUsage`
- `src/components/EditCoachmark.tsx`는 그대로 두되, 사용 방식만 멀티스텝으로 바꿈(아래 4번).

사용처 import 갱신: `src/routes/create.tsx`(PrivacyConsentDialog → CreateUsageCoachmark), `src/routes/chat.tsx`(ChatUsageDialog → ChatUsageCoachmark), `src/components/StorageNoticeDialog.tsx`(PRIVACY_POLICY_URL은 `@/lib/legal`에서).

---

## 2. 공용 코치마크 컴포넌트(인라인 또는 신규 헬퍼)

세 코치마크가 모두 같은 패턴이므로, **`EditCoachmark.tsx`를 일반화**해서 멀티스텝 + 자동 카드 위치 지정 기능을 갖춘 공용 컴포넌트 `Coachmark`로 확장한다. (EditCoachmark는 이 Coachmark를 단순 래핑하는 형태로 유지하거나 album.$id.tsx에서 직접 Coachmark를 사용.)

공용 Coachmark props:

```ts
type Step = {
  target?: RefObject<HTMLElement | null>; // 없으면 스포트라이트 없이 중앙 카드
  title: string;
  body: string;
  // 카드 위치: 'auto'(타깃이 화면 상단이면 아래, 하단이면 위), 'top', 'bottom', 'center'
  placement?: 'auto' | 'top' | 'bottom' | 'center';
};
type Props = {
  open: boolean;
  steps: Step[];
  onClose: () => void;       // 마지막 단계 "확인" 또는 X 클릭
  nextLabel: string;         // i18n "다음"
  doneLabel: string;         // i18n "확인"
  closeLabel?: string;       // 접근성
};
```

동작:
- 현재 스텝의 `target.current` 위치를 측정해 SVG mask로 스포트라이트 + 펄싱 링(현재 `EditCoachmark`와 동일 로직).
- 힌트 카드 배치: `placement = 'auto'`일 때 타깃 중심이 뷰포트 상반부면 카드는 화면 **하단**, 하반부면 카드는 화면 **상단**에 표시. → 항상 하이라이트를 가리지 않음.
- 타깃이 화면 안에 보이지 않으면, 코치마크 열기 직전 `target.scrollIntoView({ block: 'center' })`로 스크롤 후 측정.
- 카드 하단 버튼: 마지막 스텝이 아니면 **다음**, 마지막 스텝이면 **확인**. 우상단 X로 즉시 종료 가능. 체크박스 없음.
- 종료 시 한 번에 localStorage 키를 `'1'`로 기록(아래 3번).

---

## 3. "딱 한 번만" 표시 정책

모든 sessionStorage / "다시보지않기" 로직 제거. 단순히 **localStorage 키 1개**만 사용.

| 코치마크 | localStorage 키 |
|---|---|
| Create (앨범 생성 화면) | `scripic_coach_create_seen` |
| Chat (AI 대화 화면) | `scripic_coach_chat_seen` |
| Album edit (편집/장소 추가) | `scripic_coach_albumedit_seen` |

각각의 `shouldShow*()`는 `localStorage.getItem(key) !== '1'`만 검사. 코치마크 종료(onClose) 시 `localStorage.setItem(key, '1')`.

기존 `memori_create_usage_*`, `memori_chat_usage_*`, `memori_storage_notice_*`(StorageNoticeDialog는 이번 작업 대상 아님) 등 옛 키는 그대로 두고 새 키로 갈아탐(과거 이력에 영향 없음).

부수 효과: 앨범 상세의 편집 코치마크가 더 이상 "앨범 생성 직후"에만 뜨지 않고 **기기에서 첫 앨범 상세 진입 시 1회**만 뜨도록 변경 (아래 6번).

---

## 4. 화면별 단계 구성

### 4-1. `src/routes/create.tsx` — CreateUsageCoachmark (4단계)

새 ref 4개를 추가:
- `photoGridRef` → 사진 그리드/업로드 영역 컨테이너 (line ~325~349 div를 감싸기)
- `modeRef` → "정리 타입" 섹션 (line 350 div)
- `toneRef` → "정리 어조" 섹션 (line 378 div)
- `tagsRef` → "태그" 섹션 (line 406 div)

스텝 본문(짧게, 1~2문장):
1. **사진** — "최대 3장까지 올릴 수 있어요. 대표 사진은 가장 왼쪽이에요." (이미 화면에 안내 카드가 있으므로 간단히)
2. **정리 타입** — 모드 3종(창의/사실/간결) 의미를 한 줄씩.
3. **정리 어조** — 톤 3종(정중/친근/짧게) 의미를 한 줄씩.
4. **태그** — 프리셋 외에 직접 입력해 추가할 수 있고, 추가한 태그는 다음 앨범 만들 때도 계속 나타납니다.

각 스텝 `placement: 'auto'`. 마지막 버튼은 **확인**.

기존 `<PrivacyConsentDialog>` JSX(line 542)를 `<CreateUsageCoachmark>`로 교체. `shouldShowCreateUsage()`로 1회 표시.

### 4-2. `src/routes/chat.tsx` — ChatUsageCoachmark (4단계)

새 ref 3개:
- `finishBtnRef` → 우상단 "완성하기" 버튼
- `micBtnRef` → 입력창의 마이크 버튼
- `composerRef` → 입력 영역(텍스트 + 전송)

스텝:
1. **소개 (타깃 없음, center)** — "AI와 대화하며 사진에 담긴 기억을 함께 꺼내보세요."
2. **대화 횟수** — `composerRef` 하이라이트 + "사진 한 장당 3번 정도, 전체 최대 9번 대화 후 자동으로 마무리됩니다." (타깃이 하단이라 카드는 위로 뜸)
3. **완성하기** — `finishBtnRef` 하이라이트 + "원할 때 우상단 완성하기를 눌러 바로 앨범을 만들 수 있어요." (타깃이 상단이라 카드는 아래로)
4. **마이크 입력** — `micBtnRef` 하이라이트 + "마이크 버튼을 누르면 말로 입력할 수 있어요."

기존 `<ChatUsageDialog>` 사용처(line 167 useEffect / JSX mount)를 새 컴포넌트로 교체.

### 4-3. `src/routes/album.$id.tsx` — Edit coachmark (2단계)

기존 `EditCoachmark`는 펜과 장소 핀을 **동시에** 비추는 형태인데, 이를 **2스텝**으로 분리.
- Step 1: `pencilBtnRef` — "이 연필 버튼으로 제목과 본문을 직접 수정할 수 있어요."
- Step 2: `locationChipRef` — "여기에서 사진이 찍힌 장소를 추가하거나 바꿀 수 있어요."

조건 변경: 현재는 `sessionStorage.getItem("scripic:justCreated") === album.id`일 때만 표시 (= 앨범 생성할 때마다 잠재적으로 표시 가능). 이를 `localStorage.getItem('scripic_coach_albumedit_seen') !== '1'`로 바꿈 → **기기에서 단 한 번**, 첫 앨범 상세 진입 시 표시. 종료 시 키 기록. `scripic:justCreated` 관련 코드는 그대로 둬도 무해하므로 유지.

`EditCoachmark` 컴포넌트는 새 멀티스텝 시그니처(`steps: Step[]`)로 변경하거나, 내부에서 공용 `Coachmark`를 사용하도록 리팩터.

---

## 5. i18n (`src/lib/i18n.ts`)

다음 키 추가 (ko/en 양쪽):

- 공통: `coachNext`("다음" / "Next"), `coachDone`("확인" / "Got it")
- Create 4스텝: `createCoachPhotosTitle/Body`, `createCoachModeTitle/Body`, `createCoachToneTitle/Body`, `createCoachTagsTitle/Body`
- Chat 4스텝: `chatCoachIntroTitle/Body`, `chatCoachTurnsTitle/Body`, `chatCoachFinishTitle/Body`, `chatCoachMicTitle/Body`
- Album edit 2스텝: `editCoachPencilTitle/Body`, `editCoachLocationTitle/Body` (기존 `editCoachTitle/Body/Ok`는 더 이상 사용 안 함 → 삭제)

기존 `createUsage*`, `chatUsage*`, `dontShowNextTime`, `privacyConsentBody`(생성 안내용으로 PrivacyConsentDialog가 노출했던 본문 키들 중 코치마크에서만 쓰이던 것), `editCoachTitle/Body/Ok`는 제거. 단 `StorageNoticeDialog`가 여전히 쓰는 `privacyConsentBody`, `privacyPolicyView` 등은 유지.

---

## 6. 코드 변경 요약(파일별)

- `src/components/CreateUsageCoachmark.tsx` (신규, 기존 PrivacyConsentDialog 교체)
- `src/components/ChatUsageCoachmark.tsx` (신규, 기존 ChatUsageDialog 교체)
- `src/components/EditCoachmark.tsx` 또는 신규 `src/components/Coachmark.tsx` — 멀티스텝/자동 카드 위치 지원
- `src/lib/legal.ts` (신규) — `PRIVACY_POLICY_URL` 이동
- `src/components/StorageNoticeDialog.tsx` — `PRIVACY_POLICY_URL` import 경로만 변경
- `src/routes/create.tsx` — refs 4개 추가, 섹션 div에 `ref={...}` 부착, 다이얼로그 → 코치마크 교체
- `src/routes/chat.tsx` — refs 3개 추가, 완성하기/마이크 버튼/composer에 ref 부착, 다이얼로그 → 코치마크 교체
- `src/routes/album.$id.tsx` — 표시 조건을 localStorage 키로 변경, 2스텝 호출로 변경
- `src/lib/i18n.ts` — 위 5번대로 키 추가/삭제
- 기존 `PrivacyConsentDialog.tsx`, `ChatUsageDialog.tsx` 파일 삭제

---

## 비변경

- `StorageNoticeDialog`(앱 첫 실행 안내)의 내용·동작은 그대로. `PRIVACY_POLICY_URL` import 경로만 갱신.
- AI 대화 로직, 앨범 생성 로직, 태그 입력/스크롤 동작 등 기능 변경 없음.
- `EditCoachmark`의 시각 스타일(스포트라이트, 펄싱 링, 카드 톤)은 유지하며 멀티스텝만 추가.
