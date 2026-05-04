## 변경 사항

`src/routes/chat.tsx` 라인 317~318의 썸네일 번호 뱃지를 사진 안쪽으로 이동:

- 위치: `-top-1 -left-1` → `top-0.5 left-0.5` (사진 안쪽 좌상단)
- 크기: `w-4 h-4 text-[9px]` → `w-[18px] h-[18px] text-[10px]` (가독성)
- 배경 위 가독성: `ring-1 ring-background shadow-sm` 추가

이로써 `overflow-x-auto` 컨테이너에 의해 뱃지가 잘리던 문제가 해결됩니다.