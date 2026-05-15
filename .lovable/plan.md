# 사진 날짜 정렬 버그 수정 계획

## 원인
- 앨범의 `period`는 `src/lib/photoMeta.ts`의 `summarizePeriod`가 `"YY.MM.DD"`(예: `"26.05.09"`) 또는 같은 달 범위 `"26.05.09~10"` 형식으로 만든다.
- `src/routes/index.tsx`의 `parsePeriodDate`는 `\d{4}`(4자리 연도)만 매칭하므로 위 형식에서 항상 실패 → `Date.parse()`도 비표준이라 NaN/0 → `a.createdAt` 폴백.
- 결과적으로 "사진 날짜 ↓" 선택해도 실제로는 만든 날짜 순으로 정렬되어, 첨부 스크린샷처럼 5/13 만든 `26.05.09` 앨범이 5/12 만든 `26.05.10` 앨범보다 위에 표시됨.

## 변경

### `src/routes/index.tsx` — `parsePeriodDate` 교체
2자리 연도(YY → 20YY) 및 범위 표기(`~`, `-`)를 지원하도록 정규식과 로직을 다음과 같이 바꾼다:

```ts
function parsePeriodDate(period?: string): number {
  if (!period) return 0;
  // "26.05.09", "26.05.09~10", "2026.05.09", "26-05-09" 등
  const m = period.match(/(\d{2,4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (m) {
    let y = Number(m[1]);
    if (y < 100) y += 2000;
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
      return Date.UTC(y, mo, d);
    }
  }
  // 마지막 폴백: 표준 ISO만
  const iso = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  return 0;
}
```

- 2자리 연도를 20YY로 보정.
- 구분자 `.`, `-`, `/`, 한글 `년/월` 모두 허용.
- 범위 표기(`26.05.09~10`)도 첫 날짜 기준으로 정상 파싱.
- 타임존 영향을 없애기 위해 `Date.UTC` 사용(코드베이스 권장 패턴과 일치).

다른 파일은 변경하지 않는다. 정렬 호출부(`sortMode === "photo"` 분기)는 그대로 동작한다.

## 검증
- 미리보기에서 "사진 날짜 ↓" 선택 시 `26.05.13` → `26.05.10` → `26.05.09` 순으로 정렬되는지 확인.
- "↑" 토글 시 역순으로 바뀌는지 확인.
- 만든 날짜 정렬은 그대로 정상 동작 유지.
