import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { applyThemeOnBoot } from "@/lib/theme";

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
      { title: "Moara" },
      { name: "description", content: "Capture the moments you never want to forget. Save them with photos and detailed conversation notes — kept safely on your phone, so your privacy stays protected." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Moara" },
      { property: "og:description", content: "Capture the moments you never want to forget. Save them with photos and detailed conversation notes — kept safely on your phone, so your privacy stays protected." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Moara" },
      { name: "twitter:description", content: "Capture the moments you never want to forget. Save them with photos and detailed conversation notes — kept safely on your phone, so your privacy stays protected." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2dfe9c12-a09e-4195-9cc7-a2ced21ae88c/id-preview-49d6fd9d--162dd268-7e6b-4995-b7e1-11331e7ad910.lovable.app-1777819462951.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2dfe9c12-a09e-4195-9cc7-a2ced21ae88c/id-preview-49d6fd9d--162dd268-7e6b-4995-b7e1-11331e7ad910.lovable.app-1777819462951.png" },
    ],
    links: [
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
  useEffect(() => {
    applyThemeOnBoot();
  }, []);
  return (
    <>
      <Outlet />
      <Toaster position="top-center" richColors />
    </>
  );
}
