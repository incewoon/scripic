import { type RefObject } from "react";
import { Coachmark, type CoachStep } from "@/components/Coachmark";
import { useT } from "@/lib/i18n";

const SEEN_KEY = "scripic_coach_chat_seen";

export function shouldShowChatUsage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  finishRef: RefObject<HTMLElement | null>;
  micRef: RefObject<HTMLElement | null>;
  composerRef: RefObject<HTMLElement | null>;
};

export function ChatUsageCoachmark({ open, onClose, finishRef, micRef, composerRef }: Props) {
  const { t } = useT();
  const steps: CoachStep[] = [
    { title: t.chatCoachIntroTitle, body: t.chatCoachIntroBody, placement: "center" },
    { target: composerRef, title: t.chatCoachTurnsTitle, body: t.chatCoachTurnsBody, placement: "top" },
    { target: finishRef, title: t.chatCoachFinishTitle, body: t.chatCoachFinishBody, placement: "bottom" },
    { target: micRef, title: t.chatCoachMicTitle, body: t.chatCoachMicBody, placement: "top" },
  ];
  return (
    <Coachmark
      open={open}
      steps={steps}
      onClose={() => {
        markSeen();
        onClose();
      }}
    />
  );
}
