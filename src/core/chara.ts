import type { Resources } from "./resources";
import type { Stage } from "./stage";

interface CharaDef {
    storage: string; // default face storage (fgimage/...)
    jname: string;
    faces: Record<string, string>;
}

interface ShownChara {
    name: string;
    face: string;
    el: HTMLImageElement;
}

export interface CharaSnapshot {
    defs: Record<string, CharaDef>;
    shown: Array<{ name: string; face: string }>;
}

const CHARA_LAYER_Z = 50;
const FADE_MS = 400;

/**
 * Character management: definition registry, show/mod/hide with fades and
 * the classic even-horizontal auto-arrangement (replaces kag.tag_ext chara_*).
 */
export class CharaManager {
    private defs = new Map<string, CharaDef>();
    private shown: ShownChara[] = [];
    private layerEl: HTMLElement;

    constructor(
        private stage: Stage,
        private res: Resources,
    ) {
        this.layerEl = document.createElement("div");
        this.layerEl.className = "ty-layer ty-chara-layer";
        this.layerEl.style.zIndex = String(CHARA_LAYER_Z);
        stage.stageEl.appendChild(this.layerEl);
    }

    define(name: string, storage: string, jname?: string): void {
        this.defs.set(name, { storage, jname: jname ?? name, faces: {} });
    }

    defineFace(name: string, face: string, storage: string): void {
        const def = this.defs.get(name);
        if (!def) {
            console.warn(`[tyrano] chara_face: unknown chara ${name}`);
            return;
        }
        def.faces[face] = storage;
    }

    jname(name: string): string | null {
        return this.defs.get(name)?.jname ?? null;
    }

    private faceStorage(def: CharaDef, face: string): string {
        return face === "default" ? def.storage : (def.faces[face] ?? def.storage);
    }

    async show(name: string, face = "default", timeMs = FADE_MS): Promise<void> {
        const def = this.defs.get(name);
        if (!def) {
            console.warn(`[tyrano] chara_show: unknown chara ${name}`);
            return;
        }
        if (this.shown.some((c) => c.name === name)) {
            await this.mod(name, face, timeMs);
            return;
        }
        const img = new Image();
        img.className = "ty-chara";
        img.dataset.name = name;
        img.src = this.res.fgImage(this.faceStorage(def, face));
        img.style.opacity = "0";
        this.layerEl.appendChild(img);
        try {
            await img.decode();
        } catch {
            // missing image: keep the element so layout stays consistent
        }
        this.shown.push({ name, face, el: img });
        this.arrange(timeMs);
        await animate(img, [{ opacity: 0 }, { opacity: 1 }], timeMs);
        img.style.opacity = "1";
    }

    async mod(name: string, face: string, timeMs = FADE_MS): Promise<void> {
        const def = this.defs.get(name);
        const chara = this.shown.find((c) => c.name === name);
        if (!def || !chara) {
            console.warn(`[tyrano] chara_mod: chara not shown: ${name}`);
            return;
        }
        chara.face = face;
        const nextSrc = this.res.fgImage(this.faceStorage(def, face));
        if (chara.el.src.endsWith(nextSrc)) return;
        await animate(chara.el, [{ opacity: 1 }, { opacity: 0.4 }], timeMs / 2);
        chara.el.src = nextSrc;
        try {
            await chara.el.decode();
        } catch {
            /* ignore */
        }
        await animate(chara.el, [{ opacity: 0.4 }, { opacity: 1 }], timeMs / 2);
        chara.el.style.opacity = "1";
    }

    async hide(name: string, timeMs = FADE_MS): Promise<void> {
        const idx = this.shown.findIndex((c) => c.name === name);
        if (idx === -1) return;
        const [chara] = this.shown.splice(idx, 1);
        await animate(chara!.el, [{ opacity: 1 }, { opacity: 0 }], timeMs);
        chara!.el.remove();
        this.arrange(timeMs);
    }

    hideAll(): void {
        this.shown = [];
        this.layerEl.replaceChildren();
    }

    /** Evenly distribute the shown characters along the bottom of the stage. */
    private arrange(timeMs: number): void {
        const n = this.shown.length;
        this.shown.forEach((chara, i) => {
            const w = chara.el.naturalWidth || 300;
            const left = Math.round((this.stage.width * (i + 1)) / (n + 1) - w / 2);
            const current = parseFloat(chara.el.style.left || "NaN");
            chara.el.style.bottom = "0px";
            if (Number.isNaN(current)) {
                chara.el.style.left = `${left}px`;
            } else if (current !== left) {
                animate(chara.el, [{ left: `${current}px` }, { left: `${left}px` }], timeMs).then(
                    () => {
                        chara.el.style.left = `${left}px`;
                    },
                );
                chara.el.style.left = `${left}px`;
            }
        });
    }

    snapshot(): CharaSnapshot {
        return {
            defs: Object.fromEntries([...this.defs].map(([k, v]) => [k, structuredClone(v)])),
            shown: this.shown.map((c) => ({ name: c.name, face: c.face })),
        };
    }

    async restore(snap: CharaSnapshot): Promise<void> {
        this.hideAll();
        this.defs = new Map(Object.entries(snap.defs).map(([k, v]) => [k, structuredClone(v)]));
        for (const { name, face } of snap.shown) {
            await this.show(name, face, 0);
        }
    }
}

function animate(el: HTMLElement, keyframes: Keyframe[], durationMs: number): Promise<void> {
    if (durationMs <= 0 || typeof el.animate !== "function") return Promise.resolve();
    return el
        .animate(keyframes, { duration: durationMs, easing: "ease", fill: "forwards" })
        .finished.catch(() => undefined)
        .then(() => undefined);
}
