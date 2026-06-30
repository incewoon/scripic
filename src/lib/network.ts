// Lightweight online/offline gating for AI/network-dependent actions.
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => isOnline());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(isOnline());
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function requireOnline(message: string): boolean {
  if (isOnline()) return true;
  toast.error(message);
  return false;
}
