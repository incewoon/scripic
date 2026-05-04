# 두 가지 버그 수정 계획

## 버그 1 — 게스트(무료)인데 한도가 남아있어도 "새 앨범"이 로그인 화면으로 넘어감

**원인** (`src/routes/index.tsx`, `onCreate` 함수, 101–112행)

```ts
const onCreate = () => {
  if (!user) {
    if (count >= FREE_MAX) { setLimitOpen(true); return; }
    navigate({ to: "/auth" });   // ← 한도가 남았는데도 무조건 로그인으로 보냄
    return;
  }
  ...
};
```

게스트의 경우 `count < FREE_MAX`이면 **그대로 `/create`로 가야 하는데**, 한도가 안 찼을 때 `/auth`로 보내버리는 잘못된 분기가 들어가 있어요. 첫 화면 안내(“기기에만 저장”) 정책상 게스트도 5개까지는 자유롭게 만들 수 있어야 합니다.

**수정**

```ts
const onCreate = () => {
  if (!user) {
    if (count >= FREE_MAX) { setLimitOpen(true); return; }
    navigate({ to: "/create" });   // 한도 남으면 바로 생성
    return;
  }
  if (!canCreateAlbum(profile)) { setPaywall(true); return; }
  navigate({ to: "/create" });
};
```

## 버그 2 — 앨범 삭제 시 확인 후 다른 앨범 상세화면이 열림

**원인** (`src/routes/index.tsx`, 220–250행)

각 앨범 카드 전체가 `<Link to="/album/$id">`로 감싸져 있고, 그 **링크 내부에** 삭제 버튼이 들어 있어요.

```tsx
<Link to="/album/$id" ...>
  ...
  <button onClick={(e) => { e.preventDefault(); e.stopPropagation();
    if (confirm(t.confirmDelete)) onDelete(a.id); }}>
    삭제
  </button>
</Link>
```

문제는:
1. `confirm()`은 **동기 호출이라 그 사이에 이벤트 처리가 멈췄다가 재개**되는데, React/TanStack Link 환경에서는 confirm 다이얼로그가 뜨는 동안 `preventDefault`의 효과가 보장되지 않는 경우가 있어요. 확인을 누른 뒤 `<Link>`의 클릭 동작이 한 번 더 발화되면서 인접한 다른 앨범의 라우트로 넘어갈 수 있습니다.
2. 더 근본적으로, **버튼을 링크 내부에 두는 것은 HTML 스펙상 잘못된 중첩**이라 인터랙션이 예측 불가합니다.

**수정 — 삭제 버튼을 Link 바깥으로 빼고, 카드 컨테이너를 `relative`로 만들어 절대배치**

```tsx
<div key={a.id} className="album-card group relative">
  <Link to="/album/$id" params={{ id: a.id }} className="block">
    <div className="aspect-[5/4] ...">...</div>
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[12px] warm-muted">{t.photosCount(a.photos.length)}</span>
      <span className="w-16" /> {/* 삭제 버튼 자리 확보 */}
    </div>
  </Link>

  {/* Link 바깥, 카드 위에 절대배치 */}
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(t.confirmDelete)) onDelete(a.id);
    }}
    className="absolute bottom-2 right-2 text-muted-foreground/70 hover:text-destructive
               text-[12px] flex items-center gap-1 px-2 py-1 rounded-md z-10"
  >
    <Trash2 size={12} /> {t.delete}
  </button>
</div>
```

이렇게 하면 삭제 버튼 클릭이 `<Link>` 클릭과 완전히 분리되어 다른 앨범으로 넘어가는 일이 없어집니다. 또한 `confirm` 대신 좀 더 안전하게 동작하도록 추후 `AlertDialog`로 바꾸는 것도 고려할 수 있지만, 이번 수정에서는 동작 정상화에 집중합니다.

## 변경 파일

- `src/routes/index.tsx` — `onCreate` 분기 수정, 앨범 카드의 삭제 버튼을 `<Link>` 바깥으로 이동

승인해주시면 바로 적용할게요.
