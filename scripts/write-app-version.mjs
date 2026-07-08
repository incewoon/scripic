import fs from "node:fs";
import path from "node:path";

const gradlePath = path.resolve(process.cwd(), "android/app/build.gradle");
let version = "0.0.0";
try {
  const content = fs.readFileSync(gradlePath, "utf-8");
  const match = content.match(/versionName\s+["']([^"']+)["']/);
  if (match) version = match[1];
} catch {
  // gradle 파일이 없는 환경(예: 순수 웹 전용 배포)에서도 빌드가 죽지 않도록 폴백
}

const outPath = path.resolve(process.cwd(), "src/generated/app-version.ts");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `export const APP_VERSION = ${JSON.stringify(version)};\n`);
console.log(`[write-app-version] APP_VERSION = ${version}`);
