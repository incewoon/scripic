import { type RefObject } from "react";
import { Coachmark, type CoachStep } from "@/components/Coachmark";
import { useT } from "@/lib/i18n";

const SEEN_KEY = "scripic_coach_create_seen";

export function shouldShowCreateUsage(): boolean {
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
  photoRef: RefObject<HTMLElement | null>;
  modeRef: RefObject<HTMLElement | null>;
  toneRef: RefObject<HTMLElement | null>;
  tagsRef: RefObject<HTMLElement | null>;
};

export function CreateUsageCoachmark({ open, onClose, photoRef, modeRef, toneRef, tagsRef }: Props) {
  const { t } = useT();
  const steps: CoachStep[] = [
    { target: photoRef, title: t.createCoachPhotosTitle, body: t.createCoachPhotosBody, placement: "auto" },
    { target: modeRef, title: t.createCoachModeTitle, body: t.createCoachModeBody, placement: "auto" },
    { target: toneRef, title: t.createCoachToneTitle, body: t.createCoachToneBody, placement: "auto" },
    { target: tagsRef, title: t.createCoachTagsTitle, body: t.createCoachTagsBody, placement: "auto" },
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
