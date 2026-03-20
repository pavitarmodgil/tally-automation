import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: "all",
    proxy: {
      "/api":      "http://localhost:5000",
      "/whatsapp": "http://localhost:5000",
    },
  },
});
