import { parseBool, parseNum } from "../expressions";
import type { TagHandler } from "./index";

/** Audio tags on top of AudioManager (replaces kag.tag_audio.js + howler). */
export const audioTags: Record<string, TagHandler> = {
    playbgm(engine, attrs) {
        if (!attrs.storage) return;
        engine.audio.playBgm(engine.res.bgm(attrs.storage), attrs.storage, {
            loop: parseBool(attrs.loop, true),
            fadeMs: attrs.time ? parseNum(attrs.time) : undefined,
        });
    },

    stopbgm(engine, attrs) {
        engine.audio.stopBgm(parseNum(attrs.time, 0));
    },

    async fadeoutbgm(engine, attrs) {
        const time = parseNum(attrs.time, 1000);
        engine.audio.stopBgm(time);
        await engine.wait(time);
    },

    bgmopt(engine, attrs) {
        if (attrs.volume !== undefined) engine.audio.setBgmVolume(parseNum(attrs.volume, 100));
    },

    seopt(engine, attrs) {
        if (attrs.volume !== undefined) engine.audio.setSeVolume(parseNum(attrs.volume, 100));
    },

    playse(engine, attrs) {
        if (!attrs.storage) return;
        engine.audio.playSe(engine.res.sound(attrs.storage), {
            loop: parseBool(attrs.loop, false),
            volume: attrs.volume ? parseNum(attrs.volume) : undefined,
        });
    },

    stopse(engine) {
        engine.audio.stopSe();
    },
};
