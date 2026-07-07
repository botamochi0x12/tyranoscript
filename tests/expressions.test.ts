import { describe, expect, it } from "vitest";
import {
    evalExpression,
    parseBool,
    parseNum,
    resolveAttrs,
    resolveAttrValue,
    toCssColor,
} from "../src/core/expressions";
import type { VariableScopes } from "../src/core/types";

function scopes(partial: Partial<VariableScopes> = {}): VariableScopes {
    return { f: {}, sf: {}, tf: {}, ...partial };
}

describe("evalExpression", () => {
    it("reads and writes game variables", () => {
        const s = scopes();
        evalExpression("f.x = 5", s);
        expect(s.f.x).toBe(5);
        expect(evalExpression("f.x + 1", s)).toBe(6);
    });

    it("exposes extra bindings (preexp)", () => {
        const s = scopes();
        expect(evalExpression("preexp * 2", s, { preexp: 21 })).toBe(42);
    });
});

describe("resolveAttrValue", () => {
    it("evaluates &entity values", () => {
        const s = scopes({ tf: { msg: "hello" } });
        expect(resolveAttrValue("&tf.msg", s)).toBe("hello");
    });

    it("resolves %macro params with |default", () => {
        const s = scopes();
        s.mp = { time: "300" };
        expect(resolveAttrValue("%time|2000", s)).toBe("300");
        expect(resolveAttrValue("%method|crossfade", s)).toBe("crossfade");
        expect(resolveAttrValue("%missing", s)).toBeUndefined();
    });

    it("passes plain values through", () => {
        expect(resolveAttrValue("room.jpg", scopes())).toBe("room.jpg");
    });
});

describe("resolveAttrs", () => {
    it("expands * to all macro params", () => {
        const s = scopes();
        s.mp = { x: "1", y: "2" };
        expect(resolveAttrs({ "*": "true", z: "3" }, s)).toEqual({ x: "1", y: "2", z: "3" });
    });
});

describe("primitive coercions", () => {
    it("parseBool / parseNum", () => {
        expect(parseBool("true")).toBe(true);
        expect(parseBool("false", true)).toBe(false);
        expect(parseBool(undefined, true)).toBe(true);
        expect(parseNum("42")).toBe(42);
        expect(parseNum("x", 7)).toBe(7);
    });

    it("toCssColor converts 0x notation", () => {
        expect(toCssColor("0x454D51")).toBe("#454D51");
        expect(toCssColor("red")).toBe("red");
    });
});
