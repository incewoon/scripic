import { defineConfig } from "@lovable.dev/vite-tanstack-config";

import fs from "node:fs";
import path from "node:path";

function extractVersionNameFromGradle(): string {
  try {
    const gradlePath = path.resolve(process.cwd(), "android/app/build.gradle");
    const content = fs.readFileSync(gradlePath, "utf-8");
    // versionName "2.40" 또는 versionName '2.40' 형식 모두 매칭
    const match = content.match(/versionName\s+["']([^"']+)["']/);
    return match ? match[1] : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(extractVersionNameFromGradle()),
  },
});
