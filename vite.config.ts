import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// GitHub Actions(Capacitor 빌드)에서만 이 환경변수를 true로 설정할 예정
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

export default defineConfig({
  nitro: isCapacitorBuild ? false : undefined,   // ← 핵심 변경
  tanstackStart: {
    spa: {
      enabled: true,
    },
  },
});
