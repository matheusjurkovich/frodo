import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {horizontalOf} from '../../settings/schema-values.js';
import type {ClosedItem} from '../../settings/schema-values.types.js';
import {Disposables} from '../../shared/disposables.js';
import {nextPeek} from '../../shared/peek.js';
import {moveTo} from '../../shared/reorder.js';
import {iconButton, textButton} from '../../shared/ui/buttons.js';
import {card} from '../../shared/ui/card.js';
import {dragReorder} from '../../shared/ui/drag-reorder.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import {Wrap} from '../../shared/ui/wrap.js';
import {missingItems} from './pill-items.js';
import {ITEM_LABELS} from './pill-items.const.js';
import {Bindings, grip, group, line, wrapped} from './settings-rows.js';
import {BATTERY_PERCENT_KEY} from './settings-rows.const.js';
import type {SettingsSection} from './settings-rows.types.js';
import {PILL_MODES, ROTATE_SECONDS, MODE_HINTS, PEEK_EVERY, PEEK_FOR} from './pill-section.const.js';
import type {PillSectionDependencies} from './pill-section.types.js';

export class PillSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #deps: PillSectionDependencies;
    readonly #disposables = new Disposables();
    readonly #bindings = new Bindings(this.#disposables);
    readonly #editor = column('frodo-pill-editor');
    readonly #editorBuilt = new Disposables();
    #focus: ClosedItem | null = null;

    constructor(deps: PillSectionDependencies) {
        this.#deps = deps;
        this.actor.add_child(this.#pill());
        this.actor.add_child(this.#peek());
        this.#disposables.add(
            deps.settings.onChanged(['closed-mode', 'closed-items', 'disabled-ai'], () => {
                this.#renderEditor();
            }),
        );
        this.#disposables.add(() => {
            this.#editorBuilt.dispose();
        });
        this.#renderEditor();
    }

    sync(): void {
        this.#bindings.sync();
    }

    #pill(): St.BoxLayout {
        const {settings, interfaceSettings} = this.#deps;
        const pill = card('frodo-settings-card');
        const header = row('frodo-settings-row');
        const title = label('Pílula', 'frodo-card-title');
        title.x_expand = true;
        title.y_align = Clutter.ActorAlign.CENTER;
        header.add_child(title);
        header.add_child(
            this.#bindings.segmented(
                PILL_MODES,
                () => settings.closedMode,
                mode => {
                    settings.closedMode = mode;
                },
            ),
        );
        pill.add_child(header);

        const frame = new St.Bin({
            style_class: 'frodo-pill frodo-pill-preview-pill',
            child: this.#deps.preview,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const strip = new St.Widget({style_class: 'frodo-pill-preview', layout_manager: new Clutter.BinLayout(), x_expand: true});
        strip.accessible_name = 'Prévia da pílula';
        strip.add_child(frame);
        pill.add_child(strip);
        const ALIGN = {left: Clutter.ActorAlign.START, center: Clutter.ActorAlign.CENTER, right: Clutter.ActorAlign.END} as const;
        this.#bindings.add(() => {
            frame.x_align = ALIGN[horizontalOf(settings.pillPosition)];
        });

        const options = column('frodo-settings-card');
        const hint = dimLabel();
        hint.clutter_text.line_wrap = true;
        options.add_child(hint);
        const rotate = line(
            'Trocar a cada',
            null,
            this.#bindings.stepper(
                ROTATE_SECONDS,
                's',
                () => settings.rotateSeconds,
                value => {
                    settings.rotateSeconds = value;
                },
            ),
        );
        rotate.add_style_class_name('frodo-settings-line-flat');
        options.add_child(rotate);
        const percent = line(
            'Mostrar porcentagem da bateria',
            'Vale para a pílula e para a barra superior',
            this.#bindings.switch(
                'Mostrar porcentagem da bateria',
                () => interfaceSettings.get_boolean(BATTERY_PERCENT_KEY),
                checked => {
                    interfaceSettings.set_boolean(BATTERY_PERCENT_KEY, checked);
                },
            ),
        );
        percent.add_style_class_name('frodo-settings-line-flat');
        options.add_child(percent);
        const ram = line(
            'RAM em porcentagem',
            null,
            this.#bindings.switch(
                'RAM em porcentagem',
                () => settings.ramPercent,
                checked => {
                    settings.ramPercent = checked;
                },
            ),
        );
        ram.add_style_class_name('frodo-settings-line-flat');
        options.add_child(ram);
        const always = line(
            'Sempre à mostra',
            'Com janela maximizada a pílula fica no lugar, sem virar lingueta',
            this.#bindings.switch(
                'Sempre à mostra',
                () => settings.alwaysShowPill,
                checked => {
                    settings.alwaysShowPill = checked;
                },
            ),
        );
        always.add_style_class_name('frodo-settings-line-flat');
        options.add_child(always);
        const activity = line(
            'Atividade da IA',
            'O que a IA está fazendo aparece na pílula',
            this.#bindings.segmented(
                [
                    {id: 'always', label: 'Sempre'},
                    {id: 'change', label: 'Ao mudar'},
                    {id: 'never', label: 'Nunca'},
                ],
                () => settings.pillAiActivity,
                value => {
                    settings.pillAiActivity = value;
                },
            ),
        );
        activity.add_style_class_name('frodo-settings-line-flat');
        options.add_child(activity);
        this.#bindings.add(() => {
            hint.text = MODE_HINTS[settings.closedMode];
            rotate.visible = settings.closedMode === 'rotating';
        });
        const columns = row('frodo-settings-columns');
        columns.layout_manager.homogeneous = true;
        columns.add_child(options);
        columns.add_child(this.#editor);
        pill.add_child(columns);
        return pill;
    }

    #peek(): St.BoxLayout {
        const settings = this.#deps.settings;
        const every = this.#bindings.segmented(
            PEEK_EVERY,
            () => String(settings.peekEveryMinutes),
            value => {
                settings.peekEveryMinutes = Number(value);
            },
        );
        const lasts = this.#bindings.segmented(
            PEEK_FOR,
            () => String(settings.peekSeconds),
            value => {
                settings.peekSeconds = Number(value);
            },
        );
        const section = group('Tela cheia', [
            line(
                'Mostrar a hora de tempos em tempos',
                'Em tela cheia a pílula some. Ligado, ela volta por alguns segundos só com o relógio.',
                this.#bindings.switch(
                    'Mostrar a hora de tempos em tempos',
                    () => settings.peekClock,
                    checked => {
                        settings.peekClock = checked;
                    },
                ),
            ),
            line('A cada', null, every),
            line('Fica visível por', null, lasts),
        ]);
        const hint = wrapped('', 'frodo-settings-hint');
        section.add_child(hint);
        const refresh = (): void => {
            const on = settings.peekClock;
            for (const control of [every, lasts]) {
                control.reactive = on;
                control.opacity = on ? 255 : 115;
            }
            const next = GLib.DateTime.new_from_unix_local(Math.floor(nextPeek(new Date(), settings.peekEveryMinutes).getTime() / 1000));
            hint.text = on
                ? `Próxima vez às ${next.format('%H:%M') ?? ''}, por ${settings.peekSeconds} s. Passar o mouse na pílula abre a ilha.`
                : 'Desligado: em tela cheia a pílula fica escondida.';
        };
        this.#bindings.add(refresh);
        section.connect('notify::mapped', refresh);
        return section;
    }

    #renderEditor(): void {
        const settings = this.#deps.settings;
        const editor = this.#editor;
        this.#editorBuilt.dispose();
        editor.destroy_all_children();
        if (settings.closedMode === 'minimal') {
            editor.add_child(
                wrapped(
                    'No modo Mínimo a pílula mostra só o relógio. Escolha Compacto ou Rotativo para montar os itens.',
                    'frodo-pill-note',
                ),
            );
            return;
        }

        const items = settings.closedItems;
        editor.add_child(label('Itens, da esquerda para a direita', 'frodo-settings-text'));
        const handles: St.Button[] = [];
        const chips = items.map((item, index) => {
            const chipBox = row('frodo-pill-item');
            chipBox.x_expand = false;
            const handle = grip(`Reordenar ${ITEM_LABELS[item]}: arraste ou use as setas`);
            handles.push(handle);
            chipBox.add_child(handle);
            chipBox.add_child(label(String(index + 1), 'frodo-pill-item-number frodo-mono'));
            chipBox.add_child(label(ITEM_LABELS[item], 'frodo-pill-item-name'));
            const remove = iconButton(
                frodoIcon('close'),
                `Tirar ${ITEM_LABELS[item]} da pílula`,
                () => {
                    settings.closedItems = items.filter(other => other !== item);
                },
                'ghost',
                32,
            );
            remove.add_style_class_name('frodo-pill-item-remove');
            remove.reactive = items.length > 1;
            remove.can_focus = items.length > 1;
            chipBox.add_child(remove);
            for (const child of chipBox.get_children()) child.y_align = Clutter.ActorAlign.CENTER;
            return chipBox;
        });
        const wrap = new Wrap('frodo-pill-items', chips);
        editor.add_child(wrap.actor);
        this.#editorBuilt.add(
            dragReorder({
                axis: 'x',
                host: this.#deps.overlay,
                items: chips,
                handles,
                arrange: actors => {
                    wrap.setItems(actors);
                },
                onMove: (from, to) => {
                    const item = items[from];
                    if (item === undefined) return;
                    this.#focus = item;
                    settings.closedItems = moveTo(items, item, to);
                },
            }),
        );
        const focus = this.#focus === null ? -1 : items.indexOf(this.#focus);
        this.#focus = null;
        handles[focus]?.grab_key_focus();
        const hint = wrapped('Arraste os itens para mudar a ordem. Pelo teclado, foque a alça e use ← →.', 'frodo-settings-hint');
        hint.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        editor.add_child(hint);

        const missing = missingItems(items, settings.enabledProviders);
        if (missing.length === 0) return;
        editor.add_child(label('Adicionar', 'frodo-settings-text'));
        const available = missing.map(item => {
            const button = textButton(
                ITEM_LABELS[item],
                () => {
                    settings.closedItems = [...items, item];
                },
                'ghost',
                frodoIcon('plus'),
            );
            button.add_style_class_name('frodo-pill-add');
            button.accessible_name = `Adicionar ${ITEM_LABELS[item]} à pílula`;
            return button;
        });
        editor.add_child(new Wrap('frodo-pill-items', available).actor);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
