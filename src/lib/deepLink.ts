// Polling-based deep link consumer. On app boot we call the native plugin
// once to fetch any pending path left by a notification tap. If present,
// we navigate the TanStack router to it.
import { getPendingDeepLink } from "@/plugins/notification-permission";
import { canCreateAlbumToday } from "@/lib/dailyLimit";

type RouterLike = {
  navigate: (opts: {
    to: string;
    search?: Record<string, unknown>;
    replace?: boolean;
  }) => unknown;
} | undefined;

/** 알림 등 딥링크 경로를 한도 검사 후 라우팅 */
export function navigateFromDeepLink(router: RouterLike, path: string): void {
  if (!router || !path) return;

  const normalized = path.trim();
  const isCreate =
    normalized === "/create" ||
    normalized.startsWith("/create?") ||
    normalized.startsWith("/create/");

  if (isCreate && !canCreateAlbumToday()) {
    // 한도 소진 → 업로드 화면 대신 메인 + 한도 다이얼로그
    router.navigate({
      to: "/",
      search: { showLimit: true },
      replace: true,
    });
    return;
  }

  router.navigate({ to: normalized });
}

export async function consumePendingDeepLink(router: RouterLike): Promise<void> {
  if (!router) return;
  try {
    const path = await getPendingDeepLink();
    if (!path) return;
    navigateFromDeepLink(router, path);
  } catch {
    /* ignore */
  }
}
