import { parseScenario } from "./parser";
import type { EngineConfig, Scenario } from "./types";

/**
 * Asset + scenario loading. The classic data/ tree is served as the web root
 * (see vite.config.ts), so storages resolve to e.g. `bgimage/room.jpg`.
 */
export class Resources {
    private scenarioCache = new Map<string, Scenario>();
    constructor(private base: string = import.meta.env?.BASE_URL ?? "./") {}

    path(folder: string, storage: string): string {
        if (/^(https?:)?\/\//.test(storage) || storage.startsWith("data:")) return storage;
        return `${this.base}${folder}/${storage}`;
    }

    bgImage(storage: string): string {
        return this.path("bgimage", storage);
    }
    fgImage(storage: string): string {
        return this.path("fgimage", storage);
    }
    image(storage: string): string {
        return this.path("image", storage);
    }
    bgm(storage: string): string {
        return this.path("bgm", storage);
    }
    sound(storage: string): string {
        return this.path("sound", storage);
    }

    async loadScenario(storage: string): Promise<Scenario> {
        const name = storage.trim();
        const cached = this.scenarioCache.get(name);
        if (cached) return cached;
        const res = await fetch(this.path("scenario", name));
        if (!res.ok) throw new Error(`scenario not found: ${name} (${res.status})`);
        const text = await res.text();
        const scenario = parseScenario(name, text);
        this.scenarioCache.set(name, scenario);
        return scenario;
    }

    /**
     * Parse data/system/Config.tjs. The file is a KAG-era convention:
     * settings are `;key = value;` lines inside a JS-style comment soup.
     */
    async loadConfig(): Promise<EngineConfig> {
        const raw: Record<string, string> = {};
        try {
            const res = await fetch(this.path("system", "Config.tjs"));
            if (res.ok) {
                const text = await res.text();
                for (const line of text.split(/\r\n|\r|\n/)) {
                    const m = /^\s*;([A-Za-z0-9_.]+)\s*=\s*(.*?);?\s*$/.exec(line);
                    if (!m) continue;
                    raw[m[1]!] = (m[2] ?? "").replace(/^"(.*)"$/, "$1");
                }
            }
        } catch (e) {
            console.warn("[tyrano] Config.tjs could not be loaded, using defaults:", e);
        }
        const num = (key: string, fallback: number) => {
            const n = Number(raw[key]);
            return Number.isFinite(n) ? n : fallback;
        };
        return {
            scWidth: num("scWidth", 1280),
            scHeight: num("scHeight", 720),
            chSpeed: num("chSpeed", 30),
            autoSpeed: num("autoSpeed", 1300),
            defaultBgmVolume: num("defaultBgmVolume", 100),
            defaultSeVolume: num("defaultSeVolume", 100),
            title: raw["System.title"] ?? "TyranoScript",
            firstScenario: raw["firstScenario"] ?? "first.ks",
            raw,
        };
    }
}
