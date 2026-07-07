import type { Command, Scenario, TagCommand } from "./types";

/**
 * Parser for the TyranoScript / KAG scenario format (.ks).
 *
 * Supported syntax:
 *   ; comment
 *   *label
 *   @tag attr=value attr="value"
 *   [tag attr=value] inline with text
 *   #speaker / #speaker:face / # (clear)
 *   [iscript] ... [endscript]  (raw JavaScript block)
 *   &expr, %macroparam|default  are kept verbatim and resolved at runtime.
 */
export function parseScenario(storage: string, source: string): Scenario {
    const commands: Command[] = [];
    const labels = new Map<string, number>();
    const lines = source.split(/\r\n|\r|\n/);

    let i = 0;
    while (i < lines.length) {
        const rawLine = lines[i] ?? "";
        const lineNo = i + 1;
        const line = rawLine.trim();
        i++;

        if (line === "" || line.startsWith(";")) continue;

        // *label (optional |save-title part is ignored)
        if (line.startsWith("*")) {
            const name = line.slice(1).split("|")[0]!.trim();
            if (name !== "" && !labels.has(name)) labels.set(name, commands.length);
            commands.push({ kind: "label", name, line: lineNo });
            continue;
        }

        // #speaker line -> chara_ptext tag (same behavior as the classic engine)
        if (line.startsWith("#")) {
            const body = line.slice(1).trim();
            const [name = "", face] = body.split(":");
            const attrs: Record<string, string> = { name };
            if (face !== undefined) attrs.face = face.trim();
            commands.push({ kind: "tag", name: "chara_ptext", attrs, line: lineNo });
            continue;
        }

        // @tag line
        if (line.startsWith("@")) {
            const tag = parseTagBody(line.slice(1), lineNo);
            if (tag) {
                if (tag.name === "iscript") {
                    i = collectIScript(lines, i, lineNo, commands);
                } else {
                    commands.push(tag);
                }
            }
            continue;
        }

        // Mixed text and [tag] segments
        let pos = 0;
        let textBuf = "";
        const flushText = () => {
            if (textBuf !== "") {
                commands.push({ kind: "text", text: textBuf, line: lineNo });
                textBuf = "";
            }
        };
        let iscriptStarted = false;
        while (pos < line.length) {
            const ch = line[pos]!;
            if (ch === "[") {
                const end = findTagEnd(line, pos);
                if (end === -1) {
                    textBuf += ch;
                    pos++;
                    continue;
                }
                const tag = parseTagBody(line.slice(pos + 1, end), lineNo);
                pos = end + 1;
                if (!tag) continue;
                flushText();
                if (tag.name === "iscript") {
                    // Anything after [iscript] on the same line is part of the code.
                    const rest = line.slice(pos);
                    i = collectIScript(lines, i, lineNo, commands, rest);
                    iscriptStarted = true;
                    break;
                }
                commands.push(tag);
            } else {
                textBuf += ch;
                pos++;
            }
        }
        if (!iscriptStarted) flushText();
    }

    return { storage, commands, labels };
}

/** Collect raw lines until [endscript] / @endscript into an iscript command. */
function collectIScript(
    lines: string[],
    startIndex: number,
    lineNo: number,
    commands: Command[],
    firstFragment = "",
): number {
    const code: string[] = [];
    if (firstFragment.trim() !== "") code.push(firstFragment);
    let i = startIndex;
    while (i < lines.length) {
        const line = (lines[i] ?? "").trim();
        i++;
        if (/^(\[endscript\s*\]|@endscript\b)/.test(line)) {
            commands.push({ kind: "iscript", code: code.join("\n"), line: lineNo });
            return i;
        }
        code.push(lines[i - 1] ?? "");
    }
    // Unterminated block: keep what we got instead of throwing away the file.
    commands.push({ kind: "iscript", code: code.join("\n"), line: lineNo });
    return i;
}

/** Find the index of the `]` closing the tag opened at `start`, honoring quotes. */
function findTagEnd(line: string, start: number): number {
    let quote: string | null = null;
    for (let i = start + 1; i < line.length; i++) {
        const ch = line[i]!;
        if (quote) {
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === "]") {
            return i;
        }
    }
    return -1;
}

/** Parse `tagname key=value key="value" flag` into a TagCommand. */
export function parseTagBody(body: string, lineNo: number): TagCommand | null {
    const trimmed = body.trim();
    if (trimmed === "") return null;

    const nameMatch = /^[A-Za-z0-9_]+/.exec(trimmed);
    if (!nameMatch) return null;
    const name = nameMatch[0].toLowerCase();
    const attrs: Record<string, string> = {};

    let rest = trimmed.slice(nameMatch[0].length);
    // Tokenize: key ( = value )?  where value may be quoted; whitespace around `=`
    // is tolerated (the sample scenarios use `storage ="x"` and `time = 200`).
    const re = /([A-Za-z0-9_*]+)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s\]]*))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
        if (m[0] === "") {
            re.lastIndex++;
            continue;
        }
        const key = m[1]!;
        let value: string;
        if (m[2] === undefined) {
            value = "true"; // bare flag, e.g. [s] with stray tokens
        } else if (m[3] !== undefined) {
            value = m[3];
        } else if (m[4] !== undefined) {
            value = m[4];
        } else {
            value = m[2];
        }
        // Tolerate trailing `;` on unquoted values (`visible=true;` appears in the demo)
        if (!m[3] && !m[4]) value = value.replace(/;+$/, "");
        attrs[key] = value;
    }
    void lineNo;
    return { kind: "tag", name, attrs, line: lineNo };
}
