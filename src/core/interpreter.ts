import { evalExpression } from "./expressions";
import type { Command, Scenario, TagCommand, VariableScopes } from "./types";

export interface MacroDef {
    scenario: Scenario;
    start: number; // index of the first command inside the macro
    end: number; // index of the [endmacro] command
}

interface Frame {
    type: "call" | "macro";
    returnScenario: Scenario;
    returnIndex: number;
    mp?: Record<string, unknown>;
}

/** What the interpreter needs from the engine to execute commands. */
export interface ExecHost {
    scopes: VariableScopes;
    loadScenario(storage: string): Promise<Scenario>;
    executeTag(cmd: TagCommand): Promise<void | "stop">;
    executeText(text: string, line: number): Promise<void>;
    runIScript(code: string): void;
}

export interface SavePoint {
    storage: string;
    index: number;
}

/**
 * The scenario interpreter: program counter, call/macro stack, macro
 * registry and if/elsif/else flow (replaces the core of kag.js + kag.parser.js).
 */
export class Interpreter {
    scenario: Scenario | null = null;
    index = 0;
    stopped = true;
    private looping = false;
    private frames: Frame[] = [];
    private ifStack: Array<{ taken: boolean }> = [];
    readonly macros = new Map<string, MacroDef>();
    lastSavePoint: SavePoint | null = null;
    /** bumped by jump/load to invalidate an in-flight run loop */
    private generation = 0;

    constructor(private host: ExecHost) {}

    get inMacro(): boolean {
        return this.frames.some((f) => f.type === "macro");
    }

    async start(storage: string, target?: string): Promise<void> {
        await this.jump(storage, target);
    }

    /** Jump to a storage/label and (re)enter the run loop. */
    async jump(storage?: string, target?: string): Promise<void> {
        this.generation++;
        if (storage && storage.trim() !== "") {
            this.scenario = await this.host.loadScenario(storage.trim());
            this.index = 0;
        }
        if (!this.scenario) throw new Error("jump before any scenario is loaded");
        if (target && target.trim() !== "") {
            const label = target.trim().replace(/^\*/, "");
            const idx = this.scenario.labels.get(label);
            if (idx === undefined) {
                console.warn(`[tyrano] label not found: *${label} in ${this.scenario.storage}`);
            } else {
                this.index = idx;
            }
        }
        this.ifStack = [];
        this.stopped = false;
        void this.run();
    }

    /** Resume at an exact command index (used by save/load). */
    async resume(storage: string, index: number): Promise<void> {
        this.generation++;
        this.frames = [];
        this.ifStack = [];
        this.syncMp();
        this.scenario = await this.host.loadScenario(storage);
        this.index = Math.min(Math.max(0, index), this.scenario.commands.length);
        this.stopped = false;
        void this.run();
    }

    async call(storage: string | undefined, target: string | undefined): Promise<void> {
        if (!this.scenario) return;
        this.frames.push({
            type: "call",
            returnScenario: this.scenario,
            returnIndex: this.index,
        });
        await this.jumpWithinLoop(storage, target);
    }

    /** [return]: pop to the most recent [call]. */
    returnFromCall(): void {
        while (this.frames.length > 0) {
            const frame = this.frames.pop()!;
            if (frame.type === "call") {
                this.scenario = frame.returnScenario;
                this.index = frame.returnIndex;
                this.syncMp();
                return;
            }
        }
        console.warn("[tyrano] [return] without a matching [call]");
        this.stopped = true;
    }

    clearStack(): void {
        this.frames = [];
        this.syncMp();
    }

    stop(): void {
        this.stopped = true;
    }

    /** Like jump() but used from inside the run loop (does not respawn it). */
    async jumpWithinLoop(storage?: string, target?: string): Promise<void> {
        if (storage && storage.trim() !== "") {
            this.scenario = await this.host.loadScenario(storage.trim());
            this.index = 0;
        }
        if (target && target.trim() !== "") {
            const label = target.trim().replace(/^\*/, "");
            const idx = this.scenario?.labels.get(label);
            if (idx === undefined) {
                console.warn(`[tyrano] label not found: *${label}`);
            } else {
                this.index = idx;
            }
        } else if (storage) {
            this.index = 0;
        }
        this.ifStack = [];
    }

    async run(): Promise<void> {
        if (this.looping) return;
        this.looping = true;
        const myGeneration = this.generation;
        try {
            while (!this.stopped && this.generation === myGeneration) {
                const scenario = this.scenario;
                if (!scenario) break;
                const cmd: Command | undefined = scenario.commands[this.index];
                if (cmd === undefined) {
                    // End of file: leave a macro/call frame, otherwise stop.
                    if (this.frames.length > 0) {
                        const frame = this.frames.pop()!;
                        this.scenario = frame.returnScenario;
                        this.index = frame.returnIndex;
                        this.syncMp();
                        continue;
                    }
                    this.stopped = true;
                    break;
                }
                this.index++;
                await this.execute(cmd);
            }
        } finally {
            this.looping = false;
        }
        // A jump() may have raced with the loop; make sure someone keeps running.
        if (!this.stopped && this.generation !== myGeneration) void this.run();
    }

    private async execute(cmd: Command): Promise<void> {
        switch (cmd.kind) {
            case "label":
                return;
            case "text":
                if (!this.inMacro && this.scenario) {
                    this.lastSavePoint = { storage: this.scenario.storage, index: this.index - 1 };
                }
                await this.host.executeText(cmd.text, cmd.line);
                return;
            case "iscript":
                this.host.runIScript(cmd.code);
                return;
            case "tag":
                await this.executeTagCommand(cmd);
                return;
        }
    }

    private async executeTagCommand(cmd: TagCommand): Promise<void> {
        switch (cmd.name) {
            case "macro":
                this.defineMacroHere(cmd);
                return;
            case "endmacro":
                this.popMacroFrame();
                return;
            case "if":
            case "elsif":
            case "else":
            case "endif":
                this.handleBranch(cmd);
                return;
            default:
                break;
        }
        const result = await this.host.executeTag(cmd);
        if (result === "stop") this.stopped = true;
    }

    /** Invoke a user-defined macro (called by the engine for unknown tags). */
    invokeMacro(name: string, attrs: Record<string, string>): boolean {
        const def = this.macros.get(name);
        if (!def || !this.scenario) return false;
        this.frames.push({
            type: "macro",
            returnScenario: this.scenario,
            returnIndex: this.index,
            mp: { ...attrs },
        });
        this.scenario = def.scenario;
        this.index = def.start;
        this.syncMp();
        return true;
    }

    private popMacroFrame(): void {
        for (let i = this.frames.length - 1; i >= 0; i--) {
            if (this.frames[i]!.type === "macro") {
                const frame = this.frames[i]!;
                this.frames.length = i;
                this.scenario = frame.returnScenario;
                this.index = frame.returnIndex;
                this.syncMp();
                return;
            }
        }
        console.warn("[tyrano] [endmacro] outside a macro invocation");
    }

    private syncMp(): void {
        for (let i = this.frames.length - 1; i >= 0; i--) {
            const frame = this.frames[i]!;
            if (frame.type === "macro") {
                this.host.scopes.mp = frame.mp;
                return;
            }
        }
        this.host.scopes.mp = undefined;
    }

    /** [macro name=...]: register the body and skip past [endmacro]. */
    private defineMacroHere(cmd: TagCommand): void {
        const scenario = this.scenario;
        if (!scenario) return;
        const name = (cmd.attrs.name ?? "").toLowerCase();
        const start = this.index; // first command inside the macro
        let depth = 0;
        for (let i = this.index; i < scenario.commands.length; i++) {
            const c = scenario.commands[i]!;
            if (c.kind !== "tag") continue;
            if (c.name === "macro") depth++;
            else if (c.name === "endmacro") {
                if (depth === 0) {
                    if (name !== "") this.macros.set(name, { scenario, start, end: i });
                    this.index = i + 1;
                    return;
                }
                depth--;
            }
        }
        console.warn(`[tyrano] [macro name=${name}] without [endmacro]`);
        this.index = scenario.commands.length;
    }

    // ---- if / elsif / else / endif ----------------------------------------

    private handleBranch(cmd: TagCommand): void {
        switch (cmd.name) {
            case "if": {
                const ok = this.evalCondition(cmd.attrs.exp);
                this.ifStack.push({ taken: ok });
                if (!ok) this.skipToNextBranch();
                return;
            }
            case "elsif": {
                const top = this.ifStack[this.ifStack.length - 1];
                if (!top) return;
                if (top.taken) {
                    this.skipToEndif();
                    return;
                }
                const ok = this.evalCondition(cmd.attrs.exp);
                top.taken = ok;
                if (!ok) this.skipToNextBranch();
                return;
            }
            case "else": {
                const top = this.ifStack[this.ifStack.length - 1];
                if (!top) return;
                if (top.taken) this.skipToEndif();
                else top.taken = true;
                return;
            }
            case "endif":
                this.ifStack.pop();
                return;
        }
    }

    private evalCondition(exp: string | undefined): boolean {
        if (!exp) return false;
        try {
            return Boolean(evalExpression(exp, this.host.scopes));
        } catch (e) {
            console.warn(`[tyrano] [if] condition failed: ${exp}`, e);
            return false;
        }
    }

    /** Move the pc to the next elsif/else/endif at the current nesting level. */
    private skipToNextBranch(): void {
        const scenario = this.scenario;
        if (!scenario) return;
        let depth = 0;
        for (let i = this.index; i < scenario.commands.length; i++) {
            const c = scenario.commands[i]!;
            if (c.kind !== "tag") continue;
            if (c.name === "if") depth++;
            else if (c.name === "endif") {
                if (depth === 0) {
                    this.index = i; // let handleBranch pop it
                    return;
                }
                depth--;
            } else if ((c.name === "elsif" || c.name === "else") && depth === 0) {
                this.index = i;
                return;
            }
        }
        this.index = scenario.commands.length;
    }

    private skipToEndif(): void {
        const scenario = this.scenario;
        if (!scenario) return;
        let depth = 0;
        for (let i = this.index; i < scenario.commands.length; i++) {
            const c = scenario.commands[i]!;
            if (c.kind !== "tag") continue;
            if (c.name === "if") depth++;
            else if (c.name === "endif") {
                if (depth === 0) {
                    this.index = i;
                    return;
                }
                depth--;
            }
        }
        this.index = scenario.commands.length;
    }
}
