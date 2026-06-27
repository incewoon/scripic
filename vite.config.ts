// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
// vite.config.ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

//import { writeFileSync, existsSync } from "node:fs";
//import { join } from "node:path";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    spa: {
      enabled: true,
//      prerender: {
//        enabled: false,   // ★ Nitro 크롤러를 거치지 않고 셸을 직접 씀
    },
  },
//  },
/* vite: {
    plugins: [
      {
        // The TanStack Start preview-server-plugin (used during prerender)
        // resolves the SSR entry as `<input-basename>.js` (default `server.js`),
        // but Nitro emits `dist/server/index.mjs`. Shim the expected filename
        // so prerender can import it.
        name: "lovable:ssr-server-js-shim",
        apply: "build",
        closeBundle: {
          order: "post",
          handler() {
            const dir = join(process.cwd(), "dist", "server");
            const target = join(dir, "server.js");
            const source = join(dir, "index.mjs");
            if (existsSync(source) && !existsSync(target)) {
              // Wrap the Cloudflare handler so prerender (which calls
              // `fetch(request)` with no env/ctx) doesn't crash on env.ASSETS.
              writeFileSync(
                target,
                `import handler from "./index.mjs";
const emptyEnv = {};
const emptyCtx = { waitUntil() {}, passThroughOnException() {} };
// The Cloudflare handler tries to assign helper properties (\`ip\`, \`runtime\`,
// \`waitUntil\`) directly onto the request object. Web \`Request\` instances have
// read-only accessors, so wrap them in a Proxy that allows arbitrary writes.
function wrapRequest(request) {
  const extras = {};
  return new Proxy(request, {
    get(target, prop, receiver) {
      if (prop in extras) return extras[prop];
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_target, prop, value) {
      extras[prop] = value;
      return true;
    },
    has(target, prop) {
      return prop in extras || prop in target;
    },
  });
}
export default {
  async fetch(request, env, ctx) {
    return handler.fetch(wrapRequest(request), env ?? emptyEnv, ctx ?? emptyCtx);
  },
};
`,
              );
              // Ensure `.js` is treated as ESM by Node's loader when
              // the preview-server-plugin imports it during prerender.
              const pkgPath = join(dir, "package.json");
              if (!existsSync(pkgPath)) {
                writeFileSync(pkgPath, `{ "type": "module" }\n`);
              }
            }
          },
        },
      },
    ],
  },
  */
});
