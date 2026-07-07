import { toCssColor } from "./expressions";

export interface ImageEntity {
    type: "image";
    src: string;
    name?: string;
    left: number;
    top: number;
    width?: number;
    height?: number;
    visible: boolean;
}

export interface PTextEntity {
    type: "ptext";
    name?: string;
    text: string;
    x: number;
    y: number;
    size?: number;
    color?: string;
    bold?: boolean;
    face?: string;
}

export type Entity = ImageEntity | PTextEntity;

export interface MessageLayerConfig {
    left: number;
    top: number;
    width: number;
    height: number;
    visible: boolean;
    margins: { top: number; left: number; right: number; bottom: number };
    frame?: string; // image path
    opacity: number; // 0..255 (classic convention)
    vertical: boolean;
    color: string;
}

export type MessageLayerPatch = Partial<Omit<MessageLayerConfig, "margins">> & {
    margins?: Partial<MessageLayerConfig["margins"]>;
};

export interface StageSnapshot {
    layers: Record<string, Entity[]>;
    messages: Record<string, MessageLayerConfig>;
    layerVisibility: Record<string, boolean>;
}

const GENERIC_LAYERS = ["base", "0", "1", "2"] as const;
const MESSAGE_LAYERS = ["message0", "message1"] as const;

/**
 * The visual stage: a fixed-resolution canvas of absolutely positioned DOM
 * layers, scaled to fit the browser window (replaces kag.layer.js + jQuery).
 *
 * Layer stack (bottom to top): base, 0..2, message0..1, fix, front buttons,
 * system overlays (save/load/backlog) and the menu button.
 */
export class Stage {
    readonly root: HTMLElement;
    readonly stageEl: HTMLElement;
    readonly fixEl: HTMLElement;
    readonly frontButtonsEl: HTMLElement;
    readonly overlayEl: HTMLElement;

    private fore = new Map<string, HTMLElement>();
    private back = new Map<string, HTMLElement>();
    private msgEls = new Map<string, { wrapper: HTMLElement; box: HTMLElement; frame: HTMLElement; inner: HTMLElement }>();

    /** Resolves a message-frame storage name to a URL; injected by the engine. */
    frameResolver: (storage: string) => string = (s) => s;

    /** Declarative mirror of layer contents, used for save/load. */
    private state: StageSnapshot = { layers: {}, messages: {}, layerVisibility: {} };
    private backState: Record<string, Entity[]> = {};

    private transitionDone: Promise<void> = Promise.resolve();

    constructor(
        container: HTMLElement,
        readonly width: number,
        readonly height: number,
    ) {
        this.root = container;
        this.root.classList.add("ty-viewport");
        this.stageEl = el("div", "ty-stage");
        this.stageEl.style.width = `${width}px`;
        this.stageEl.style.height = `${height}px`;
        this.root.appendChild(this.stageEl);

        let z = 0;
        for (const name of GENERIC_LAYERS) {
            const backEl = el("div", "ty-layer ty-layer-back");
            const foreEl = el("div", "ty-layer");
            backEl.style.zIndex = String(z++);
            foreEl.style.zIndex = String(z++);
            backEl.style.opacity = "0";
            this.stageEl.append(backEl, foreEl);
            this.back.set(name, backEl);
            this.fore.set(name, foreEl);
            this.state.layers[name] = [];
            this.backState[name] = [];
            this.state.layerVisibility[name] = true;
        }
        z = 100;
        for (const name of MESSAGE_LAYERS) {
            const wrapper = el("div", "ty-msg-wrapper");
            wrapper.style.zIndex = String(z++);
            const box = el("div", "ty-msg-box");
            const frame = el("div", "ty-msg-frame");
            const inner = el("div", "ty-msg-inner");
            box.append(frame, inner);
            wrapper.appendChild(box);
            wrapper.style.display = "none";
            this.stageEl.appendChild(wrapper);
            this.msgEls.set(name, { wrapper, box, frame, inner });
            this.state.messages[name] = defaultMessageConfig(width, height);
            this.state.layerVisibility[name] = false;
            this.applyMessageConfig(name);
        }
        this.fixEl = el("div", "ty-layer ty-fix");
        this.fixEl.style.zIndex = "150";
        this.frontButtonsEl = el("div", "ty-layer ty-front-buttons");
        this.frontButtonsEl.style.zIndex = "160";
        this.overlayEl = el("div", "ty-overlay-root");
        this.overlayEl.style.zIndex = "200";
        this.stageEl.append(this.fixEl, this.frontButtonsEl, this.overlayEl);
        this.state.layerVisibility["fix"] = true;

        const rescale = () => this.rescale();
        globalThis.addEventListener("resize", rescale);
        this.rescale();
    }

    private rescale(): void {
        const scale = Math.min(
            this.root.clientWidth / this.width,
            this.root.clientHeight / this.height,
        );
        this.stageEl.style.transform = `scale(${scale})`;
    }

    hasLayer(name: string): boolean {
        return this.fore.has(name) || this.msgEls.has(name) || name === "fix";
    }

    messageLayerNames(): string[] {
        return [...MESSAGE_LAYERS];
    }

    // ---- generic layers -------------------------------------------------

    private layerEl(layer: string, page: "fore" | "back"): HTMLElement | null {
        return (page === "fore" ? this.fore : this.back).get(layer) ?? null;
    }

    private entities(layer: string, page: "fore" | "back"): Entity[] {
        const store = page === "fore" ? this.state.layers : this.backState;
        return (store[layer] ??= []);
    }

    addImage(layer: string, page: "fore" | "back", entity: ImageEntity): HTMLElement | null {
        const parent = this.layerEl(layer, page);
        if (!parent) {
            console.warn(`[tyrano] unknown layer for image: ${layer}`);
            return null;
        }
        const img = new Image();
        img.className = "ty-image";
        img.src = entity.src;
        img.style.left = `${entity.left}px`;
        img.style.top = `${entity.top}px`;
        if (entity.width) img.style.width = `${entity.width}px`;
        if (entity.height) img.style.height = `${entity.height}px`;
        if (!entity.visible) img.style.visibility = "hidden";
        if (entity.name) img.dataset.name = entity.name;
        parent.appendChild(img);
        this.entities(layer, page).push(entity);
        return img;
    }

    addPText(layer: string, entity: PTextEntity): HTMLElement | null {
        // ptext on a message layer is positioned in stage coordinates,
        // rendered inside that layer's wrapper so layopt visibility applies.
        const msg = this.msgEls.get(layer);
        const parent = msg ? msg.wrapper : this.layerEl(layer, "fore");
        if (!parent) {
            console.warn(`[tyrano] unknown layer for ptext: ${layer}`);
            return null;
        }
        const div = el("div", "ty-ptext");
        div.style.left = `${entity.x}px`;
        div.style.top = `${entity.y}px`;
        if (entity.size) div.style.fontSize = `${entity.size}px`;
        if (entity.color) div.style.color = toCssColor(entity.color);
        if (entity.bold) div.style.fontWeight = "bold";
        if (entity.face) div.style.fontFamily = entity.face;
        if (entity.name) div.dataset.name = entity.name;
        div.innerHTML = entity.text;
        parent.appendChild(div);
        this.entities(layer, "fore").push(entity);
        return div;
    }

    /** Remove a named entity ([free name=...]). */
    free(layer: string, name: string): void {
        const msg = this.msgEls.get(layer);
        const parents = msg ? [msg.wrapper] : [this.layerEl(layer, "fore")];
        for (const parent of parents) {
            parent?.querySelectorAll(`[data-name="${cssEscape(name)}"]`).forEach((n) => n.remove());
        }
        const list = this.entities(layer, "fore");
        this.state.layers[layer] = list.filter((e) => e.name !== name);
    }

    /** Clear all images from a layer ([freeimage]). */
    freeImage(layer: string, page: "fore" | "back" = "fore"): void {
        const parent = this.layerEl(layer, page);
        if (!parent) return;
        parent.querySelectorAll(".ty-image").forEach((n) => n.remove());
        const store = page === "fore" ? this.state.layers : this.backState;
        store[layer] = (store[layer] ?? []).filter((e) => e.type !== "image");
    }

    findByName(name: string): HTMLElement | null {
        return this.stageEl.querySelector(`[data-name="${cssEscape(name)}"]`);
    }

    setLayerVisible(layer: string, visible: boolean): void {
        this.state.layerVisibility[layer] = visible;
        if (layer === "fix") {
            this.fixEl.style.display = visible ? "" : "none";
            return;
        }
        const msg = this.msgEls.get(layer);
        if (msg) {
            msg.wrapper.style.display = visible ? "" : "none";
            return;
        }
        const fore = this.layerEl(layer, "fore");
        if (fore) fore.style.display = visible ? "" : "none";
        else console.warn(`[tyrano] layopt: unknown layer ${layer}`);
    }

    /** [backlay]: copy fore contents into the back page (all generic layers). */
    backlay(targetLayer?: string): void {
        const layers = targetLayer ? [targetLayer] : [...GENERIC_LAYERS];
        for (const layer of layers) {
            const foreEl = this.layerEl(layer, "fore");
            const backEl = this.layerEl(layer, "back");
            if (!foreEl || !backEl) continue;
            backEl.replaceChildren(...[...foreEl.children].map((c) => c.cloneNode(true)));
            this.backState[layer] = structuredClone(this.state.layers[layer] ?? []);
            backEl.style.opacity = "0";
        }
    }

    /**
     * [trans]: cross-dissolve the back page over the fore page, then promote
     * back -> fore. Returns after the animation completes.
     */
    trans(layer: string, timeMs: number, method = "crossfade"): Promise<void> {
        const foreEl = this.layerEl(layer, "fore");
        const backEl = this.layerEl(layer, "back");
        if (!foreEl || !backEl) return Promise.resolve();

        const duration = Math.max(1, timeMs);
        let anim: Animation;
        if (method === "slide") {
            backEl.style.opacity = "1";
            anim = backEl.animate(
                [{ transform: `translateX(${this.width}px)` }, { transform: "translateX(0)" }],
                { duration, easing: "ease" },
            );
        } else {
            // crossfade and any unimplemented methods fall back to a fade
            anim = backEl.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration,
                easing: "linear",
                fill: "forwards",
            });
        }
        const done = anim.finished
            .catch(() => undefined)
            .then(() => {
                // promote back to fore
                foreEl.replaceChildren(...backEl.children);
                this.state.layers[layer] = this.backState[layer] ?? [];
                this.backState[layer] = [];
                anim.cancel();
                backEl.style.opacity = "0";
                backEl.style.transform = "";
                backEl.replaceChildren();
            });
        this.transitionDone = done;
        return done;
    }

    /** [wt]: resolves when the latest transition has finished. */
    waitTransition(): Promise<void> {
        return this.transitionDone;
    }

    /** [bg]: convenience background swap with fade on the base layer. */
    async setBackground(src: string, storage: string, timeMs: number, method = "crossfade"): Promise<void> {
        this.backlay("base");
        this.freeImage("base", "back");
        this.addImage("base", "back", {
            type: "image",
            src,
            name: "__bg__",
            left: 0,
            top: 0,
            width: this.width,
            height: this.height,
            visible: true,
        });
        await this.trans("base", timeMs, method);
    }

    // ---- message layers --------------------------------------------------

    messageConfig(layer: string): MessageLayerConfig | null {
        return this.state.messages[layer] ?? null;
    }

    messageParts(layer: string) {
        return this.msgEls.get(layer) ?? null;
    }

    updateMessageConfig(layer: string, patch: MessageLayerPatch): void {
        const cfg = this.state.messages[layer];
        if (!cfg) {
            console.warn(`[tyrano] position: unknown message layer ${layer}`);
            return;
        }
        Object.assign(cfg, patch, {
            margins: { ...cfg.margins, ...(patch.margins ?? {}) },
        });
        this.applyMessageConfig(layer);
    }

    private applyMessageConfig(layer: string): void {
        const cfg = this.state.messages[layer];
        const parts = this.msgEls.get(layer);
        if (!cfg || !parts) return;
        const { box, frame, inner } = parts;
        box.style.left = `${cfg.left}px`;
        box.style.top = `${cfg.top}px`;
        box.style.width = `${cfg.width}px`;
        box.style.height = `${cfg.height}px`;
        if (cfg.frame) {
            frame.style.backgroundImage = `url("${this.frameResolver(cfg.frame)}")`;
            frame.style.backgroundColor = "transparent";
        } else {
            frame.style.backgroundImage = "";
            frame.style.backgroundColor = cfg.color;
        }
        frame.style.opacity = String(Math.min(255, Math.max(0, cfg.opacity)) / 255);
        inner.style.inset = `${cfg.margins.top}px ${cfg.margins.right}px ${cfg.margins.bottom}px ${cfg.margins.left}px`;
        inner.classList.toggle("ty-vertical", cfg.vertical);
    }

    // ---- save/load -------------------------------------------------------

    snapshot(): StageSnapshot {
        return structuredClone(this.state);
    }

    restore(snap: StageSnapshot, resolveSrc: (e: Entity) => Entity): void {
        // wipe visuals
        for (const name of GENERIC_LAYERS) {
            this.layerEl(name, "fore")?.replaceChildren();
            this.layerEl(name, "back")?.replaceChildren();
        }
        for (const [, parts] of this.msgEls) {
            parts.wrapper.querySelectorAll(".ty-ptext").forEach((n) => n.remove());
            parts.inner.replaceChildren();
        }
        this.fixEl.replaceChildren();
        this.frontButtonsEl.replaceChildren();

        this.state = { layers: {}, messages: structuredClone(snap.messages), layerVisibility: {} };
        this.backState = {};
        for (const name of GENERIC_LAYERS) {
            this.state.layers[name] = [];
            this.backState[name] = [];
        }
        for (const [layer, entities] of Object.entries(snap.layers)) {
            for (const entity of entities) {
                const resolved = resolveSrc(structuredClone(entity));
                if (resolved.type === "image") this.addImage(layer, "fore", resolved);
                else this.addPText(layer, resolved);
            }
        }
        for (const layer of Object.keys(snap.messages)) this.applyMessageConfig(layer);
        for (const [layer, visible] of Object.entries(snap.layerVisibility)) {
            this.setLayerVisible(layer, visible);
        }
    }
}

export function defaultMessageConfig(stageWidth: number, stageHeight: number): MessageLayerConfig {
    return {
        left: 16,
        top: Math.round(stageHeight * 0.7),
        width: stageWidth - 32,
        height: Math.round(stageHeight * 0.28),
        visible: false,
        margins: { top: 20, left: 30, right: 30, bottom: 20 },
        opacity: 200,
        vertical: false,
        color: "black",
    };
}

function el(tagName: string, className: string): HTMLElement {
    const node = document.createElement(tagName);
    node.className = className;
    return node;
}

function cssEscape(value: string): string {
    return typeof globalThis.CSS?.escape === "function"
        ? CSS.escape(value)
        : value.replace(/["\\]/g, "\\$&");
}
