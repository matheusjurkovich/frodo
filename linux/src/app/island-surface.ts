import {Disposables} from '../shared/disposables.js';
import {Glass} from '../shared/ui/glass.js';
import {SURFACE_STYLES} from '../settings/schema-values.const.js';
import type {IslandSurfaceDependencies} from './island-surface.types.js';

export class IslandSurface {
    readonly #dependencies: IslandSurfaceDependencies;
    readonly #disposables = new Disposables();
    #backdropGlass: Glass | null = null;
    #pillGlass: Glass | null = null;

    constructor(dependencies: IslandSurfaceDependencies) {
        this.#dependencies = dependencies;
        this.#disposables.add(
            dependencies.settings.onChanged('surface-style', () => {
                this.sync();
            }),
        );
        this.#disposables.add(() => {
            this.#dropGlass();
        });
    }

    sync(): void {
        const {settings, backdrop, panel, tongue, pill} = this.#dependencies;
        const style = settings.surfaceStyle;
        const surfaces = [backdrop, panel, tongue];
        for (const surface of surfaces) for (const other of SURFACE_STYLES) surface.remove_style_class_name(`frodo-surface-${other}`);
        if (style === 'solid') {
            this.#dropGlass();
            return;
        }
        for (const surface of surfaces) surface.add_style_class_name(`frodo-surface-${style}`);
        this.#backdropGlass ??= new Glass(backdrop);
        this.#pillGlass ??= new Glass(pill);
    }

    destroy(): void {
        this.#disposables.dispose();
    }

    #dropGlass(): void {
        this.#backdropGlass?.destroy();
        this.#backdropGlass = null;
        this.#pillGlass?.destroy();
        this.#pillGlass = null;
    }
}
