/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the page is served by Vite instead of nginx, so Vite plays nginx's
// role and proxies /ws to foxglove_bridge. Point it at a rover with
// ROVER_BRIDGE=ws://<rover-ip>:8765 npm run dev.
const bridge = process.env.ROVER_BRIDGE ?? "ws://127.0.0.1:8765";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5000,
        proxy: {
            "/ws": { target: bridge, ws: true, rewrite: () => "/" },
        },
    },
    test: {
        include: ["test/**/*.test.ts"],
        environment: "node",
    },
});
