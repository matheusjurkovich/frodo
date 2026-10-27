import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {formatTimer} from '../../../core/format.js';
import {trackFraction} from '../../../core/media.js';
import type {MediaService} from '../../../services/media.js';
import {Disposables} from '../../../util/disposables.js';
import {Timer} from '../../../util/timer.js';
import {iconButton} from '../../components/buttons.js';
import {card} from '../../components/card.js';
import {column, label, row} from '../../components/layout.js';
import {whileMapped} from '../../components/lifecycle.js';
import type {Component} from '../../components/lifecycle.js';
import {SegmentBar} from '../../components/segment-bar.js';
import {frodoIcon} from '../../icons.js';

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
    readonly #cover = new St.Icon({
        style_class: 'frodo-media-cover frodo-media-cover-empty',
        gicon: frodoIcon('music'),
        y_align: Clutter.ActorAlign.CENTER,
    });
    readonly #heading = label('', 'frodo-media-heading');
    readonly #title = label('', 'frodo-media-title');
    readonly #artist = label('', 'frodo-media-artist');
    readonly #elapsed = label('', 'frodo-media-time frodo-mono');
    readonly #total = label('', 'frodo-media-time frodo-mono');
    readonly #bar = new SegmentBar();
    readonly #progress = row('frodo-media-progress');
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
            36,
        );
        this.#playPause = iconButton(
            frodoIcon('play'),
            'Tocar',
            () => {
                media.playPause();
            },
            'light',
            44,
        );
        this.#next = iconButton(
            frodoIcon('next'),
            'Próxima faixa',
            () => {
                media.next();
            },
            'ghost',
            36,
        );

        this.#progress.add_child(this.#elapsed);
        this.#progress.add_child(this.#bar.actor);
        this.#progress.add_child(this.#total);

        const text = column('frodo-media-text');
        text.y_align = Clutter.ActorAlign.CENTER;
        for (const child of [this.#heading, this.#title, this.#artist, this.#progress]) text.add_child(child);

        const controls = row('frodo-media-controls');
        controls.x_expand = false;
        controls.y_align = Clutter.ActorAlign.CENTER;
        for (const child of [this.#previous, this.#playPause, this.#next]) controls.add_child(child);

        const line = row('frodo-media-row');
        line.add_child(this.#cover);
        line.add_child(text);
        line.add_child(controls);
        this.actor.add_child(line);

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

        this.#heading.text = track.app ? `Tocando agora · ${track.app}` : 'Tocando agora';
        this.#title.text = track.title;
        this.#artist.text = track.artist;
        this.#artist.visible = track.artist !== '';
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
        this.#cover.gicon = url === '' ? frodoIcon('music') : Gio.FileIcon.new(Gio.File.new_for_uri(url));
        if (url === '') this.#cover.add_style_class_name('frodo-media-cover-empty');
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
