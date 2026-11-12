import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cada micro-frontend é construído e implantado de forma independente (porta 5176).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5176, strictPort: true },
  preview: { port: 5176 },
});
