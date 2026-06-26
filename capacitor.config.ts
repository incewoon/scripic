import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.aialbum",
  appName: "Scripic",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: true, 
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
