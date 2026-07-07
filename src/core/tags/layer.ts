import { parseBool, parseNum, toCssColor } from "../expressions";
import type { MessageLayerConfig, MessageLayerPatch } from "../stage";
import type { TagHandler } from "./index";

function page(attrs: Record<string, string>): "fore" | "back" {
    return attrs.page === "back" ? "back" : "fore";
}

/** Layer / image / transition tags (bg, image, trans, layopt, position, ...). */
export const layerTags: Record<string, TagHandler> = {
    async bg(engine, attrs) {
        if (!attrs.storage) return;
        await engine.stage.setBackground(
            engine.res.bgImage(attrs.storage),
            attrs.storage,
            parseNum(attrs.time, 1000),
            attrs.method ?? "crossfade",
        );
    },

    image(engine, attrs) {
        if (!attrs.storage) return;
        const folder = attrs.folder ?? "fgimage";
        engine.stage.addImage(attrs.layer ?? "0", page(attrs), {
            type: "image",
            src: engine.res.path(folder, attrs.storage),
            name: attrs.name,
            left: parseNum(attrs.left ?? attrs.x, 0),
            top: parseNum(attrs.top ?? attrs.y, 0),
            width: attrs.width ? parseNum(attrs.width) : undefined,
            height: attrs.height ? parseNum(attrs.height) : undefined,
            visible: parseBool(attrs.visible, true),
        });
    },

    freeimage(engine, attrs) {
        if (!attrs.layer) return;
        engine.stage.freeImage(attrs.layer, page(attrs));
    },

    free(engine, attrs) {
        if (!attrs.layer || !attrs.name) return;
        engine.stage.free(attrs.layer, attrs.name);
    },

    ptext(engine, attrs) {
        engine.stage.addPText(attrs.layer ?? "0", {
            type: "ptext",
            name: attrs.name,
            text: attrs.text ?? "",
            x: parseNum(attrs.x, 0),
            y: parseNum(attrs.y, 0),
            size: attrs.size ? parseNum(attrs.size) : undefined,
            color: attrs.color,
            bold: parseBool(attrs.bold),
            face: attrs.face,
        });
    },

    backlay(engine, attrs) {
        engine.stage.backlay(attrs.layer);
    },

    trans(engine, attrs) {
        // [trans] starts the transition; [wt] waits for it.
        void engine.stage.trans(
            attrs.layer ?? "base",
            parseNum(attrs.time, 1000),
            attrs.method ?? "crossfade",
        );
    },

    layopt(engine, attrs) {
        const layer = attrs.layer;
        if (!layer) return;
        const layers = layer === "message" ? engine.stage.messageLayerNames() : [layer];
        for (const l of layers) {
            if (attrs.visible !== undefined) {
                engine.stage.setLayerVisible(l, parseBool(attrs.visible));
            }
        }
    },

    position(engine, attrs) {
        const layer = attrs.layer ?? engine.message.currentLayer;
        const patch: MessageLayerPatch = {};
        if (attrs.left !== undefined) patch.left = parseNum(attrs.left);
        if (attrs.top !== undefined) patch.top = parseNum(attrs.top);
        if (attrs.width !== undefined) patch.width = parseNum(attrs.width);
        if (attrs.height !== undefined) patch.height = parseNum(attrs.height);
        if (attrs.frame !== undefined) patch.frame = attrs.frame === "" ? undefined : attrs.frame;
        if (attrs.opacity !== undefined) patch.opacity = parseNum(attrs.opacity, 255);
        if (attrs.vertical !== undefined) patch.vertical = parseBool(attrs.vertical);
        if (attrs.color !== undefined) patch.color = toCssColor(attrs.color);
        const margins: Partial<MessageLayerConfig["margins"]> = {};
        if (attrs.margint !== undefined) margins.top = parseNum(attrs.margint);
        if (attrs.marginl !== undefined) margins.left = parseNum(attrs.marginl);
        if (attrs.marginr !== undefined) margins.right = parseNum(attrs.marginr);
        if (attrs.marginb !== undefined) margins.bottom = parseNum(attrs.marginb);
        if (Object.keys(margins).length > 0) patch.margins = margins;
        engine.stage.updateMessageConfig(layer, patch);
        if (attrs.visible !== undefined) {
            engine.stage.setLayerVisible(layer, parseBool(attrs.visible));
        }
    },
};
