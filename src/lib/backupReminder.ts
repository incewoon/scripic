const KEY = "moara_backup_reminder_baseline_v1";

export function checkBackupReminder(currentCount: number): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) {
      localStorage.setItem(KEY, String(currentCount));
      return false;
    }
    const baseline = Number(raw) || 0;
    if (currentCount - baseline >= 10) {
      localStorage.setItem(KEY, String(currentCount));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
