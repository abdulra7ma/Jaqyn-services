import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component tests run under jsdom with RTL. We mock @jaqyn/api at the module
// boundary (the network seam) so screens are tested against the hook contract,
// not a live backend — matching the package's adapter-as-boundary convention.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.{ts,tsx}"],
    css: false,
  },
});
