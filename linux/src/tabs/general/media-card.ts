import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {formatTimer} from '../../shared/format.js';
import {trackFraction} from '../../features/media/media.js';
import type {MediaService} from '../../features/media/media-service.js';
import {Disposables} from '../../shared/disposables.js';
import {Timer} from '../../shared/timer.js';
import {chip, iconButton} from '../../shared/ui/buttons.js';
import {card} from '../../shared/ui/card.js';
import {column, label, row, spacer} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import {frodoIcon} from '../../shared/ui/icons.js';

const POLL_SECONDS = 1;
const US_PER_SECOND = 1e6;

function setEnabled(button: St.Button, enabled: boolean): void {
    button.reactive = enabled;
    button.can_focus = enabled;
    button.opacity = enabled ? 255 : 90;
}

export class MediaCard implements Component {
    readonly actor = card('frodo-media');
    readonly #media: MediaService;
    readonly #cover = new St.Bin({
        style_class: 'frodo-media-cover frodo-media-cover-empty',
        child: new St.Icon({gicon: frodoIcon('music')}),
        y_align: Clutter.ActorAlign.CENTER,
    });
    readonly #app = chip('');
    readonly #title = label('', 'frodo-media-title');
    readonly #artist = label('', 'frodo-media-artist');
    readonly #album = label('', 'frodo-media-album');
    readonly #elapsed = label('', 'frodo-media-time frodo-mono');
    readonly #total = label('', 'frodo-media-time frodo-mono');
    readonly #bar = new SegmentBar();
    readonly #progress = column('frodo-media-progress');
    readonly #previous: St.Button;
    readonly #playPause: St.Button;
    readonly #next: St.Button;
    readonly #poll = new Timer();
    readonly #disposables = new Disposables();
    #coverUrl = '';
    #position: number | null = null;
    #mapped = false;
    #destroyed = false;

    constructor(media: MediaService) {
        this.#media = media;
        this.#previous = iconButton(
            frodoIcon('previous'),
            'Faixa anterior',
            () => {
                media.previous();
            },
            'ghost',
            44,
        );
        this.#playPause = iconButton(
            frodoIcon('play'),
            'Tocar',
            () => {
                media.playPause();
            },
            'light',
            52,
        );
        this.#next = iconButton(
            frodoIcon('next'),
            'Próxima faixa',
            () => {
                media.next();
            },
            'ghost',
            44,
        );

        this.#title.clutter_text.set({line_wrap: true, ellipsize: Pango.EllipsizeMode.END});
        this.#progress.add_child(this.#bar.actor);
        const times = row('frodo-media-times');
        times.add_child(this.#elapsed);
        times.add_child(spacer());
        times.add_child(this.#total);
        this.#progress.add_child(times);

        const heading = row('frodo-media-heading');
        heading.add_child(label('Tocando agora', 'frodo-media-label'));
        heading.add_child(spacer());
        heading.add_child(this.#app);

        const text = column('frodo-media-text');
        text.y_align = Clutter.ActorAlign.CENTER;
        for (const child of [this.#title, this.#artist, this.#album]) text.add_child(child);

        const line = row('frodo-media-row');
        line.add_child(this.#cover);
        line.add_child(text);

        const controls = row('frodo-media-controls');
        controls.x_align = Clutter.ActorAlign.CENTER;
        controls.x_expand = false;
        for (const child of [this.#previous, this.#playPause, this.#next]) controls.add_child(child);

        for (const child of [heading, line, this.#progress, controls]) this.actor.add_child(child);

        this.#disposables.add(
            media.on('changed', () => {
                this.#render();
                this.#follow();
            }),
        );
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#mapped = true;
                    this.#follow();
                },
                () => {
                    this.#mapped = false;
                    this.#poll.stop();
                },
            ),
        );
        this.#render();
    }

    #render(): void {
        const track = this.#media.current;
        this.actor.visible = track !== null;
        if (!track) return;

        this.#app.text = track.app;
        this.#app.visible = track.app !== '';
        this.#title.text = track.title;
        for (const [text, value] of [
            [this.#artist, track.artist],
            [this.#album, track.album],
        ] as const) {
            text.text = value;
            text.visible = value !== '';
        }
        this.#setCover(track.coverUrl);

        const playPauseIcon = this.#playPause.child;
        if (playPauseIcon instanceof St.Icon) playPauseIcon.gicon = frodoIcon(track.playing ? 'pause' : 'play');
        this.#playPause.accessible_name = track.playing ? 'Pausar' : 'Tocar';
        setEnabled(this.#previous, track.canPrevious);
        setEnabled(this.#next, track.canNext);
        this.#renderProgress();
    }

    #setCover(url: string): void {
        if (url === this.#coverUrl) return;
        this.#coverUrl = url;
        const empty = url === '';
        this.#cover.style = empty ? null : `background-image: url(${JSON.stringify(url)});`;
        this.#cover.child.visible = empty;
        if (empty) this.#cover.add_style_class_name('frodo-media-cover-empty');
        else this.#cover.remove_style_class_name('frodo-media-cover-empty');
    }

    #renderProgress(): void {
        const lengthUs = this.#media.current?.lengthUs ?? null;
        const fraction = trackFraction(this.#position, lengthUs);
        this.#progress.visible = fraction !== null;
        if (fraction === null || this.#position === null || lengthUs === null) return;
        this.#bar.segments = [{fraction, styleClass: 'frodo-media-fill'}];
        this.#elapsed.text = formatTimer(Math.min(this.#position, lengthUs) / US_PER_SECOND);
        this.#total.text = formatTimer(lengthUs / US_PER_SECOND);
    }

    #follow(): void {
        if (!this.#mapped) {
            this.#poll.stop();
            return;
        }
        void this.#readPosition();
        if (!this.#media.current?.playing) this.#poll.stop();
        else if (!this.#poll.active)
            this.#poll.every(POLL_SECONDS, () => {
                void this.#readPosition();
            });
    }

    async #readPosition(): Promise<void> {
        const position = await this.#media.position();
        if (this.#destroyed) return;
        this.#position = position;
        this.#renderProgress();
    }

    destroy(): void {
        this.#destroyed = true;
        this.#poll.stop();
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
