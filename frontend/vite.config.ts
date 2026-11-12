/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev:https` (mode "https"): a self-signed HTTPS dev server on the local network,
// so a phone can open it and use the microphone (browsers only allow it on secure pages).
export default defineConfig(({ mode }) => {
  const https = mode === "https";
  return {
    plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
    server: {
      port: 5173,
      host: https ? true : undefined,
      proxy: {
        "/api": "http://127.0.0.1:8000",
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
