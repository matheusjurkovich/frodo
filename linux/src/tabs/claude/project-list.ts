import type {Share} from '../../shared/consumption.types.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {formatTokens} from '../../shared/format.js';
import {column, label, row} from '../../shared/ui/layout.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';

class ProjectRow {
    readonly actor = row('frodo-project');
    readonly #name = label('', 'frodo-project-name frodo-mono');
    readonly #bar = new SegmentBar();
    readonly #value = label('', 'frodo-project-value');

    constructor() {
        for (const child of [this.#name, this.#bar.actor, this.#value]) this.actor.add_child(child);
    }

    show({name, tokens, fraction}: Share, largest: number, fillClass: string): void {
        this.#name.text = name;
        this.#bar.segments = [{fraction: largest > 0 ? tokens / largest : 0, styleClass: fillClass}];
        this.#value.text = `${formatTokens(tokens)} · ${Math.round(fraction * 100)}%`;
    }
}

export class ProjectList {
    readonly actor = column('frodo-projects');
    readonly #fillClass: string;
    readonly #rows: ProjectRow[] = [];

    constructor(provider: AiProvider) {
        this.#fillClass = `frodo-fill-${provider}`;
    }

    show(projects: readonly Share[]): void {
        while (this.#rows.length < projects.length) {
            const created = new ProjectRow();
            this.#rows.push(created);
            this.actor.add_child(created.actor);
        }
        for (const extra of this.#rows.splice(projects.length)) extra.actor.destroy();
        const largest = Math.max(0, ...projects.map(({tokens}) => tokens));
        projects.forEach((project, index) => this.#rows[index]?.show(project, largest, this.#fillClass));
    }
}
