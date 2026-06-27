// Dependency-free SSR error fallback page.
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>잠시 후 다시 시도해 주세요</title>
<style>
  html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0b0c;color:#f5f5f7}
  .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center}
  h1{font-size:20px;margin:0 0 8px}
  p{opacity:.7;margin:0 0 20px;font-size:14px;line-height:1.5}
  .row{display:flex;gap:8px;justify-content:center}
  button,a{appearance:none;border:1px solid #2a2a2e;background:#17171a;color:#f5f5f7;padding:10px 16px;border-radius:10px;font-size:14px;text-decoration:none;cursor:pointer}
  button:hover,a:hover{background:#202024}
</style>
</head>
<body>
  <div class="wrap"><div class="card">
    <h1>잠시 문제가 발생했어요</h1>
    <p>페이지를 불러오는 중 오류가 발생했습니다.<br/>새로고침하거나 홈으로 돌아가 주세요.</p>
    <div class="row">
      <button onclick="location.reload()">새로고침</button>
      <a href="/">홈으로</a>
    </div>
  </div></div>
</body>
</html>`;
}
