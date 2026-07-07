import type { Engine } from "../engine";

const SAVE_SLOT_COUNT = 6;

/**
 * System UI overlays: menu, save/load slots and the backlog.
 * Replaces the remodal/jQuery-UI based menus of kag.menu.js with plain DOM.
 */
export class Overlays {
    private openStack: HTMLElement[] = [];

    constructor(private engine: Engine) {}

    get isOpen(): boolean {
        return this.openStack.length > 0;
    }

    /** Close the topmost overlay. Returns false when none is open. */
    closeTop(): boolean {
        const top = this.openStack.pop();
        if (!top) return false;
        top.remove();
        return true;
    }

    closeAll(): void {
        while (this.closeTop()) {
            /* pop all */
        }
    }

    private openPanel(titleText: string): HTMLElement {
        const backdrop = document.createElement("div");
        backdrop.className = "ty-overlay";
        backdrop.addEventListener("click", (e) => e.stopPropagation());

        const panel = document.createElement("div");
        panel.className = "ty-panel";
        const header = document.createElement("div");
        header.className = "ty-panel-header";
        const title = document.createElement("span");
        title.textContent = titleText;
        const close = document.createElement("button");
        close.className = "ty-panel-close";
        close.textContent = "×";
        close.addEventListener("click", () => this.closeTop());
        header.append(title, close);
        panel.appendChild(header);
        backdrop.appendChild(panel);
        this.engine.stage.overlayEl.appendChild(backdrop);
        this.openStack.push(backdrop);
        return panel;
    }

    openMenu(): void {
        if (this.isOpen) return;
        const panel = this.openPanel("メニュー");
        const list = document.createElement("div");
        list.className = "ty-menu-list";
        const items: Array<[string, () => void]> = [
            ["セーブ", () => this.swapTo(() => this.openSaveLoad("save"))],
            ["ロード", () => this.swapTo(() => this.openSaveLoad("load"))],
            ["バックログ", () => this.swapTo(() => this.openBacklog())],
            [
                "タイトルへ戻る",
                () => {
                    this.closeAll();
                    void this.engine.returnToTitle();
                },
            ],
            ["閉じる", () => this.closeTop()],
        ];
        for (const [label, action] of items) {
            const btn = document.createElement("button");
            btn.className = "ty-menu-item";
            btn.textContent = label;
            btn.addEventListener("click", action);
            list.appendChild(btn);
        }
        panel.appendChild(list);
    }

    private swapTo(open: () => void): void {
        this.closeTop();
        open();
    }

    openSaveLoad(mode: "save" | "load"): void {
        const panel = this.openPanel(mode === "save" ? "セーブ" : "ロード");
        const grid = document.createElement("div");
        grid.className = "ty-slot-grid";
        const slots = this.engine.getSaveSlots();
        for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
            const key = String(i);
            const data = slots[key];
            const slot = document.createElement("button");
            slot.className = "ty-slot";
            const label = document.createElement("div");
            label.className = "ty-slot-no";
            label.textContent = `No.${i + 1}`;
            const body = document.createElement("div");
            body.className = "ty-slot-body";
            body.textContent = data ? `${data.date}\n${data.title}` : "（データなし）";
            slot.append(label, body);
            if (mode === "load" && !data) slot.disabled = true;
            slot.addEventListener("click", () => {
                if (mode === "save") {
                    if (this.engine.saveToSlot(key)) this.swapTo(() => this.openSaveLoad("save"));
                } else {
                    void this.engine.loadFromSlot(key);
                }
            });
            grid.appendChild(slot);
        }
        panel.appendChild(grid);
    }

    openBacklog(): void {
        const panel = this.openPanel("バックログ");
        const list = document.createElement("div");
        list.className = "ty-backlog";
        for (const entry of this.engine.history) {
            const row = document.createElement("div");
            row.className = "ty-backlog-row";
            if (entry.name) {
                const name = document.createElement("span");
                name.className = "ty-backlog-name";
                name.textContent = `【${entry.name}】`;
                row.appendChild(name);
            }
            row.appendChild(document.createTextNode(entry.text));
            list.appendChild(row);
        }
        panel.appendChild(list);
        list.scrollTop = list.scrollHeight;
    }
}
