# 앨범 수정 모드에서 태그 편집 기능 추가

## 목표
앨범 상세보기에서 **수정 모드(연필 아이콘 ON)** 일 때만 태그를 편집할 수 있게 한다.
- 기존 태그: 클릭 시 검색 이동이 아니라 제거(또는 편집)로 동작
- 새 태그 추가: 사진 추가 버튼과 동일한 **점선 테두리 타원형 버튼**(`+ 태그`)을 두고, 누르면 태그 선택 팝업이 뜬다
- 보기 모드(현재 동작)는 그대로 유지: 태그 클릭 → 홈으로 검색 이동

## UI 변경 (`src/routes/album.$id.tsx`)

태그 영역(`album.tags` 렌더링하는 블록)을 `editMode` 분기로 둘로 나눈다.

- **보기 모드 (현재 그대로)**: `<Link to="/" search={{ tags: [tag] }}>` 칩
- **수정 모드**:
  - 각 태그 칩은 우측에 작은 × 아이콘이 붙은 **버튼**으로 렌더 (클릭 시 해당 태그 제거 → `patch({ tags: next })`)
  - 마지막에 점선 테두리의 타원형 **`+ 태그`** 버튼 (create.tsx의 사진 추가 슬롯과 동일한 dashed border 스타일)
  - 태그가 하나도 없는 앨범에서도 수정 모드면 이 점선 버튼만 단독으로 노출

## 태그 선택 팝업 (`src/components/TagPickerDialog.tsx` 신규)

shadcn `Dialog` 기반 재사용 컴포넌트:

```
props: {
  open, onOpenChange,
  value: string[],          // 현재 앨범 태그
  onChange: (next: string[]) => void,
}
```

내용 구성 (create.tsx의 태그 섹션 로직 재사용):
1. **프리셋 칩** — `t.tagPresetTravel` 등 6개 (i18n 기존 키)
2. **내 태그 칩 가로 스크롤** — 다른 앨범에서 수집한 사용자 정의 태그 (`getAlbums()`로 수집, create.tsx의 로직과 동일)
3. **직접 입력** — `tagDraft` + 추가 버튼, Enter 동작, `#` 접두/공백/20자 제한 등 create.tsx와 동일 규칙
4. 선택 토글 즉시 `onChange`로 상위에 반영 (앨범에는 `patch({ tags })`로 즉시 저장)
5. 하단 닫기 버튼

별도 "저장" 단계 없이 토글 즉시 반영(편집 UX 일관성). `toast.success(t.saved)`는 닫을 때 한 번만.

## 상태/연결

`album.$id.tsx`에 `tagPickerOpen` 상태 추가, 점선 버튼이 이를 연다. `onChange`에서 `patch({ tags: next })` 호출. 보기 모드의 `<Link>` 동작은 변경하지 않는다.

## 영향 받는 파일
- `src/routes/album.$id.tsx` — 태그 영역 분기, 다이얼로그 연결
- `src/components/TagPickerDialog.tsx` — 신규
- i18n 키는 기존(`tagsLabel`, `tagPreset*`, `tagAdd`, `tagAddPlaceholder`) 재사용. 별도 추가 없음.

## 변경하지 않는 것
- create.tsx 태그 로직, 보기 모드 칩 동작, 다른 편집 가능 필드(EditableText)들
