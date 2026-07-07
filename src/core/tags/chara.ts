import { parseNum } from "../expressions";
import type { TagHandler } from "./index";

/** Character tags (chara_new / chara_face / chara_show / chara_mod / ...). */
export const charaTags: Record<string, TagHandler> = {
    chara_new(engine, attrs) {
        if (!attrs.name || !attrs.storage) return;
        engine.charas.define(attrs.name, attrs.storage, attrs.jname);
    },

    chara_face(engine, attrs) {
        if (!attrs.name || !attrs.face || !attrs.storage) return;
        engine.charas.defineFace(attrs.name, attrs.face, attrs.storage);
    },

    chara_config(engine, attrs) {
        if (attrs.ptext) engine.message.namePText = attrs.ptext;
    },

    async chara_show(engine, attrs) {
        if (!attrs.name) return;
        await engine.charas.show(attrs.name, attrs.face ?? "default", parseNum(attrs.time, 400));
    },

    async chara_mod(engine, attrs) {
        if (!attrs.name) return;
        await engine.charas.mod(attrs.name, attrs.face ?? "default", parseNum(attrs.time, 300));
    },

    async chara_hide(engine, attrs) {
        if (!attrs.name) return;
        await engine.charas.hide(attrs.name, parseNum(attrs.time, 400));
    },

    chara_hide_all(engine) {
        engine.charas.hideAll();
    },
};
