/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// The classic TyranoScript asset tree under data/ (scenario, bgimage, fgimage,
// image, bgm, sound, system) is served verbatim as the public root so that
// scenario files can keep referencing storages by bare file name.
export default defineConfig({
    base: "./",
    publicDir: "data",
    build: {
        outDir: "dist",
        target: "es2022",
    },
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
    },
});
