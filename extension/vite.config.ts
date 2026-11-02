import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// public/manifest.json is copied to dist/ as-is.
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { popup: "popup.html" } } },
});
