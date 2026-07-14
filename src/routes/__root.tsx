import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { applyThemeOnBoot } from "@/lib/theme";
import { requestPersistentStorage } from "@/lib/storage";
import { initGlobalNativeBack, exitApp } from "@/lib/nativeBack";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Capacitor } from "@capacitor/core";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Scripic" },
      { name: "description", content: "Capture the moments you never want to forget. Save them with photos and detailed conversation notes — kept safely on your phone, so your privacy stays protected." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Scripic" },
      { property: "og:description", content: "Capture the moments you never want to forget. Save them with photos and detailed conversation notes — kept safely on your phone, so your privacy stays protected." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Scripic" },
      { name: "twitter:description", content: "Capture the moments you never want to forget. Save them with photos and detailed conversation notes — kept safely on your phone, so your privacy stays protected." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2dfe9c12-a09e-4195-9cc7-a2ced21ae88c/id-preview-49d6fd9d--162dd268-7e6b-4995-b7e1-11331e7ad910.lovable.app-1777819462951.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2dfe9c12-a09e-4195-9cc7-a2ced21ae88c/id-preview-49d6fd9d--162dd268-7e6b-4995-b7e1-11331e7ad910.lovable.app-1777819462951.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Gowun+Batang&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [exitOpen, setExitOpen] = useState(false);
  useEffect(() => {
    applyThemeOnBoot();
    requestPersistentStorage();
    let cleanup: (() => void) | undefined;
    initGlobalNativeBack({
      onHomeExitRequest: () => setExitOpen(true),
    }).then((fn) => {
      cleanup = fn;
    });

    if (typeof localStorage !== "undefined") {
      const asked = localStorage.getItem("notif_permission_prompted_once");
      if (!asked && Capacitor.isNativePlatform()) {
        localStorage.setItem("notif_permission_prompted_once", "1");
        // 결과는 무시하고 그냥 한 번만 물어보기
        import("@/plugins/notification-permission").then((m) => {
          m.requestPostNotificationsPermission();
        });
      }
    }
    
    // One-shot: consume a pending deep link left by a notification tap.
    (window as any).__scripicHandleDeepLink = (path: string) => {
      const router = (window as any).__scripicRouter;
      if (router) router.navigate({ to: path });
    };
      
    import("@/lib/deepLink").then((m) => {
      const router = (window as any).__scripicRouter;
      m.consumePendingDeepLink(router);
    });

    
    return () => {
      delete (window as any).__scripicHandleDeepLink;
    };
  }, []);
  return (
    <>
      <Outlet />
      <Toaster position="top-center" richColors />
      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>앱을 종료할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              앱을 종료하면 현재 화면에서 나가게 됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExitOpen(false);
                void exitApp();
              }}
            >
              종료
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
