// Polling-based deep link consumer. On app boot we call the native plugin
// once to fetch any pending path left by a notification tap. If present,
// we navigate the TanStack router to it.
import { getPendingDeepLink } from "@/plugins/notification-permission";

type RouterLike = { navigate: (opts: { to: string }) => unknown } | undefined;

export async function consumePendingDeepLink(router: RouterLike): Promise<void> {
  if (!router) return;
  try {
    const path = await getPendingDeepLink();
    if (!path) return;
    router.navigate({ to: path });
  } catch {
    /* ignore */
  }
}
