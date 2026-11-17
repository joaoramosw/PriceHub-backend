import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { PROXY_DE_DESENVOLVIMENTO } from "../../proxy-de-desenvolvimento";

// Comparador: servido na raiz do gateway (/, /medicamento/{id}, /parceiras).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy: PROXY_DE_DESENVOLVIMENTO },
  preview: { port: 5173 },
});
