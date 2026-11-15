import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the Fastify server in development
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "ES2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split portal bundles so each portal only loads its own code
        manualChunks: (id) => {
          if (id.includes("portals/customer")) return "portal-customer";
          if (id.includes("portals/operations")) return "portal-operations";
          if (id.includes("portals/technician")) return "portal-technician";
          if (id.includes("portals/admin")) return "portal-admin";
          if (id.includes("node_modules/react")) return "vendor-react";
          if (id.includes("node_modules/@tanstack")) return "vendor-query";
          if (id.includes("node_modules/lucide")) return "vendor-icons";
          if (id.includes("node_modules/@radix-ui")) return "vendor-radix";
        },
      },
    },
  },
});
