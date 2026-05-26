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
      initializedRef.current = true;
      setUser(u);
      setReady(true);
    } else {
      console.log("[useAuthReady] user null → signInAnonymously 시도");
      signInAnonymously(auth)
        .then((result) => {
          console.log("[useAuthReady] 익명 로그인 성공:", result.user.uid);
        })
        .catch((err) => {
          console.error("[useAuthReady] 익명 로그인 실패 코드:", err.code);
          console.error("[useAuthReady] 익명 로그인 실패 메시지:", err.message);
          setReady(true);
        });
    }
  });



