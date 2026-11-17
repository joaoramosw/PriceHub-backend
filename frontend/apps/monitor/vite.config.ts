import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { PROXY_DE_DESENVOLVIMENTO } from "../../proxy-de-desenvolvimento";

// Monitor: outro micro-frontend, servido pelo gateway em /monitor/.
export default defineConfig({
  base: "/monitor/",
  plugins: [react(), tailwindcss()],
  server: { port: 5175, strictPort: true, proxy: PROXY_DE_DESENVOLVIMENTO },
  preview: { port: 5175 },
});
