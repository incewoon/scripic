// scripts/write-spa-shell.mjs
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const clientDir = join(process.cwd(), "dist", "client");
const assetsDir = join(clientDir, "assets");

if (!existsSync(assetsDir)) {
  console.error("❌ dist/client/assets 폴더가 없습니다. vite build가 실패했을 수 있습니다.");
  process.exit(1);
}

const files = readdirSync(assetsDir);

// 메인 엔트리 JS 파일 찾기 (index-XXXXXXXX.js 형태)
const entryJs = files.find((f) => /^index-.*\.js$/.test(f));
// 메인 CSS 파일 찾기 (styles-XXXXXXXX.css 형태)
const entryCss = files.find((f) => /^styles-.*\.css$/.test(f));

if (!entryJs) {
  console.error("❌ entry JS 파일을 찾지 못했습니다. assets 폴더 내용:", files);
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Scripic</title>
  ${entryCss ? `<link rel="stylesheet" href="/assets/${entryCss}" />` : ""}
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/assets/${entryJs}"></script>
</body>
</html>
`;

writeFileSync(join(clientDir, "index.html"), html);
console.log(`✅ index.html written successfully`);
console.log(`   - entry JS:  ${entryJs}`);
console.log(`   - entry CSS: ${entryCss ?? "(none found)"}`);
