// Custom Android Capacitor plugin wrapper for our in-house SpeechRecognizer
// implementation. See android/.../ScripicSTTPlugin.java for the native side.
//
// On iOS / web this module is not used (chat.tsx keeps webkitSpeechRecognition).

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type ScripicPermState = "granted" | "denied" | "prompt";

export interface ScripicSTTStartOptions {
  language: string;
  partialResults?: boolean;
}

export interface ScripicSTTPartialEvent {
  matches: string[];
}

export interface ScripicSTTStateEvent {
  status: "started" | "stopped";
}

export interface ScripicSTTErrorEvent {
  code: number;
  message: string;
}

export interface ScripicSTTPlugin {
  available(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ speechRecognition: ScripicPermState }>;
  requestPermissions(): Promise<{ speechRecognition: ScripicPermState }>;
  start(options: ScripicSTTStartOptions): Promise<void>;
  stop(): Promise<void>;

  addListener(
    event: "partialResults",
    cb: (data: ScripicSTTPartialEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "listeningState",
    cb: (data: ScripicSTTStateEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: "error",
    cb: (data: ScripicSTTErrorEvent) => void,
  ): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}

export const ScripicSTT = registerPlugin<ScripicSTTPlugin>("ScripicSTT");
