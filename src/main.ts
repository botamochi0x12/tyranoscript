import { Engine } from "./core/engine";
import { Resources } from "./core/resources";
import "./styles.css";

async function boot(): Promise<void> {
    const container = document.getElementById("app");
    if (!container) throw new Error("#app not found");
    const config = await new Resources().loadConfig();
    const engine = new Engine(container, config);
    // Expose for debugging from the browser console.
    (globalThis as Record<string, unknown>).tyrano = engine;
    await engine.start();
}

void boot();
