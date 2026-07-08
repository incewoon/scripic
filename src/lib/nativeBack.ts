// Android hardware back button coordination for the Capacitor shell.
// Web (browser) 동작은 건드리지 않는다 — Capacitor.isNativePlatform() 가드로
// 네이티브에서만 활성화된다.

import { Capacitor } from "@capacitor/core";

export type NativeBackHandler = () => boolean | Promise<boolean>;

const handlerStack: NativeBackHandler[] = [];

export function pushNativeBackHandler(handler: NativeBackHandler): () => void {
  handlerStack.push(handler);
  return () => {
    const i = handlerStack.lastIndexOf(handler);
    if (i >= 0) handlerStack.splice(i, 1);
  };
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

let initialized = false;

export async function initGlobalNativeBack(opts: {
  onHomeExitRequest: () => void;
}): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  if (initialized) return () => {};
  initialized = true;

  const { App } = await import("@capacitor/app");
  const sub = await App.addListener("backButton", async () => {
    // LIFO: 화면 로컬 핸들러가 먼저 소비할 기회를 갖는다.
    for (let i = handlerStack.length - 1; i >= 0; i--) {
      try {
        const consumed = await handlerStack[i]();
        if (consumed) return;
      } catch (e) {
        console.warn("[nativeBack] handler error", e);
      }
    }
    const path = window.location.pathname;
    if (path === "/" || path === "") {
      opts.onHomeExitRequest();
      return;
    }
    window.history.back();
  });

  return () => {
    initialized = false;
    sub.remove();
  };
}

export async function exitApp(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  await App.exitApp();
}
