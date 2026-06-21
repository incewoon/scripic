import { type RefObject } from "react";
import { Coachmark, type CoachStep } from "@/components/Coachmark";
import { useT } from "@/lib/i18n";

const SEEN_KEY = "scripic_coach_albumedit_seen";

export function shouldShowEditCoach(): boolean {
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

export function EditCoachmark({
  open,
  onClose,
  pencilRef,
  locationRef,
  downloadRef, // ← 추가
}: {
  open: boolean;
  onClose: () => void;
  pencilRef: RefObject<HTMLElement | null>;
  locationRef: RefObject<HTMLElement | null>;
  downloadRef: RefObject<HTMLElement | null>; // ← 추가
}) {
  const { t } = useT();

  const steps: CoachStep[] = [
    { target: pencilRef, title: t.editCoachPencilTitle, body: t.editCoachPencilBody, placement: "auto" },
    { target: locationRef, title: t.editCoachLocationTitle, body: t.editCoachLocationBody, placement: "auto" },
    { target: downloadRef, title: t.saveImageCoachTitle, body: t.saveImageCoachBody, placement: "auto" },
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
