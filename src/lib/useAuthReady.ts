import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ensureFirebaseUser, getAppAuth } from "@/integrations/firebase/auth";

/**
 * Thin subscription hook. Does NOT drive sign-in by itself — it just
 * kicks off (or joins) the global `ensureFirebaseUser()` promise and
 * mirrors auth state into React.
 *
 * Safe under React Strict Mode: ensureFirebaseUser is idempotent, so
 * effects running twice never trigger duplicate anonymous sign-ins.
 */
export function useAuthReady() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    try {
      const auth = getAppAuth();
      // Subscribe BEFORE kicking off sign-in so we receive the resulting state.
      unsub = onAuthStateChanged(auth, (u) => {
        if (cancelled) return;
        setUser(u);
        if (u) setReady(true);
      });
    } catch (e: any) {
      console.error("[useAuthReady] getAppAuth failed:", e);
      if (!cancelled) {
        setError(e);
        setReady(true);
      }
      return () => {
        cancelled = true;
      };
    }

    ensureFirebaseUser()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setReady(true);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e);
        setReady(true);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  return { ready, user, error };
}
