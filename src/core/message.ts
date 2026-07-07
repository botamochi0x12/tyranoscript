import { toCssColor } from "./expressions";
import type { Stage } from "./stage";

export interface FontStyle {
    size?: number;
    color?: string;
    bold?: boolean;
    face?: string;
    italic?: boolean;
}

/**
 * Message window: typewriter text, click waits, page glyph, font state and
 * the speaker-name area (replaces the message half of kag.tag.js).
 */
export class MessageWindow {
    currentLayer = "message0";
    /** ms per character; [delay speed=] overrides, 0 = instant */
    speed: number;
    defaultFont: FontStyle = {};
    font: FontStyle = {};
    /** name of the ptext registered via [chara_config ptext=] */
    namePText: string | null = null;

    private typing: { cancel: () => void } | null = null;
    private clickWaiter: (() => void) | null = null;
    private skipMode = false;
    private autoMode = false;
    /** ms to linger on a page in auto mode */
    autoSpeed = 1300;

    constructor(
        private stage: Stage,
        baseSpeed: number,
    ) {
        this.speed = baseSpeed;
    }

    setSkipMode(on: boolean): void {
        this.skipMode = on;
        if (on) this.onClick(); // flush any pending wait
    }
    get isSkipping(): boolean {
        return this.skipMode;
    }

    setAutoMode(on: boolean): void {
        this.autoMode = on;
        if (on && this.clickWaiter) {
            setTimeout(() => {
                if (this.autoMode) this.onClick();
            }, this.autoSpeed);
        }
    }
    get isAutoMode(): boolean {
        return this.autoMode;
    }

    private inner(): HTMLElement | null {
        return this.stage.messageParts(this.currentLayer)?.inner ?? null;
    }

    /** Append text with the typewriter effect. Resolves when fully shown. */
    async write(text: string): Promise<void> {
        const inner = this.inner();
        if (!inner) return;
        this.removeGlyph();
        const span = document.createElement("span");
        applyFont(span, this.font);
        inner.appendChild(span);

        const chars = [...text];
        if (this.speed <= 0 || this.skipMode) {
            span.textContent = text;
            return;
        }
        await new Promise<void>((resolve) => {
            let i = 0;
            let timer = 0;
            const finish = () => {
                clearInterval(timer);
                span.textContent = text;
                this.typing = null;
                resolve();
            };
            this.typing = { cancel: finish };
            timer = setInterval(() => {
                if (i >= chars.length) {
                    finish();
                    return;
                }
                span.textContent += chars[i]!;
                i++;
            }, this.speed) as unknown as number;
        });
    }

    /** [r] */
    lineBreak(): void {
        this.inner()?.appendChild(document.createElement("br"));
    }

    /** [ruby text=x]C  -> annotate the next written character. */
    async writeRuby(base: string, ruby: string): Promise<void> {
        const inner = this.inner();
        if (!inner) return;
        this.removeGlyph();
        const el = document.createElement("ruby");
        const rb = document.createElement("span");
        applyFont(rb, this.font);
        rb.textContent = base;
        const rt = document.createElement("rt");
        rt.textContent = ruby;
        el.append(rb, rt);
        inner.appendChild(el);
    }

    /** [l] / [p]: wait for a click (or Enter/Space via Engine). */
    waitClick(showGlyph: boolean): Promise<void> {
        if (this.skipMode) return new Promise((r) => setTimeout(r, 40));
        if (showGlyph) this.showGlyph();
        return new Promise<void>((resolve) => {
            this.clickWaiter = () => {
                this.removeGlyph();
                resolve();
            };
            if (this.autoMode) {
                setTimeout(() => {
                    if (this.autoMode) this.onClick();
                }, this.autoSpeed);
            }
        });
    }

    /**
     * Stage click / advance-key handler.
     * Returns true when the click was consumed (typing flush or wait release).
     */
    onClick(): boolean {
        if (this.typing) {
            this.typing.cancel();
            return true;
        }
        if (this.clickWaiter) {
            const w = this.clickWaiter;
            this.clickWaiter = null;
            w();
            return true;
        }
        return false;
    }

    get isWaitingClick(): boolean {
        return this.clickWaiter !== null;
    }

    /** [cm] / [er]: clear message text (cm clears every layer). */
    clear(allLayers: boolean): void {
        this.removeGlyph();
        const layers = allLayers ? this.stage.messageLayerNames() : [this.currentLayer];
        for (const layer of layers) {
            this.stage.messageParts(layer)?.inner.replaceChildren();
        }
    }

    setSpeakerName(html: string): void {
        if (!this.namePText) return;
        const target = this.stage.findByName(this.namePText);
        if (target) target.innerHTML = html;
    }

    applyFontTag(attrs: Record<string, string>): void {
        if (attrs.size) this.font.size = Number(attrs.size);
        if (attrs.color) this.font.color = toCssColor(attrs.color);
        if (attrs.bold) this.font.bold = attrs.bold === "true";
        if (attrs.face) this.font.face = attrs.face;
        if (attrs.italic) this.font.italic = attrs.italic === "true";
    }

    applyDefFontTag(attrs: Record<string, string>): void {
        if (attrs.size) this.defaultFont.size = Number(attrs.size);
        if (attrs.color) this.defaultFont.color = toCssColor(attrs.color);
        if (attrs.bold) this.defaultFont.bold = attrs.bold === "true";
        if (attrs.face) this.defaultFont.face = attrs.face;
    }

    resetFont(): void {
        this.font = { ...this.defaultFont };
    }

    private showGlyph(): void {
        const inner = this.inner();
        if (!inner || inner.querySelector(".ty-glyph")) return;
        const glyph = document.createElement("span");
        glyph.className = "ty-glyph";
        glyph.textContent = "▼";
        inner.appendChild(glyph);
    }

    private removeGlyph(): void {
        this.inner()?.querySelectorAll(".ty-glyph").forEach((n) => n.remove());
    }
}

function applyFont(el: HTMLElement, font: FontStyle): void {
    if (font.size) el.style.fontSize = `${font.size}px`;
    if (font.color) el.style.color = font.color;
    if (font.bold) el.style.fontWeight = "bold";
    if (font.face) el.style.fontFamily = font.face;
    if (font.italic) el.style.fontStyle = "italic";
}
