import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import {playingSummary} from '../../features/system/mixer.js';
import type {AudioStream} from '../../features/system/mixer.types.js';
import type {Mixer} from '../../features/system/mixer-service.js';
import {Disposables} from '../../shared/disposables.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {card, cardHeading, cardTitle} from '../../shared/ui/card.js';
import {column, dimLabel, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {AppRow} from './app-row.js';
import {DevicePicker} from './device-picker.js';
import {MICROPHONE, SPEAKER} from './mixer-page.const.js';
import {RecorderRow} from './recorder-row.js';
import {syncRows} from './sync-rows.js';
import {VolumeControl} from './volume-control.js';

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
    readonly #appRows = new Map<number, AppRow>();
    readonly #recorderRows = new Map<number, RecorderRow>();

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
        syncRows(
            this.#apps,
            this.#appRows,
            listed.map(stream => stream.id),
            () => new AppRow(mixer),
        );
        for (const stream of listed) this.#appRows.get(stream.id)?.update(stream, stream !== system);
        this.#summary.text = playingSummary(apps);

        const recorders = mixer.recorders;
        syncRows(
            this.#recorders,
            this.#recorderRows,
            recorders.map(stream => stream.id),
            () => new RecorderRow(mixer),
        );
        for (const stream of recorders) this.#recorderRows.get(stream.id)?.update(stream);
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
        for (const app of this.#appRows.values()) app.destroy();
        for (const recorder of this.#recorderRows.values()) recorder.destroy();
        this.#output.destroy();
        this.#input.destroy();
        this.#outputDevice.destroy();
        this.#inputDevice.destroy();
        this.actor.destroy();
    }
}
