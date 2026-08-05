// src/plugins/heic-convert.ts
import { registerPlugin } from "@capacitor/core";

export interface HeicConvertPlugin {
  convert(options: {
    path?: string;
    base64?: string;
    quality?: number; // 1-100, default 90
    maxDim?: number; // default 1280
  }): Promise<{
    path: string;
    mimeType: string;
    width?: number;
    height?: number;
  }>;
}

export const HeicConvert = registerPlugin<HeicConvertPlugin>("HeicConvert");
