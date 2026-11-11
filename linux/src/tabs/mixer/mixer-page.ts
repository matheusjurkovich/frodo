import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {playingSummary, sameStreams, volumeLabel} from '../../features/system/mixer.js';
import type {AudioStream} from '../../features/system/mixer.types.js';
import type {Mixer} from '../../features/system/mixer-service.js';
import type {AudioDevice} from '../../features/system/mixer-service.types.js';
import {Disposables} from '../../shared/disposables.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {contentButton, iconButton} from '../../shared/ui/buttons.js';
import {card, cardHeading, cardTitle} from '../../shared/ui/card.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {islandMenu} from '../../shared/ui/island-menu.js';
import {column, dimLabel, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {SPEAKER, BARS, MICROPHONE} from './mixer-page.const.js';
import type {Icons} from './mixer-page.types.js';

class VolumeControl implements Component {
    readonly actor = row('frodo-mixer-control');
    readonly #slider = new Slider(0);
    readonly #value = label('', 'frodo-mixer-value frodo-mono');
    readonly #mute: St.Button;
    readonly #sliderId: number;
    readonly #icons: Icons;
    #stream: AudioStream | null = null;

    constructor(mixer: Mixer, icons: Icons, size: 32 | 36) {
        this.#icons = icons;
        this.#mute = iconButton(
            frodoIcon(icons.on),
            'Silenciar',
            () => {
                if (this.#stream) mixer.setMuted(this.#stream.id, !this.#stream.muted);
            },
            'control',
            size,
        );
        this.#mute.add_style_class_name('frodo-mixer-mute');
        this.#slider.x_expand = true;
        this.#slider.y_align = Clutter.ActorAlign.CENTER;
        this.#sliderId = this.#slider.connect('notify::value', () => {
            if (this.#stream) mixer.setLevel(this.#stream.id, this.#slider.value);
        });
        for (const child of [this.#mute, this.#slider, this.#value]) this.actor.add_child(child);
    }

    update(stream: AudioStream, name: string): void {
        this.#stream = stream;
        this.#slider.block_signal_handler(this.#sliderId);
        this.#slider.value = stream.muted ? 0 : stream.level;
        this.#slider.unblock_signal_handler(this.#sliderId);
        this.#slider.accessible_name = `Volume de ${name}`;
        this.#slider.opacity = stream.muted ? 102 : 255;
        this.#value.text = volumeLabel(stream);
        const icon = this.#mute.child;
        if (icon instanceof St.Icon) icon.gicon = frodoIcon(stream.muted ? this.#icons.off : this.#icons.on);
        this.#mute.accessible_name = stream.muted ? `Ativar o som de ${name}` : `Silenciar ${name}`;
        if (stream.muted) this.#mute.add_style_class_name('frodo-mixer-muted');
        else this.#mute.remove_style_class_name('frodo-mixer-muted');
    }

    destroy(): void {
        this.actor.destroy();
    }
}

class AppRow implements Component {
    readonly actor = column('frodo-mixer-app');
    readonly #icon = new St.Icon({style_class: 'frodo-mixer-app-icon', y_align: Clutter.ActorAlign.CENTER});
    readonly #name = label('', 'frodo-mixer-app-name');
    readonly #detail = dimLabel();
    readonly #bars = row('frodo-mixer-bars');
    readonly #muted = label('Silenciado', 'frodo-mixer-muted-label');
    readonly #control: VolumeControl;

    constructor(mixer: Mixer) {
        this.#control = new VolumeControl(mixer, SPEAKER, 32);
        this.#detail.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const text = column('frodo-mixer-app-text');
        text.y_align = Clutter.ActorAlign.CENTER;
        text.add_child(this.#name);
        text.add_child(this.#detail);
        this.#bars.x_expand = false;
        this.#bars.y_align = Clutter.ActorAlign.CENTER;
        this.#bars.accessible_name = 'Tocando agora';
        for (let index = 0; index < BARS; index++)
            this.#bars.add_child(new St.Widget({style_class: `frodo-mixer-bar frodo-mixer-bar-${index}`, y_align: Clutter.ActorAlign.END}));
        const head = row('frodo-mixer-app-head');
        for (const child of [this.#icon, text, this.#bars, this.#muted]) head.add_child(child);
        this.#control.actor.add_style_class_name('frodo-mixer-app-control');
        this.actor.add_child(head);
        this.actor.add_child(this.#control.actor);
    }

    update(stream: AudioStream, playing: boolean): void {
        this.#icon.icon_name = stream.iconName;
        this.#name.text = stream.name;
        this.#detail.text = stream.detail ?? '';
        this.#detail.visible = stream.detail !== null;
        this.#bars.visible = playing && !stream.muted;
        this.#muted.visible = stream.muted;
        this.#control.update(stream, stream.name);
    }

    destroy(): void {
        this.#control.destroy();
        this.actor.destroy();
    }
}

class RecorderRow implements Component {
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

class DevicePicker implements Component {
    readonly actor: St.BoxLayout = row('frodo-mixer-device');
    readonly #button: St.Button;
    readonly #text = label('', 'frodo-mixer-device-name');
    readonly #menu: PopupMenu.PopupMenu;
    readonly #disposables = new Disposables();

    constructor(island: IslandHandle, devices: () => AudioDevice[], current: () => number | null, choose: (id: number) => void) {
        this.#text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const content = row('frodo-mixer-device-content');
        this.#text.x_expand = true;
        content.add_child(this.#text);
        content.add_child(new St.Icon({gicon: frodoIcon('expand'), style_class: 'frodo-mixer-device-caret'}));
        this.#button = contentButton(
            'frodo-button frodo-button-control frodo-mixer-device-button',
            content,
            () => {
                this.#menu.removeAll();
                const active = current();
                for (const device of devices()) {
                    const item = new PopupMenu.PopupMenuItem(device.name);
                    item.add_style_class_name('frodo-power-item');
                    item.setOrnament(device.id === active ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
                    item.connect('activate', () => {
                        choose(device.id);
                    });
                    this.#menu.addMenuItem(item);
                }
                this.#menu.toggle();
            },
            {x_expand: true},
        );
        const title = label('Dispositivo', 'frodo-mixer-device-label');
        this.actor.add_child(title);
        this.actor.add_child(this.#button);
        this.#menu = islandMenu(island, this.#button, 0.5, this.#disposables, ['frodo-power-menu', 'frodo-mixer-device-menu']);
    }

    set device(name: string) {
        this.#text.text = name;
        this.#button.accessible_name = `Dispositivo: ${name}`;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}

export class MixerPage implements Component {
    readonly actor = row('frodo-cols frodo-mixer');
    readonly #mixer: Mixer;
    readonly #summary = label('', 'frodo-mixer-summary');
    readonly #apps = column('frodo-mixer-apps');
    readonly #recorders = column('frodo-mixer-recorders');
    readonly #noRecorders = dimLabel('Nenhum app usando o microfone');
    readonly #output: VolumeControl;
    readonly #input: VolumeControl;
    readonly #outputDevice: DevicePicker;
    readonly #inputDevice: DevicePicker;
    readonly #outputCard = card('frodo-mixer-card');
    readonly #inputCard = card('frodo-mixer-card');
    readonly #disposables = new Disposables();
    readonly #live = new Disposables();
    #appRows: AppRow[] = [];
    #recorderRows: RecorderRow[] = [];
    #shownApps: AudioStream[] = [];
    #shownRecorders: AudioStream[] = [];

    constructor(mixer: Mixer, island: IslandHandle) {
        this.#mixer = mixer;
        this.#output = new VolumeControl(mixer, SPEAKER, 36);
        this.#input = new VolumeControl(mixer, MICROPHONE, 36);
        this.#outputDevice = new DevicePicker(
            island,
            () => mixer.outputs,
            () => mixer.output?.id ?? null,
            id => {
                mixer.useOutput(id);
            },
        );
        this.#inputDevice = new DevicePicker(
            island,
            () => mixer.inputs,
            () => mixer.input?.id ?? null,
            id => {
                mixer.useInput(id);
            },
        );

        const apps = card('frodo-mixer-card');
        apps.add_style_class_name('frodo-mixer-apps-card');
        const head = row('frodo-mixer-head');
        const heading = cardHeading('Volume por app');
        heading.x_expand = true;
        head.add_child(heading);
        head.add_child(this.#summary);
        const note = wrappedLabel('Um app aparece aqui enquanto tem som aberto. O volume escolhido vale até ele fechar.', 'frodo-dim');
        for (const child of [head, this.#apps, note]) apps.add_child(child);

        const outputNote = wrappedLabel('O volume geral limita todos os apps ao mesmo tempo.', 'frodo-dim');
        for (const child of [cardHeading('Saída'), this.#outputDevice.actor, this.#output.actor, outputNote])
            this.#outputCard.add_child(child);
        for (const child of [
            cardHeading('Microfone'),
            this.#inputDevice.actor,
            this.#input.actor,
            cardTitle('Usando o microfone agora'),
            this.#recorders,
            this.#noRecorders,
        ])
            this.#inputCard.add_child(child);

        const side = column('frodo-section frodo-mixer-side');
        side.x_expand = false;
        side.y_align = Clutter.ActorAlign.START;
        side.add_child(this.#outputCard);
        side.add_child(this.#inputCard);
        apps.y_align = Clutter.ActorAlign.START;
        this.actor.add_child(apps);
        this.actor.add_child(side);

        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#sync();
                    this.#live.add(
                        mixer.on('changed', () => {
                            this.#sync();
                        }),
                    );
                },
                () => {
                    this.#live.dispose();
                },
            ),
        );
    }

    #sync(): void {
        const mixer = this.#mixer;
        const system = mixer.system;
        const apps = mixer.apps;
        const listed = system ? [...apps, system] : apps;
        if (!sameStreams(listed, this.#shownApps)) {
            for (const app of this.#appRows) app.destroy();
            this.#appRows = listed.map(() => new AppRow(mixer));
            for (const app of this.#appRows) this.#apps.add_child(app.actor);
        }
        this.#shownApps = listed;
        listed.forEach((stream, index) => this.#appRows[index]?.update(stream, stream !== system));
        this.#summary.text = playingSummary(apps);

        const recorders = mixer.recorders;
        if (!sameStreams(recorders, this.#shownRecorders)) {
            for (const recorder of this.#recorderRows) recorder.destroy();
            this.#recorderRows = recorders.map(() => new RecorderRow(mixer));
            for (const recorder of this.#recorderRows) this.#recorders.add_child(recorder.actor);
        }
        this.#shownRecorders = recorders;
        recorders.forEach((stream, index) => this.#recorderRows[index]?.update(stream));
        this.#noRecorders.visible = recorders.length === 0;

        this.#syncDevice(mixer.output, this.#output, this.#outputDevice, this.#outputCard);
        this.#syncDevice(mixer.input, this.#input, this.#inputDevice, this.#inputCard);
    }

    #syncDevice(stream: AudioStream | null, control: VolumeControl, picker: DevicePicker, box: St.BoxLayout): void {
        box.visible = stream !== null;
        if (!stream) return;
        picker.device = stream.name;
        control.update(stream, stream.name);
    }

    destroy(): void {
        this.#disposables.dispose();
        for (const app of this.#appRows) app.destroy();
        for (const recorder of this.#recorderRows) recorder.destroy();
        this.#output.destroy();
        this.#input.destroy();
        this.#outputDevice.destroy();
        this.#inputDevice.destroy();
        this.actor.destroy();
    }
}
