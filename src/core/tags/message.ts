import { parseNum } from "../expressions";
import type { TagHandler } from "./index";

/** Message window tags ([p]/[l]/[r]/[cm]/[er]/font/delay/ruby/#speaker). */
export const messageTags: Record<string, TagHandler> = {
    async p(engine) {
        engine.markHistoryBreak();
        await engine.message.waitClick(true);
        engine.message.clear(false);
    },

    async l(engine) {
        await engine.message.waitClick(true);
    },

    r(engine) {
        engine.message.lineBreak();
    },

    cm(engine) {
        engine.markHistoryBreak();
        engine.message.clear(true);
        engine.stage.frontButtonsEl.replaceChildren();
        engine.pendingLink = null;
    },

    er(engine) {
        engine.message.clear(false);
    },

    delay(engine, attrs) {
        const speed = attrs.speed;
        if (speed === "none" || speed === "nowait") engine.message.speed = 0;
        else engine.message.speed = parseNum(speed, engine.config.chSpeed);
    },

    resetdelay(engine) {
        engine.message.speed = engine.config.chSpeed;
    },

    font(engine, attrs) {
        engine.message.applyFontTag(attrs);
    },

    resetfont(engine) {
        engine.message.resetFont();
    },

    deffont(engine, attrs) {
        engine.message.applyDefFontTag(attrs);
        engine.message.resetFont();
    },

    ruby(engine, attrs) {
        engine.pendingRuby = attrs.text ?? "";
    },

    /** #speaker lines are parsed into this tag (same as the classic engine). */
    chara_ptext(engine, attrs) {
        engine.setSpeaker(attrs.name ?? "");
    },

    current(engine, attrs) {
        if (attrs.layer) engine.message.currentLayer = attrs.layer;
    },
};
