// scripts/write-spa-shell.mjs
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const clientDir = join(process.cwd(), "dist", "client");

// TanStack Start가 생성하는 shell 파일 후보들
const candidates = [
  join(clientDir, "_shell.html"),
  join(clientDir, "_shell", "index.html"),
];

const source = candidates.find((p) => existsSync(p));

if (!source) {
  console.log("ℹ️  _shell.html 없음 — Nitro SSR 모드로 간주하고 스킵합니다.");
  process.exit(0);
}

const destination = join(clientDir, "index.html");
copyFileSync(source, destination);

console.log(`✅ index.html을 실제 TanStack Start shell에서 복사했습니다.`);
console.log(`   - 원본: ${source}`);
console.log(`   - 대상: ${destination}`);