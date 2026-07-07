/**
 * Audio playback built on plain HTMLAudioElement (replaces howler.js).
 * Handles BGM (looping, cross-session volume, fade in/out) and one-shot SE.
 */
export class AudioManager {
    private bgmEl: HTMLAudioElement | null = null;
    private fadeHandle: number | null = null;
    private seEls = new Set<HTMLAudioElement>();

    bgmVolume = 1; // 0..1 master, set from config / bgmopt
    seVolume = 1;
    currentBgm: { storage: string; loop: boolean } | null = null;

    /** Some browsers block autoplay until a user gesture; retry pending BGM then. */
    private pendingBgm: (() => void) | null = null;

    constructor() {
        const unlock = () => {
            if (this.pendingBgm) {
                const fn = this.pendingBgm;
                this.pendingBgm = null;
                fn();
            }
        };
        globalThis.addEventListener?.("pointerdown", unlock);
        globalThis.addEventListener?.("keydown", unlock);
    }

    playBgm(src: string, storage: string, opts: { loop?: boolean; fadeMs?: number } = {}): void {
        const loop = opts.loop ?? true;
        this.stopBgm(0);
        const el = new Audio(src);
        el.loop = loop;
        el.volume = opts.fadeMs ? 0 : this.bgmVolume;
        this.bgmEl = el;
        this.currentBgm = { storage, loop };
        const start = () => {
            el.play().catch(() => {
                // Autoplay blocked: retry on first user gesture.
                this.pendingBgm = () => {
                    if (this.bgmEl === el) el.play().catch(() => undefined);
                };
            });
        };
        start();
        if (opts.fadeMs) this.fadeTo(el, this.bgmVolume, opts.fadeMs);
    }

    stopBgm(fadeMs = 0): void {
        const el = this.bgmEl;
        this.bgmEl = null;
        this.currentBgm = null;
        this.pendingBgm = null;
        if (!el) return;
        if (fadeMs > 0) {
            this.fadeTo(el, 0, fadeMs, () => {
                el.pause();
                el.src = "";
            });
        } else {
            el.pause();
            el.src = "";
        }
    }

    setBgmVolume(volume0to100: number): void {
        this.bgmVolume = Math.min(1, Math.max(0, volume0to100 / 100));
        if (this.bgmEl) this.bgmEl.volume = this.bgmVolume;
    }

    setSeVolume(volume0to100: number): void {
        this.seVolume = Math.min(1, Math.max(0, volume0to100 / 100));
    }

    playSe(src: string, opts: { loop?: boolean; volume?: number } = {}): void {
        const el = new Audio(src);
        el.loop = opts.loop ?? false;
        el.volume = opts.volume !== undefined ? Math.min(1, opts.volume / 100) : this.seVolume;
        this.seEls.add(el);
        el.addEventListener("ended", () => this.seEls.delete(el));
        el.play().catch(() => this.seEls.delete(el));
    }

    stopSe(): void {
        for (const el of this.seEls) {
            el.pause();
            el.src = "";
        }
        this.seEls.clear();
    }

    private fadeTo(el: HTMLAudioElement, target: number, ms: number, done?: () => void): void {
        if (this.fadeHandle !== null) cancelAnimationFrame(this.fadeHandle);
        const from = el.volume;
        const startTime = performance.now();
        const step = (now: number) => {
            // rAF timestamps can precede the scheduling time; clamp both ends.
            const t = Math.min(1, Math.max(0, (now - startTime) / ms));
            el.volume = Math.min(1, Math.max(0, from + (target - from) * t));
            if (t < 1) {
                this.fadeHandle = requestAnimationFrame(step);
            } else {
                this.fadeHandle = null;
                done?.();
            }
        };
        this.fadeHandle = requestAnimationFrame(step);
    }
}
