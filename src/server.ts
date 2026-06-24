// Re-export the TanStack Start server entry so the SSR build emits
// `dist/server/server.js`, which is what the preview-server-plugin
// resolves by default during prerender.
export { default } from "@tanstack/react-start/server-entry";
