import type Clutter from 'gi://Clutter';

export class ActorLoan {
    readonly #actor: Clutter.Actor;
    readonly #parent: Clutter.Actor;
    readonly #index: number;
    readonly #destroyId: number;
    #alive = true;
    #returned = false;

    constructor(actor: Clutter.Actor, target: Clutter.Actor) {
        const parent = actor.get_parent();
        if (!parent) throw new Error('ator sem pai não pode ser emprestado');
        this.#actor = actor;
        this.#parent = parent;
        this.#index = parent.get_children().indexOf(actor);
        this.#destroyId = actor.connect('destroy', () => {
            this.#alive = false;
        });
        parent.remove_child(actor);
        target.add_child(actor);
    }

    get alive(): boolean {
        return this.#alive;
    }

    giveBack(): void {
        if (this.#returned) return;
        this.#returned = true;
        if (!this.#alive) return;
        this.#actor.disconnect(this.#destroyId);
        this.#actor.get_parent()?.remove_child(this.#actor);
        this.#parent.insert_child_at_index(this.#actor, Math.min(this.#index, this.#parent.get_n_children()));
    }
}
