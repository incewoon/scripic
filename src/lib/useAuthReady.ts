import { useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

export function useAuthReady() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    let unsub = () => {};
    try {
      const firebaseApp = getFirebase();
      const auth = getAuth(firebaseApp);
      const anyAuth = auth as any;

      console.log("[useAuthReady] Firebase auth 초기화 시작");

      if (typeof anyAuth.authStateReady === "function") {
        anyAuth
          .authStateReady()
          .then(() => {
            if (initializedRef.current) return;
            initializedRef.current = true;
            console.log("[useAuthReady] authStateReady 완료, currentUser:", auth.currentUser?.uid ?? null);
            setUser(auth.currentUser);
            setReady(true);
          })
          .catch((err: any) => {
            console.error("[useAuthReady] authStateReady 실패:", err);
            if (initializedRef.current) return;
            initializedRef.current = true;
            setUser(auth.currentUser);
            setReady(true);
          });
      }

      unsub = onAuthStateChanged(auth, (u) => {
        console.log("[useAuthReady] onAuthStateChanged fired, user:", u?.uid ?? null);
        initializedRef.current = true;
        setUser(u);
        setReady(true);
      });
    } catch (err) {
      console.error("[useAuthReady] Firebase 초기화 실패 (치명적 에러):", err);
      // 그래도 UI는 진행되게
      setReady(true);
      setUser(null);
    }

    return () => unsub();
  }, []);

  return { ready, user };
}
