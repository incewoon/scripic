# 한글 검색 입력 IME 버그 수정

## 원인
현재 `src/routes/index.tsx`의 검색 input이 매 `onChange`마다 `navigate()`를 호출 → URL 변경 → 라우트 컴포넌트 리렌더 → input value가 외부에서 교체되면서 한글 자모 조합(composition) 상태가 파괴됨. 결과적으로 "안녕"을 치면 "ㅇㅏㄴㄴㅕㅇ"처럼 분리되어 입력됨.

## 수정 방안

**`src/routes/index.tsx`**
1. `q`(URL search param)와 별도로 로컬 `inputValue` state 추가
   - input의 `value`는 `inputValue` 사용
   - URL의 `q`는 필터링/하이라이트의 source of truth로 유지
2. `onCompositionStart` / `onCompositionEnd` 핸들러 추가
   - 조합 중(`isComposing` ref) 에는 URL 갱신을 보류
   - 조합 종료 시점에 URL 동기화
3. `onChange`에서 `inputValue`는 즉시 업데이트하되, URL `q` 동기화는 150~200ms debounce + 조합 중이 아닐 때만 실행
4. URL `q`가 외부에서 바뀐 경우(뒤로가기 등) → `useEffect`로 `inputValue`와 동기화 (단, 조합 중이면 스킵)

핵심 코드 골격:
```tsx
const { q } = Route.useSearch();
const [inputValue, setInputValue] = useState(q);
const isComposing = useRef(false);
const debounceRef = useRef<number | null>(null);

const syncToUrl = (v: string) => {
  if (debounceRef.current) window.clearTimeout(debounceRef.current);
  debounceRef.current = window.setTimeout(() => {
    navigate({ search: { q: v }, replace: true });
  }, 150);
};

<input
  value={inputValue}
  onChange={(e) => {
    setInputValue(e.target.value);
    if (!isComposing.current) syncToUrl(e.target.value);
  }}
  onCompositionStart={() => { isComposing.current = true; }}
  onCompositionEnd={(e) => {
    isComposing.current = false;
    syncToUrl((e.target as HTMLInputElement).value);
  }}
/>
```

5. 외부 q 변경 반영:
```tsx
useEffect(() => {
  if (!isComposing.current && q !== inputValue) setInputValue(q);
}, [q]);
```

## 네이티브 앱 빌드 호환성

Capacitor/Tauri 등으로 래핑해도 문제없음:
- TanStack Router는 브라우저 History API를 사용하지만, WebView 환경에서도 동일하게 동작
- URL은 내부적으로만 사용되고 사용자에게 노출되지 않음
- `?q=` 검색 상태도 정상 작동, 뒤로가기 제스처도 History 스택으로 처리됨
- 단, deep link(앱 외부에서 특정 URL로 진입)를 쓸 경우 Capacitor의 `App.addListener('appUrlOpen')` 같은 설정이 필요하지만 이는 검색 기능과 무관

따라서 URL 기반 검색 상태 유지 방식은 그대로 두는 게 좋습니다 — 뒤로가기로 검색어가 유지되는 UX 이점이 네이티브에서도 동일하게 작동합니다.

## 변경 범위
- `src/routes/index.tsx`만 수정
- `src/routes/album.$id.tsx`, `src/lib/highlight.tsx`는 변경 없음
