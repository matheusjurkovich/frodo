import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {Disposables} from '../disposables.js';
import {Timer} from '../timer.js';
import {contentButton} from './buttons.js';
import {DONE_MS} from './fault-banner.const.js';
import type {BannerAction, FaultBannerContent} from './fault-banner.types.js';
import {frodoIcon} from './icons.js';
import {column, label, row, wrappedLabel} from './layout.js';
import type {Component} from './lifecycle.types.js';

function bannerButton(styleClass: string, onClick: () => void): {button: St.Button; text: St.Label} {
    const text = new St.Label({y_align: Clutter.ActorAlign.CENTER});
    const button = contentButton(`frodo-button ${styleClass}`, text, onClick, {y_align: Clutter.ActorAlign.CENTER});
    return {button, text};
}

export class FaultBanner implements Component {
    readonly actor = column('frodo-fault-banner-slot');
    readonly #box = row('frodo-fault-banner');
    readonly #title = wrappedLabel('', 'frodo-fault-banner-title');
    readonly #body = wrappedLabel('', 'frodo-fault-banner-body');
    readonly #actions = row('frodo-fault-banner-actions');
    readonly #primary = bannerButton('frodo-fault-banner-primary', () => {
        this.#press(this.#content?.primary);
    });
    readonly #secondary = bannerButton('frodo-fault-banner-secondary', () => {
        this.#press(this.#content?.secondary);
    });
    readonly #confirm = column('frodo-fault-banner-confirm');
    readonly #confirmText = wrappedLabel('', 'frodo-fault-banner-confirm-text');
    readonly #confirmButton = bannerButton('frodo-fault-banner-confirm-yes', () => {
        const action = this.#asking;
        this.#ask(null);
        action?.run();
    });
    readonly #done = label('', 'frodo-fault-banner-done');
    readonly #disposables = new Disposables();
    readonly #timer = this.#disposables.own(new Timer());
    #content: FaultBannerContent | null = null;
    #asking: BannerAction | null = null;

    constructor() {
        this.#box.accessible_role = Atk.Role.ALERT;
        const circle = new St.Bin({
            style_class: 'frodo-fault-banner-circle',
            y_align: Clutter.ActorAlign.START,
            child: new St.Icon({
                gicon: frodoIcon('alert'),
                style_class: 'frodo-fault-banner-icon',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            }),
        });
        const text = column('frodo-fault-banner-text');
        text.x_expand = true;
        for (const button of [this.#primary, this.#secondary]) this.#actions.add_child(button.button);
        const cancel = bannerButton('frodo-fault-banner-confirm-no', () => {
            this.#ask(null);
        });
        cancel.text.text = 'Cancelar';
        const answers = row('frodo-fault-banner-confirm-actions');
        answers.x_align = Clutter.ActorAlign.END;
        answers.add_child(cancel.button);
        answers.add_child(this.#confirmButton.button);
        this.#confirm.add_child(this.#confirmText);
        this.#confirm.add_child(answers);
        for (const child of [this.#title, this.#body, this.#actions, this.#confirm]) text.add_child(child);
        this.#box.add_child(circle);
        this.#box.add_child(text);
        this.actor.add_child(this.#box);
        this.actor.add_child(this.#done);
        this.#ask(null);
        this.show(null);
    }

    show(content: FaultBannerContent | null): void {
        this.#content = content;
        if (content === null) {
            this.#ask(null);
            this.#box.visible = false;
            this.#sync();
            return;
        }
        this.#timer.stop();
        this.#done.visible = false;
        this.#box.visible = true;
        for (const tone of ['danger', 'warn'] as const) {
            if (tone === content.tone) this.#box.add_style_class_name(`frodo-fault-banner-${tone}`);
            else this.#box.remove_style_class_name(`frodo-fault-banner-${tone}`);
        }
        this.#title.text = content.title;
        this.#body.text = content.body;
        this.#primary.text.text = content.primary.label;
        this.#primary.button.accessible_name = content.primary.label;
        this.#secondary.text.text = content.secondary.label;
        this.#secondary.button.accessible_name = content.secondary.label;
        this.#sync();
    }

    done(message: string): void {
        this.show(null);
        this.#done.text = message;
        this.#done.visible = true;
        this.#sync();
        this.#timer.once(DONE_MS, () => {
            this.#done.visible = false;
            this.#sync();
        });
    }

    #press(action: BannerAction | undefined): void {
        if (!action) return;
        if (action.confirm) this.#ask(action);
        else action.run();
    }

    #ask(action: BannerAction | null): void {
        this.#asking = action;
        this.#confirm.visible = action !== null;
        this.#actions.visible = action === null;
        if (!action?.confirm) return;
        this.#confirmText.text = action.confirm.text;
        this.#confirmButton.text.text = action.confirm.label;
        this.#confirmButton.button.accessible_name = action.confirm.label;
    }

    #sync(): void {
        this.actor.visible = this.#box.visible || this.#done.visible;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
