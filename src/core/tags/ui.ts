import { evalExpression, parseBool, parseNum } from "../expressions";
import type { Engine } from "../engine";
import type { TagHandler } from "./index";

/** Buttons, links and simple animation ([button]/[glink]/[link]/[anim]/...). */
export const uiTags: Record<string, TagHandler> = {
    /**
     * [button]: image button. Buttons with a role (or fix=true) live on the
     * fix layer and persist until [clearfix]; plain jump buttons live on the
     * front-button layer and are cleared when one of them fires or on [cm].
     */
    button(engine, attrs) {
        if (!attrs.graphic && !attrs.role) return;
        const folder = attrs.folder ?? "image";
        const isFix = attrs.role !== undefined || parseBool(attrs.fix);
        const parent = isFix ? engine.stage.fixEl : engine.stage.frontButtonsEl;
        if (isFix && !attrs.__restored) engine.fixButtons.push({ ...attrs, __restored: "true" });

        const btn = document.createElement("img");
        btn.className = "ty-button";
        if (attrs.name) btn.dataset.name = attrs.name;
        const normalSrc = attrs.graphic ? engine.res.path(folder, attrs.graphic) : "";
        const hoverSrc = attrs.enterimg ? engine.res.path(folder, attrs.enterimg) : null;
        if (normalSrc) btn.src = normalSrc;
        btn.style.left = `${parseNum(attrs.x, 0)}px`;
        btn.style.top = `${parseNum(attrs.y, 0)}px`;
        if (attrs.width) btn.style.width = `${parseNum(attrs.width)}px`;
        if (attrs.height) btn.style.height = `${parseNum(attrs.height)}px`;
        if (hoverSrc) {
            btn.addEventListener("mouseenter", () => (btn.src = hoverSrc));
            btn.addEventListener("mouseleave", () => (btn.src = normalSrc));
        }

        // preexp is evaluated when the button is placed, exp when clicked.
        let preexpValue: unknown;
        if (attrs.preexp) {
            try {
                preexpValue = evalExpression(attrs.preexp, engine.scopes);
            } catch (e) {
                console.warn(`[tyrano] [button] preexp failed: ${attrs.preexp}`, e);
            }
        }

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (engine.overlays.isOpen) return;
            if (attrs.exp) {
                try {
                    evalExpression(attrs.exp, engine.scopes, { preexp: preexpValue });
                } catch (err) {
                    console.warn(`[tyrano] [button] exp failed: ${attrs.exp}`, err);
                }
            }
            if (attrs.clickse) engine.audio.playSe(engine.res.sound(attrs.clickse), {});
            if (attrs.role) {
                void engine.handleRole(attrs.role, attrs);
                return;
            }
            jumpFromButton(engine, attrs);
        });
        parent.appendChild(btn);
    },

    /** [glink]: styled text button (CSS gradient instead of graphics). */
    glink(engine, attrs) {
        const btn = document.createElement("button");
        btn.className = `ty-glink ty-glink-${attrs.color ?? "black"}`;
        btn.textContent = attrs.text ?? "";
        btn.style.left = `${parseNum(attrs.x, 0)}px`;
        btn.style.top = `${parseNum(attrs.y, 0)}px`;
        if (attrs.width) btn.style.width = `${parseNum(attrs.width)}px`;
        if (attrs.height) btn.style.height = `${parseNum(attrs.height)}px`;
        if (attrs.size) btn.style.fontSize = `${parseNum(attrs.size)}px`;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (engine.overlays.isOpen) return;
            jumpFromButton(engine, attrs);
        });
        engine.stage.frontButtonsEl.appendChild(btn);
    },

    /** [link target=..]text[endlink]: inline text link in the message window. */
    link(engine, attrs) {
        engine.pendingLink = { target: attrs.target, storage: attrs.storage };
    },

    endlink(engine) {
        engine.pendingLink = null;
    },

    clearfix(engine) {
        engine.stage.fixEl.replaceChildren();
        engine.fixButtons = [];
    },

    showmenubutton(engine) {
        engine.setMenuButtonVisible(true);
    },

    hidemenubutton(engine) {
        engine.setMenuButtonVisible(false);
    },

    /** [anim]: animate a named entity's position/opacity (Web Animations API). */
    async anim(engine, attrs) {
        const name = attrs.name;
        if (!name) return;
        const el = engine.stage.findByName(name);
        if (!el) {
            console.warn(`[tyrano] [anim] target not found: ${name}`);
            return;
        }
        const time = parseNum(attrs.time, 500);
        const to: Keyframe = {};
        if (attrs.left !== undefined) to.left = `${parseNum(attrs.left)}px`;
        if (attrs.top !== undefined) to.top = `${parseNum(attrs.top)}px`;
        if (attrs.opacity !== undefined) to.opacity = String(parseNum(attrs.opacity, 255) / 255);
        if (Object.keys(to).length === 0) return;
        const anim = el.animate([to], { duration: time, easing: "ease", fill: "forwards" });
        await anim.finished.catch(() => undefined);
        anim.commitStyles?.();
        anim.cancel();
    },

    quake(engine, attrs) {
        const time = parseNum(attrs.time, 500);
        const power = parseNum(attrs.vmax ?? attrs.hmax, 10);
        engine.stage.stageEl.animate(
            [
                { transform: "translate(0,0)" },
                { transform: `translate(${power}px,-${power}px)` },
                { transform: `translate(-${power}px,${power}px)` },
                { transform: "translate(0,0)" },
            ],
            { duration: Math.max(50, time / 4), iterations: 4, composite: "add" },
        );
    },
};

function jumpFromButton(engine: Engine, attrs: Record<string, string>): void {
    engine.resetForJump();
    void engine.interpreter.jump(attrs.storage, attrs.target);
}
