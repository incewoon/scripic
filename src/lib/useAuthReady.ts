import { useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getFirebase } from "@/integrations/firebase/client";

export function useAuthReady() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    let unsub = () => {};
    try {
      const auth = getAuth(getFirebase());

      unsub = onAuthStateChanged(auth, (u) => {
        if (u) {
          // 로그인된 유저 있음 (익명이든 실제든)
          initializedRef.current = true;
          setUser(u);
          setReady(true);
        } else {
          // 유저 없음 → 익명으로 자동 로그인
          signInAnonymously(auth).catch((err) => {
            console.error("[useAuthReady] 익명 로그인 실패:", err);
            // 익명 로그인도 실패하면 일단 ready만 true로
            setReady(true);
          });
        }
      });
    } catch (err) {
      console.error("[useAuthReady] Firebase 초기화 실패:", err);
      setReady(true);
    }
    return () => unsub();
  }, []);

  return { ready, user };
}
