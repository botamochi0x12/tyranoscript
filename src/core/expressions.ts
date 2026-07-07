import type { VariableScopes } from "./types";

const SF_STORAGE_KEY = "tyrano_modern_sf";

/** Create the game variable scopes, restoring persistent `sf` from localStorage. */
export function createScopes(): VariableScopes {
    let sf: Record<string, unknown> = {};
    try {
        const raw = globalThis.localStorage?.getItem(SF_STORAGE_KEY);
        if (raw) sf = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        // corrupted storage: start fresh
    }
    return { f: {}, sf, tf: {} };
}

export function persistSystemVariables(scopes: VariableScopes): void {
    try {
        globalThis.localStorage?.setItem(SF_STORAGE_KEY, JSON.stringify(scopes.sf));
    } catch {
        // storage unavailable (private mode etc.) — non-fatal
    }
}

/**
 * Evaluate a scenario expression with f/sf/tf/mp in scope.
 * Replaces the classic engine's raw eval(); still arbitrary JS by design
 * (scenario files are trusted first-party content), but scoped and catchable.
 */
export function evalExpression(
    exp: string,
    scopes: VariableScopes,
    extra: Record<string, unknown> = {},
): unknown {
    const names = ["f", "sf", "tf", "mp", ...Object.keys(extra)];
    const values = [scopes.f, scopes.sf, scopes.tf, scopes.mp ?? {}, ...Object.values(extra)];
    const fn = new Function(...names, `"use strict"; return (${exp});`);
    return fn(...values);
}

/** Run a multi-statement [iscript] block. Returns true when it ran cleanly. */
export function runScript(
    code: string,
    scopes: VariableScopes,
    extra: Record<string, unknown> = {},
): boolean {
    const names = ["f", "sf", "tf", "mp", ...Object.keys(extra)];
    const values = [scopes.f, scopes.sf, scopes.tf, scopes.mp ?? {}, ...Object.values(extra)];
    try {
        const fn = new Function(...names, code);
        fn(...values);
        return true;
    } catch (e) {
        console.warn("[tyrano] iscript block failed (likely legacy-only API):", e);
        return false;
    }
}

/**
 * Resolve a raw attribute value at execution time:
 *  - `&expr`  -> evaluated JS expression
 *  - `%name|default` -> macro parameter lookup (only inside macros)
 *  - anything else -> literal
 */
export function resolveAttrValue(raw: string, scopes: VariableScopes): string | undefined {
    if (raw.startsWith("&")) {
        try {
            const v = evalExpression(raw.slice(1), scopes);
            return v === undefined || v === null ? undefined : String(v);
        } catch (e) {
            console.warn(`[tyrano] failed to evaluate entity "${raw}":`, e);
            return undefined;
        }
    }
    if (raw.startsWith("%") && scopes.mp) {
        const [name = "", ...defaultParts] = raw.slice(1).split("|");
        const v = scopes.mp[name.trim()];
        if (v !== undefined && v !== null) return String(v);
        if (defaultParts.length > 0) return defaultParts.join("|");
        return undefined;
    }
    return raw;
}

/** Resolve every attribute of a tag against the current scopes. */
export function resolveAttrs(
    attrs: Record<string, string>,
    scopes: VariableScopes,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(attrs)) {
        if (key === "*") {
            // `*` forwards all current macro parameters (classic KAG behavior)
            if (scopes.mp) {
                for (const [k, v] of Object.entries(scopes.mp)) {
                    if (v !== undefined && v !== null) out[k] = String(v);
                }
            }
            continue;
        }
        const v = resolveAttrValue(raw, scopes);
        if (v !== undefined) out[key] = v;
    }
    return out;
}

export function parseBool(value: string | undefined, fallback = false): boolean {
    if (value === undefined) return fallback;
    return value === "true" || value === "1" || value === "yes";
}

export function parseNum(value: string | undefined, fallback = 0): number {
    if (value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** Convert classic `0xRRGGBB` color notation to CSS. */
export function toCssColor(value: string): string {
    if (/^0x[0-9a-fA-F]{6}$/.test(value)) return `#${value.slice(2)}`;
    return value;
}
