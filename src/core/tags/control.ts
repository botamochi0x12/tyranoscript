import { evalExpression, parseNum } from "../expressions";
import type { TagHandler } from "./index";

/** Flow control and misc system tags (jump/call/return/s/wait/eval/...). */
export const controlTags: Record<string, TagHandler> = {
    async jump(engine, attrs) {
        engine.resetForJump();
        await engine.interpreter.jump(attrs.storage, attrs.target);
    },

    async call(engine, attrs) {
        await engine.interpreter.call(attrs.storage, attrs.target);
    },

    return(engine) {
        engine.interpreter.returnFromCall();
    },

    s() {
        return "stop";
    },

    async wait(engine, attrs) {
        await engine.wait(parseNum(attrs.time, 0));
    },

    async wt(engine) {
        await engine.stage.waitTransition();
    },

    eval(engine, attrs) {
        if (!attrs.exp) return;
        try {
            evalExpression(attrs.exp, engine.scopes);
        } catch (e) {
            console.warn(`[tyrano] [eval] failed: ${attrs.exp}`, e);
        }
    },

    async emb(engine, attrs) {
        if (!attrs.exp) return;
        try {
            const v = evalExpression(attrs.exp, engine.scopes);
            await engine.message.write(v === undefined || v === null ? "" : String(v));
        } catch (e) {
            console.warn(`[tyrano] [emb] failed: ${attrs.exp}`, e);
        }
    },

    clearstack(engine) {
        engine.interpreter.clearStack();
    },

    title(_engine, attrs) {
        if (attrs.name) document.title = attrs.name;
    },

    // Keyboard shortcuts are always available in the modern engine; the
    // classic enable/disable switches become no-ops.
    start_keyconfig() {},
    stop_keyconfig() {},
};
