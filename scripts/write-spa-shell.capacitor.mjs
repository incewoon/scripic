import { existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const clientDir = join("dist", "client");
const shellHtml = join(clientDir, "_shell.html");
const shellIndex = join(clientDir, "_shell", "index.html");
const targetIndex = join(clientDir, "index.html");

if (existsSync(shellHtml)) {
  copyFileSync(shellHtml, targetIndex);
  console.log("✅ Copied _shell.html → index.html");
} else if (existsSync(shellIndex)) {
  copyFileSync(shellIndex, targetIndex);
  console.log("✅ Copied _shell/index.html → index.html");
} else {
  console.error("❌ _shell.html 또는 _shell/index.html을 찾을 수 없습니다.");
  process.exit(1);
}
