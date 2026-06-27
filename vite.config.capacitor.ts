import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,                    // Capacitor는 Nitro가 필요 없음
  tanstackStart: {
    spa: {
      enabled: true,
    },
  },
});
