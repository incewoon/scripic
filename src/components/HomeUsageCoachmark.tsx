//HomeUsageCoachmark.tsx
import { type RefObject } from "react";
import { Coachmark, type CoachStep } from "@/components/Coachmark";
import { useT } from "@/lib/i18n";

const SEEN_KEY = "scripic_coach_home_seen";

export function shouldShowHomeCoach(): boolean {
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
  searchRef: RefObject<HTMLElement | null>;
  settingsRef: RefObject<HTMLElement | null>;
  sortRef: RefObject<HTMLElement | null>;
};

export function HomeUsageCoachmark({ open, onClose, searchRef, settingsRef, sortRef }: Props) {
  const { t } = useT();
  const steps: CoachStep[] = [
    { target: searchRef, title: t.homeCoachSearchTitle, body: t.homeCoachSearchBody, placement: "auto" },
    { target: settingsRef, title: t.homeCoachSettingsTitle, body: t.homeCoachSettingsBody, placement: "auto" },
    { target: sortRef, title: t.homeCoachSortTitle, body: t.homeCoachSortBody, placement: "auto" },
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
