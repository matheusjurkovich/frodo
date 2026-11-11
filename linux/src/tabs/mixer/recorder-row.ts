import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {AudioStream} from '../../features/system/mixer.types.js';
import type {Mixer} from '../../features/system/mixer-service.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {column, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';

export class RecorderRow implements Component {
    readonly actor = row('frodo-mixer-recorder');
    readonly #icon = new St.Icon({style_class: 'frodo-mixer-recorder-icon', y_align: Clutter.ActorAlign.CENTER});
    readonly #name = label('', 'frodo-mixer-recorder-name');
    readonly #state = label('', 'frodo-mixer-recorder-state');
    readonly #buttonLabel = label('', '');
    readonly #button: St.Button;
    #stream: AudioStream | null = null;

    constructor(mixer: Mixer) {
        this.#buttonLabel.x_align = Clutter.ActorAlign.CENTER;
        this.#button = contentButton(
            'frodo-button frodo-button-control frodo-mixer-recorder-button',
            this.#buttonLabel,
            () => {
                if (this.#stream) mixer.setMuted(this.#stream.id, !this.#stream.muted);
            },
            {y_align: Clutter.ActorAlign.CENTER},
        );
        const text = column('frodo-mixer-recorder-text');
        text.y_align = Clutter.ActorAlign.CENTER;
        text.add_child(this.#name);
        text.add_child(this.#state);
        for (const child of [this.#icon, text, this.#button]) this.actor.add_child(child);
    }

    update(stream: AudioStream): void {
        this.#stream = stream;
        this.#icon.icon_name = stream.iconName;
        this.#name.text = stream.name;
        this.#state.text = stream.muted ? 'Silenciado aqui' : 'Ouvindo agora';
        if (stream.muted) this.#state.add_style_class_name('frodo-mixer-recorder-off');
        else this.#state.remove_style_class_name('frodo-mixer-recorder-off');
        this.#buttonLabel.text = stream.muted ? 'Ativar' : 'Silenciar';
        this.#button.accessible_name = stream.muted
            ? `Ativar o microfone para ${stream.name}`
            : `Silenciar o microfone para ${stream.name}`;
        if (stream.muted) this.#button.add_style_class_name('frodo-mixer-muted');
        else this.#button.remove_style_class_name('frodo-mixer-muted');
    }

    destroy(): void {
        this.actor.destroy();
    }
}
