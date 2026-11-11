import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {horizontalOf} from '../../settings/schema-values.js';
import {Disposables} from '../../shared/disposables.js';
import {card} from '../../shared/ui/card.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {PeekGroup} from './peek-group.js';
import {PillItemsEditor} from './pill-items-editor.js';
import {Bindings, line} from './settings-rows.js';
import {BATTERY_PERCENT_KEY} from './settings-rows.const.js';
import type {SettingsSection} from './settings-rows.types.js';
import {AI_ACTIVITIES, ALIGN_BY_SIDE, MODE_HINTS, PILL_MODES, ROTATE_SECONDS} from './pill-section.const.js';
import type {PillSectionDependencies} from './pill-section.types.js';

export class PillSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #disposables = new Disposables();
    readonly #bindings: Bindings;

    constructor(deps: PillSectionDependencies) {
        this.#bindings = new Bindings(this.#disposables, deps.settings);
        const editor = this.#disposables.own(new PillItemsEditor({settings: deps.settings, overlay: deps.overlay}));
        this.actor.add_child(this.#pill(deps, editor));
        this.actor.add_child(this.#disposables.own(new PeekGroup(deps.settings)).actor);
    }

    #pill({settings, interfaceSettings, preview}: PillSectionDependencies, editor: PillItemsEditor): St.BoxLayout {
        const bindings = this.#bindings;
        const pill = card('frodo-settings-card');
        const header = row('frodo-settings-row');
        const title = label('Pílula', 'frodo-card-title');
        title.x_expand = true;
        title.y_align = Clutter.ActorAlign.CENTER;
        header.add_child(title);
        header.add_child(bindings.choice(PILL_MODES, 'closedMode'));
        pill.add_child(header);

        const frame = new St.Bin({style_class: 'frodo-pill frodo-pill-preview-pill', child: preview, y_align: Clutter.ActorAlign.CENTER});
        const strip = new St.Widget({style_class: 'frodo-pill-preview', layout_manager: new Clutter.BinLayout(), x_expand: true});
        strip.accessible_name = 'Prévia da pílula';
        strip.add_child(frame);
        pill.add_child(strip);
        bindings.add(() => {
            frame.x_align = ALIGN_BY_SIDE[horizontalOf(settings.pillPosition)];
        }, ['pill-position']);

        const options = column('frodo-settings-card');
        const hint = wrappedLabel('', 'frodo-dim');
        options.add_child(hint);
        const rotate = line('Trocar a cada', null, bindings.stepper(ROTATE_SECONDS, 's', 'rotateSeconds'));
        rotate.add_style_class_name('frodo-settings-line-flat');
        options.add_child(rotate);
        options.add_child(
            bindings.toggleLine(
                'Mostrar porcentagem da bateria',
                'Vale para a pílula e para a barra superior',
                {settings: interfaceSettings, key: BATTERY_PERCENT_KEY},
                true,
            ),
        );
        options.add_child(bindings.toggleLine('RAM em porcentagem', null, 'ramPercent', true));
        options.add_child(
            bindings.toggleLine(
                'Sempre à mostra',
                'Com janela maximizada a pílula fica no lugar, sem virar lingueta',
                'alwaysShowPill',
                true,
            ),
        );
        const activity = line(
            'Atividade da IA',
            'O que a IA está fazendo aparece na pílula',
            bindings.choice(AI_ACTIVITIES, 'pillAiActivity'),
        );
        activity.add_style_class_name('frodo-settings-line-flat');
        options.add_child(activity);
        bindings.add(() => {
            hint.text = MODE_HINTS[settings.closedMode];
            rotate.visible = settings.closedMode === 'rotating';
        }, ['closed-mode']);
        const columns = row('frodo-settings-columns');
        columns.layout_manager.homogeneous = true;
        columns.add_child(options);
        columns.add_child(editor.actor);
        pill.add_child(columns);
        return pill;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
