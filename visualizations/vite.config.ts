/// <reference types="vitest/config" />

import { rmSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vitest/config";

// public/standalone_data/ holds ~16 MB of demo qlog captures. They are useful for
// dev/debug loads (`npm run dev` still serves them), but the embedded/published
// bundle must stay lean: everything under dist/ ships in the npm package
// (files: ["dist"]) and into every embedder deployment, while the app itself is
// well under 1 MB. Strip the demo data from the production build output.
function stripStandaloneData(): Plugin {
    return {
        name: "strip-standalone-data",
        apply: "build",
        closeBundle() {
            rmSync(fileURLToPath(new URL("./dist/standalone_data", import.meta.url)), { recursive: true, force: true });
        },
    };
}

export default defineConfig(({ mode }) => ({
    base: "./",
    plugins: [vue(), stripStandaloneData()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    build: {
        sourcemap: mode !== "production",
    },
    test: {
        environment: "node",
        include: [
            "tests/**/*.test.ts",
            "src/data/**/*.test.ts",
            "src/components/filemanager/**/*.test.ts",
        ],
    },
}));
