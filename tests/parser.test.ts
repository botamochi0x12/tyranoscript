import { describe, expect, it } from "vitest";
import { parseScenario, parseTagBody } from "../src/core/parser";

describe("parseTagBody", () => {
    it("parses name and attributes", () => {
        const tag = parseTagBody('bg storage="room.jpg" time=100', 1)!;
        expect(tag.name).toBe("bg");
        expect(tag.attrs).toEqual({ storage: "room.jpg", time: "100" });
    });

    it("tolerates whitespace around = and single quotes", () => {
        const tag = parseTagBody("wait time = 200", 1)!;
        expect(tag.attrs.time).toBe("200");
        const tag2 = parseTagBody("image storage='a.png'", 1)!;
        expect(tag2.attrs.storage).toBe("a.png");
    });

    it("keeps & and % values verbatim for runtime resolution", () => {
        const tag = parseTagBody("image storage=%storage left=&f.x", 1)!;
        expect(tag.attrs.storage).toBe("%storage");
        expect(tag.attrs.left).toBe("&f.x");
    });

    it("strips a trailing semicolon from unquoted values", () => {
        const tag = parseTagBody("layopt layer=fix visible=true;", 1)!;
        expect(tag.attrs.visible).toBe("true");
    });

    it("lowercases the tag name", () => {
        expect(parseTagBody("CM", 1)!.name).toBe("cm");
    });
});

describe("parseScenario", () => {
    it("splits text, tags, labels and comments", () => {
        const src = [
            ";comment line",
            "*start",
            "[bg storage=\"room.jpg\" time=100]",
            "こんにちは[p]",
            "@jump storage=\"title.ks\"",
        ].join("\n");
        const s = parseScenario("test.ks", src);
        expect(s.labels.get("start")).toBe(0);
        const kinds = s.commands.map((c) => c.kind);
        expect(kinds).toEqual(["label", "tag", "text", "tag", "tag"]);
        expect(s.commands[2]).toMatchObject({ kind: "text", text: "こんにちは" });
        expect(s.commands[3]).toMatchObject({ kind: "tag", name: "p" });
        expect(s.commands[4]).toMatchObject({
            kind: "tag",
            name: "jump",
            attrs: { storage: "title.ks" },
        });
    });

    it("turns #speaker lines into chara_ptext tags", () => {
        const s = parseScenario("t.ks", "#あかね\nこんにちは[p]\n#\n");
        expect(s.commands[0]).toMatchObject({
            kind: "tag",
            name: "chara_ptext",
            attrs: { name: "あかね" },
        });
        expect(s.commands[3]).toMatchObject({ kind: "tag", attrs: { name: "" } });
    });

    it("captures iscript blocks as raw code", () => {
        const src = "[iscript]\nf.x = 1;\nf.y = f.x + 1;\n[endscript]\nafter";
        const s = parseScenario("t.ks", src);
        expect(s.commands[0]).toMatchObject({ kind: "iscript", code: "f.x = 1;\nf.y = f.x + 1;" });
        expect(s.commands[1]).toMatchObject({ kind: "text", text: "after" });
    });

    it("parses inline tags mixed with text and ruby", () => {
        const s = parseScenario("t.ks", "[ruby text=る]ル[l][cm]");
        expect(s.commands.map((c) => c.kind)).toEqual(["tag", "text", "tag", "tag"]);
    });

    it("does not crash on the malformed attr from the sample game", () => {
        const s = parseScenario("t.ks", '[font color-"red"]');
        expect(s.commands[0]).toMatchObject({ kind: "tag", name: "font" });
    });

    it("handles labels with trailing save-title part", () => {
        const s = parseScenario("t.ks", "*save1|セーブタイトル\n");
        expect(s.labels.get("save1")).toBe(0);
    });
});
