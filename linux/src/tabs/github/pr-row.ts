import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {KIND_LABELS} from '../../features/github/github.const.js';
import {prDetail, prMeta, primaryAction} from '../../features/github/github.js';
import {contentButton, textButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {Wrap} from '../../shared/ui/wrap.js';
import {CHECK_ICONS, CHECK_LABELS} from './pr-row.const.js';
import type {PrRowOptions} from './pr-row.types.js';

export class PrRow implements Component {
    readonly actor: St.BoxLayout;
    readonly #wrap: Wrap | null = null;

    constructor({pr, expanded, muted, now, actions}: PrRowOptions) {
        this.actor = column(`frodo-github-pr frodo-github-kind-${pr.kind}`);
        if (expanded) this.actor.add_style_pseudo_class('checked');

        const head = row('frodo-github-pr-head');
        head.add_child(
            new St.Bin({
                style_class: 'frodo-github-pr-badge',
                y_align: Clutter.ActorAlign.START,
                child: new St.Icon({gicon: frodoIcon(`pr-${pr.kind}`), style_class: 'frodo-github-pr-icon'}),
            }),
        );
        const text = column('frodo-github-pr-text');
        text.x_expand = true;
        const title = label(pr.title, 'frodo-github-pr-title');
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const ref = label(
            `${pr.repo.split('/').pop() ?? pr.repo}#${String(pr.number)} · ${pr.head} → ${pr.base}`,
            'frodo-dim frodo-mono frodo-github-pr-ref',
        );
        ref.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const tags = row('frodo-github-pr-tags');
        tags.add_child(label(KIND_LABELS[pr.kind], 'frodo-github-kind-label'));
        const meta = label(prMeta(pr, muted, now), 'frodo-dim frodo-github-pr-meta');
        meta.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        tags.add_child(meta);
        for (const child of [title, ref, tags]) text.add_child(child);
        head.add_child(text);
        head.add_child(
            new St.Icon({
                gicon: frodoIcon(expanded ? 'collapse' : 'expand'),
                style_class: 'frodo-github-pr-chevron',
                y_align: Clutter.ActorAlign.START,
            }),
        );
        this.actor.add_child(
            contentButton(
                'frodo-github-pr-toggle',
                head,
                () => {
                    actions.toggle(pr.key);
                },
                {x_expand: true, accessible_name: `${pr.title}, ${KIND_LABELS[pr.kind]}`, checked: expanded},
            ),
        );
        if (!expanded) return;

        const detail = prDetail(pr);
        const box = column('frodo-github-box');
        box.add_child(label(detail.title, 'frodo-github-box-title'));
        if (detail.body !== '') box.add_child(wrappedLabel(detail.body, 'frodo-github-box-body'));
        if (detail.command !== null) {
            const command = detail.command;
            const line = row('frodo-github-command');
            const code = label(command, 'frodo-mono frodo-github-command-text');
            code.x_expand = true;
            code.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            line.add_child(code);
            line.add_child(
                textButton('Copiar', () => {
                    actions.copy(command);
                }),
            );
            box.add_child(line);
        }

        const body = column('frodo-github-detail');
        body.add_child(box);
        if (pr.checks.length > 0) {
            this.#wrap = new Wrap('frodo-github-checks', [
                label('Checks', 'frodo-dim frodo-github-checks-title'),
                ...pr.checks.map(check => {
                    const item = row(`frodo-github-check frodo-github-check-${check.state}`);
                    item.x_expand = false;
                    item.accessible_name = `${check.name}, ${CHECK_LABELS[check.state]}`;
                    item.add_child(
                        new St.Icon({
                            gicon: frodoIcon(CHECK_ICONS[check.state]),
                            style_class: 'frodo-github-check-icon',
                            y_align: Clutter.ActorAlign.CENTER,
                        }),
                    );
                    item.add_child(label(check.name, 'frodo-github-check-name'));
                    return item;
                }),
            ]);
            body.add_child(this.#wrap.actor);
        }
        const buttons = row('frodo-github-actions');
        const action = primaryAction(pr);
        buttons.add_child(
            textButton(
                action.label,
                () => {
                    actions.open(action.url);
                },
                'primary',
            ),
        );
        buttons.add_child(
            textButton(
                muted ? 'Reativar alertas deste PR' : 'Silenciar alertas deste PR',
                () => {
                    actions.toggleMute(pr.key);
                },
                'control',
            ),
        );
        body.add_child(buttons);
        this.actor.add_child(body);
    }

    destroy(): void {
        this.#wrap?.destroy();
        this.actor.destroy();
    }
}
