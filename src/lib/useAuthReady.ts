import { useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

/**
 * Returns Firebase auth readiness. `ready` flips to true after the SDK
 * resolves the initial persisted session (or confirms there is none).
 * Use to gate any call that needs an ID token (e.g. callGeminiProxy).
 */
export function useAuthReady() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    let unsub = () => {};
    try {
      const auth = getAuth(getFirebase());
      const anyAuth = auth as any;

      if (typeof anyAuth.authStateReady === "function") {
        anyAuth
          .authStateReady()
          .then(() => {
            if (initializedRef.current) return;
            initializedRef.current = true;
            setUser(auth.currentUser);
            setReady(true);
          })
          .catch(() => {
            if (initializedRef.current) return;
            initializedRef.current = true;
            setUser(auth.currentUser);
            setReady(true);
          });
      }

      unsub = onAuthStateChanged(auth, (u) => {
        initializedRef.current = true;
        setUser(u);
        setReady(true);
      });
    } catch {
      // Firebase not configured — still mark ready so UI can proceed.
      setReady(true);
    }
    return () => unsub();
  }, []);

  return { ready, user };
}
