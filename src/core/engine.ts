import { AudioManager } from "./audio";
import { CharaManager, type CharaSnapshot } from "./chara";
import {
    createScopes,
    evalExpression,
    persistSystemVariables,
    resolveAttrs,
    runScript,
} from "./expressions";
import { Interpreter, type ExecHost } from "./interpreter";
import { MessageWindow, type FontStyle } from "./message";
import { Resources } from "./resources";
import { Stage, type Entity, type StageSnapshot } from "./stage";
import { tagHandlers } from "./tags";
import type { EngineConfig, Scenario, TagCommand, VariableScopes } from "./types";
import { Overlays } from "./ui/overlays";

export interface SaveData {
    date: string;
    title: string;
    savePoint: { storage: string; index: number };
    f: Record<string, unknown>;
    stage: StageSnapshot;
    charas: CharaSnapshot;
    message: {
        currentLayer: string;
        speed: number;
        defaultFont: FontStyle;
        font: FontStyle;
        namePText: string | null;
    };
    bgm: { storage: string; loop: boolean } | null;
    fixButtons: Array<Record<string, string>>;
    menuButtonVisible: boolean;
}

const SAVE_KEY = "tyrano_modern_saves";
const QUICK_SLOT = "quick";

/**
 * Engine facade: wires stage, message window, characters, audio and the
 * interpreter together, dispatches tags and owns the system UI overlays.
 */
export class Engine implements ExecHost {
    readonly scopes: VariableScopes = createScopes();
    readonly res: Resources;
    readonly stage: Stage;
    readonly message: MessageWindow;
    readonly charas: CharaManager;
    readonly audio = new AudioManager();
    readonly interpreter: Interpreter;
    readonly overlays: Overlays;
    readonly history: Array<{ name: string; text: string }> = [];

    /** [ruby text=x]: annotate the first character of the next text run. */
    pendingRuby: string | null = null;
    /** fix-layer button definitions, replayed on load ([button role=...]). */
    fixButtons: Array<Record<string, string>> = [];
    /** [link target=...] ... [endlink] capture state. */
    pendingLink: { target?: string; storage?: string } | null = null;

    private menuButton: HTMLElement;
    private windowHidden = false;

    constructor(
        container: HTMLElement,
        readonly config: EngineConfig,
    ) {
        this.res = new Resources();
        this.stage = new Stage(container, config.scWidth, config.scHeight);
        this.stage.frameResolver = (storage) => this.res.image(storage);
        this.message = new MessageWindow(this.stage, config.chSpeed);
        this.message.autoSpeed = config.autoSpeed;
        this.charas = new CharaManager(this.stage, this.res);
        this.interpreter = new Interpreter(this);
        this.overlays = new Overlays(this);
        this.audio.setBgmVolume(config.defaultBgmVolume);
        this.audio.setSeVolume(config.defaultSeVolume);
        document.title = config.title;

        this.menuButton = document.createElement("button");
        this.menuButton.className = "ty-menu-button";
        this.menuButton.textContent = "MENU";
        this.menuButton.style.display = "none";
        this.menuButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.overlays.openMenu();
        });
        this.stage.stageEl.appendChild(this.menuButton);

        this.stage.stageEl.addEventListener("click", () => this.onAdvanceInput());
        globalThis.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this.onAdvanceInput();
            } else if (e.key === "Escape") {
                if (!this.overlays.closeTop()) this.overlays.openMenu();
            }
        });
    }

    async start(): Promise<void> {
        await this.interpreter.start(this.config.firstScenario);
    }

    private onAdvanceInput(): void {
        if (this.overlays.isOpen) return;
        if (this.windowHidden) {
            this.setWindowHidden(false);
            return;
        }
        if (this.message.isAutoMode) this.message.setAutoMode(false);
        this.message.onClick();
    }

    setWindowHidden(hidden: boolean): void {
        this.windowHidden = hidden;
        for (const layer of this.stage.messageLayerNames()) {
            const parts = this.stage.messageParts(layer);
            if (parts) parts.wrapper.style.opacity = hidden ? "0" : "";
        }
    }

    setMenuButtonVisible(visible: boolean): void {
        this.menuButton.style.display = visible ? "" : "none";
    }

    /** Skip-aware timer wait. */
    wait(ms: number): Promise<void> {
        const t = this.message.isSkipping ? Math.min(ms, 50) : ms;
        return new Promise((r) => setTimeout(r, t));
    }

    // ---- ExecHost ---------------------------------------------------------

    loadScenario(storage: string): Promise<Scenario> {
        return this.res.loadScenario(storage);
    }

    async executeTag(cmd: TagCommand): Promise<void | "stop"> {
        const handler = tagHandlers[cmd.name];
        const attrs = resolveAttrs(cmd.attrs, this.scopes);
        if (handler) return handler(this, attrs);
        if (this.interpreter.invokeMacro(cmd.name, attrs)) return;
        console.warn(`[tyrano] unsupported tag skipped: [${cmd.name}] (line ${cmd.line})`);
    }

    async executeText(text: string, _line: number): Promise<void> {
        if (this.pendingLink) {
            this.writeLinkText(text);
            return;
        }
        this.appendHistory(text);
        if (this.pendingRuby) {
            const ruby = this.pendingRuby;
            this.pendingRuby = null;
            const chars = [...text];
            await this.message.writeRuby(chars[0] ?? "", ruby);
            const rest = chars.slice(1).join("");
            if (rest !== "") await this.message.write(rest);
            return;
        }
        await this.message.write(text);
    }

    runIScript(code: string): void {
        runScript(code, this.scopes, {
            TG: this.legacyTGStub(),
            engine: this,
        });
    }

    // ---- text helpers -----------------------------------------------------

    private appendHistory(text: string): void {
        const name = this.currentSpeaker;
        const last = this.history[this.history.length - 1];
        if (last && last.name === name && this.history.length > 0 && !this.historyBreak) {
            last.text += text;
        } else {
            this.history.push({ name, text });
            this.historyBreak = false;
        }
        if (this.history.length > 300) this.history.shift();
    }
    private historyBreak = false;
    currentSpeaker = "";

    /** Called on [p]/[cm] so the backlog groups text by page. */
    markHistoryBreak(): void {
        this.historyBreak = true;
    }

    private writeLinkText(text: string): void {
        const link = this.pendingLink!;
        const parts = this.stage.messageParts(this.message.currentLayer);
        if (!parts) return;
        const span = document.createElement("span");
        span.className = "ty-link";
        span.textContent = text;
        span.addEventListener("click", (e) => {
            e.stopPropagation();
            this.pendingLink = null;
            void this.interpreter.jump(link.storage, link.target);
        });
        parts.inner.appendChild(span);
    }

    /** Set the speaker name area from a #line / [chara_ptext]. */
    setSpeaker(rawName: string): void {
        if (rawName === "") {
            this.currentSpeaker = "";
            this.message.setSpeakerName("");
            return;
        }
        const jname = this.charas.jname(rawName) ?? rawName;
        this.currentSpeaker = jname;
        this.message.setSpeakerName(jname);
    }

    // ---- role buttons / system actions -------------------------------------

    async handleRole(role: string, attrs: Record<string, string>): Promise<void | "stop"> {
        switch (role) {
            case "save":
                this.overlays.openSaveLoad("save");
                return;
            case "load":
                this.overlays.openSaveLoad("load");
                return;
            case "quicksave":
                this.saveToSlot(QUICK_SLOT);
                return;
            case "quickload":
                await this.loadFromSlot(QUICK_SLOT);
                return;
            case "auto":
                this.message.setAutoMode(!this.message.isAutoMode);
                return;
            case "skip":
                this.message.setSkipMode(!this.message.isSkipping);
                return;
            case "backlog":
                this.overlays.openBacklog();
                return;
            case "fullscreen":
                if (document.fullscreenElement) void document.exitFullscreen();
                else void this.stage.root.requestFullscreen?.();
                return;
            case "window":
                this.setWindowHidden(true);
                return;
            case "title":
                await this.returnToTitle();
                return;
            case "menu":
                this.overlays.openMenu();
                return;
            case "sleepgame":
                // Approximation: the classic engine suspends the current game
                // and resumes on [awakegame]; we jump one-way instead.
                console.warn("[tyrano] role=sleepgame is approximated as a jump");
                if (attrs.storage || attrs.target) {
                    await this.interpreter.jump(attrs.storage, attrs.target);
                }
                return;
            default:
                console.warn(`[tyrano] unsupported button role: ${role}`);
        }
    }

    async returnToTitle(): Promise<void> {
        this.resetForJump();
        this.stage.fixEl.replaceChildren();
        this.fixButtons = [];
        this.charas.hideAll();
        this.audio.stopBgm(300);
        this.message.clear(true);
        for (const layer of this.stage.messageLayerNames()) this.stage.setLayerVisible(layer, false);
        this.setMenuButtonVisible(false);
        await this.interpreter.jump("title.ks");
    }

    /** Clear click-once UI (front buttons) — used by jumps triggered from buttons. */
    resetForJump(): void {
        this.stage.frontButtonsEl.replaceChildren();
    }

    // ---- save / load -------------------------------------------------------

    private readSlots(): Record<string, SaveData> {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            return raw ? (JSON.parse(raw) as Record<string, SaveData>) : {};
        } catch {
            return {};
        }
    }

    private writeSlots(slots: Record<string, SaveData>): void {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(slots));
        } catch (e) {
            console.warn("[tyrano] failed to persist save data:", e);
        }
    }

    getSaveSlots(): Record<string, SaveData> {
        return this.readSlots();
    }

    saveToSlot(slot: string): boolean {
        const savePoint = this.interpreter.lastSavePoint;
        if (!savePoint) {
            console.warn("[tyrano] nothing to save yet");
            return false;
        }
        const lastText = this.history[this.history.length - 1];
        const data: SaveData = {
            date: new Date().toLocaleString(),
            title: (lastText ? lastText.text : "").slice(0, 40),
            savePoint,
            f: structuredClone(this.scopes.f) as Record<string, unknown>,
            stage: this.stage.snapshot(),
            charas: this.charas.snapshot(),
            message: {
                currentLayer: this.message.currentLayer,
                speed: this.message.speed,
                defaultFont: { ...this.message.defaultFont },
                font: { ...this.message.font },
                namePText: this.message.namePText,
            },
            bgm: this.audio.currentBgm ? { ...this.audio.currentBgm } : null,
            fixButtons: structuredClone(this.fixButtons),
            menuButtonVisible: this.menuButton.style.display !== "none",
        };
        const slots = this.readSlots();
        slots[slot] = data;
        this.writeSlots(slots);
        persistSystemVariables(this.scopes);
        return true;
    }

    async loadFromSlot(slot: string): Promise<boolean> {
        const data = this.readSlots()[slot];
        if (!data) return false;
        this.interpreter.stop();
        this.overlays.closeAll();

        this.scopes.f = structuredClone(data.f);
        this.scopes.tf = {};
        this.stage.restore(data.stage, (e: Entity) => e);
        await this.charas.restore(data.charas);
        this.message.currentLayer = data.message.currentLayer;
        this.message.speed = data.message.speed;
        this.message.defaultFont = { ...data.message.defaultFont };
        this.message.font = { ...data.message.font };
        this.message.namePText = data.message.namePText;
        this.message.clear(true);
        this.history.length = 0;
        this.fixButtons = [];
        for (const attrs of data.fixButtons ?? []) {
            void tagHandlers.button?.(this, attrs);
        }
        this.setMenuButtonVisible(data.menuButtonVisible ?? true);
        if (data.bgm) {
            this.audio.playBgm(this.res.bgm(data.bgm.storage), data.bgm.storage, {
                loop: data.bgm.loop,
                fadeMs: 300,
            });
        } else {
            this.audio.stopBgm(0);
        }
        await this.interpreter.resume(data.savePoint.storage, data.savePoint.index);
        return true;
    }

    // ---- legacy compat ------------------------------------------------------

    /**
     * Minimal stand-in for the legacy global `TG` object so that first-party
     * [iscript] blocks written for the classic engine degrade gracefully.
     */
    private legacyTGStub(): Record<string, unknown> {
        const engine = this;
        return {
            config: { ...this.config.raw },
            stat: {},
            menu: {
                getSaveData: () => ({ data: Object.values(engine.readSlots()) }),
                doSave: (index: number) => engine.saveToSlot(String(index)),
                loadGame: (index: number) => void engine.loadFromSlot(String(index)),
            },
        };
    }
}
