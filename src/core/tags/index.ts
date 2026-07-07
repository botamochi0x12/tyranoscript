import type { Engine } from "../engine";
import { audioTags } from "./audio";
import { charaTags } from "./chara";
import { controlTags } from "./control";
import { layerTags } from "./layer";
import { messageTags } from "./message";
import { uiTags } from "./ui";

export type TagHandler = (
    engine: Engine,
    attrs: Record<string, string>,
) => Promise<void | "stop"> | void | "stop";

export const tagHandlers: Record<string, TagHandler> = {
    ...controlTags,
    ...messageTags,
    ...layerTags,
    ...charaTags,
    ...uiTags,
    ...audioTags,
};
