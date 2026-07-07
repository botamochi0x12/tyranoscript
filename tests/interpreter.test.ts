import { describe, expect, it } from "vitest";
import { Interpreter, type ExecHost } from "../src/core/interpreter";
import { parseScenario } from "../src/core/parser";
import { resolveAttrs } from "../src/core/expressions";
import type { Scenario, TagCommand, VariableScopes } from "../src/core/types";

/** Minimal host that records executed text/tags; [s] stops, [jump] jumps. */
function makeHost(files: Record<string, string>) {
    const scenarios = new Map<string, Scenario>();
    const texts: string[] = [];
    const tags: Array<{ name: string; attrs: Record<string, string> }> = [];
    const scopes: VariableScopes = { f: {}, sf: {}, tf: {} };

    const host: ExecHost = {
        scopes,
        async loadScenario(storage: string) {
            if (!scenarios.has(storage)) {
                const src = files[storage];
                if (src === undefined) throw new Error(`no such file: ${storage}`);
                scenarios.set(storage, parseScenario(storage, src));
            }
            return scenarios.get(storage)!;
        },
        async executeTag(cmd: TagCommand) {
            const attrs = resolveAttrs(cmd.attrs, scopes);
            if (cmd.name === "s") return "stop";
            if (cmd.name === "jump") {
                await interp.jump(attrs.storage, attrs.target);
                return;
            }
            if (cmd.name === "return") {
                interp.returnFromCall();
                return;
            }
            if (cmd.name === "call") {
                await interp.call(attrs.storage, attrs.target);
                return;
            }
            if (cmd.name === "eval" && attrs.exp) {
                new Function("f", "tf", `${attrs.exp}`)(scopes.f, scopes.tf);
                return;
            }
            if (interp.invokeMacro(cmd.name, attrs)) return;
            tags.push({ name: cmd.name, attrs });
        },
        async executeText(text: string) {
            texts.push(text);
        },
        runIScript(code: string) {
            new Function("f", "sf", "tf", code)(scopes.f, scopes.sf, scopes.tf);
        },
    };
    const interp = new Interpreter(host);
    return { interp, texts, tags, scopes };
}

async function settle(): Promise<void> {
    // let the async run loop drain
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
}

describe("Interpreter", () => {
    it("runs text and stops at [s]", async () => {
        const { interp, texts } = makeHost({ "a.ks": "hello\nworld\n[s]\nnever" });
        await interp.start("a.ks");
        await settle();
        expect(texts).toEqual(["hello", "world"]);
        expect(interp.stopped).toBe(true);
    });

    it("jumps to labels, including cross-file", async () => {
        const { interp, texts } = makeHost({
            "a.ks": "[jump storage=b.ks target=*here]\nskipped\n[s]",
            "b.ks": "nope\n[s]\n*here\nlanded\n[s]",
        });
        await interp.start("a.ks");
        await settle();
        expect(texts).toEqual(["landed"]);
    });

    it("supports call / return across files", async () => {
        const { interp, texts } = makeHost({
            "a.ks": "before\n[call storage=b.ks]\nafter\n[s]",
            "b.ks": "inside\n[return]",
        });
        await interp.start("a.ks");
        await settle();
        expect(texts).toEqual(["before", "inside", "after"]);
    });

    it("defines and invokes macros with %param|default and mp", async () => {
        const { interp, tags } = makeHost({
            "a.ks": [
                "[macro name=back]",
                "[image storage=%storage time=%time|2000]",
                "[endmacro]",
                "[back storage=room.jpg]",
                "[back storage=sea.jpg time=5]",
                "[s]",
            ].join("\n"),
        });
        await interp.start("a.ks");
        await settle();
        expect(tags).toEqual([
            { name: "image", attrs: { storage: "room.jpg", time: "2000" } },
            { name: "image", attrs: { storage: "sea.jpg", time: "5" } },
        ]);
    });

    it("handles if / elsif / else / endif", async () => {
        const src = [
            "[eval exp=\"f.x=2\"]",
            "[if exp=\"f.x==1\"]",
            "one",
            "[elsif exp=\"f.x==2\"]",
            "two",
            "[else]",
            "other",
            "[endif]",
            "done",
            "[s]",
        ].join("\n");
        const { interp, texts } = makeHost({ "a.ks": src });
        await interp.start("a.ks");
        await settle();
        expect(texts).toEqual(["two", "done"]);
    });

    it("runs iscript blocks against the scopes", async () => {
        const { interp, scopes } = makeHost({
            "a.ks": "[iscript]\nf.total = 40 + 2;\n[endscript]\n[s]",
        });
        await interp.start("a.ks");
        await settle();
        expect(scopes.f.total).toBe(42);
    });

    it("records save points at text outside macros", async () => {
        const { interp } = makeHost({ "a.ks": "*start\nhello\n[s]" });
        await interp.start("a.ks");
        await settle();
        expect(interp.lastSavePoint).toEqual({ storage: "a.ks", index: 1 });
    });
});
