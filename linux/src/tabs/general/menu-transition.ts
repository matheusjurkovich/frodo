import type Clutter from 'gi://Clutter';
import type St from 'gi://St';
import type {QuickToggleMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {SPRING} from '../../shared/spring.const.js';
import {morphSize, settle, slideIn, slideOut} from '../../shared/ui/motion.js';
import {HEIGHT_AXIS} from '../../shared/ui/motion.const.js';

export class MenuTransition {
    readonly #page: Clutter.Actor;
    readonly #content: St.Widget;
    readonly #scrollToTop: () => void;

    constructor(page: Clutter.Actor, content: St.Widget, scrollToTop: () => void) {
        this.#page = page;
        this.#content = content;
        this.#scrollToTop = scrollToTop;
    }

    push(menu: QuickToggleMenu, open: boolean): void {
        const content = this.#content;
        menu.actor.remove_all_transitions();
        menu.box.remove_all_transitions();
        menu.actor.height = -1;
        menu.box.opacity = 255;
        if (open) {
            this.#scrollToTop();
            morphSize(
                this.#page,
                () => {
                    content.set({height: 0, reactive: false});
                },
                SPRING,
                HEIGHT_AXIS,
            );
            content.height = -1;
            slideOut(content, 1, () => {
                settle(content);
                content.set({opacity: 0, height: 0, clip_to_allocation: true});
            });
            slideIn(menu.actor, 1);
            return;
        }
        morphSize(
            this.#page,
            () => {
                menu.actor.hide();
                content.set({height: -1, opacity: 255, reactive: true, clip_to_allocation: false});
            },
            SPRING,
            HEIGHT_AXIS,
        );
        menu.actor.show();
        slideOut(menu.actor, -1, () => {
            menu.actor.hide();
            settle(menu.actor);
            menu.emit('menu-closed');
        });
        slideIn(content, -1);
    }

    restore(menus: readonly QuickToggleMenu[]): void {
        for (const menu of menus) {
            settle(menu.actor);
            if (menu.isOpen) continue;
            menu.actor.hide();
            menu.actor.height = 0;
            menu.box.opacity = 0;
        }
        settle(this.#content);
        this.#content.set({height: -1, opacity: 255, reactive: true, clip_to_allocation: false});
        settle(this.#page);
        this.#page.height = -1;
    }
}
