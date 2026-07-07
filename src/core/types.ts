/** A parsed `[tag]` / `@tag` command. */
export interface TagCommand {
    kind: "tag";
    name: string;
    attrs: Record<string, string>;
    line: number;
}

/** A run of printable scenario text (single scenario line, tags split out). */
export interface TextCommand {
    kind: "text";
    text: string;
    line: number;
}

/** A `*label` jump target. */
export interface LabelCommand {
    kind: "label";
    name: string;
    line: number;
}

/** Raw JavaScript captured between [iscript] and [endscript]. */
export interface IScriptCommand {
    kind: "iscript";
    code: string;
    line: number;
}

export type Command = TagCommand | TextCommand | LabelCommand | IScriptCommand;

export interface Scenario {
    storage: string;
    commands: Command[];
    /** label name (without `*`) -> index into commands */
    labels: Map<string, number>;
}

/** Game variable scopes, mirroring the classic engine (f / sf / tf / mp). */
export interface VariableScopes {
    f: Record<string, unknown>;
    sf: Record<string, unknown>;
    tf: Record<string, unknown>;
    mp?: Record<string, unknown>;
}

export interface EngineConfig {
    scWidth: number;
    scHeight: number;
    chSpeed: number;
    autoSpeed: number;
    defaultBgmVolume: number;
    defaultSeVolume: number;
    title: string;
    firstScenario: string;
    raw: Record<string, string>;
}
