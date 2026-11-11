import type St from 'gi://St';
import type {Component} from '../../shared/ui/lifecycle.types.js';

export function syncRows<Key, Row extends Component>(
    container: St.BoxLayout,
    rows: Map<Key, Row>,
    keys: readonly Key[],
    create: (key: Key) => Row,
): void {
    const wanted = new Set(keys);
    for (const [key, existing] of [...rows])
        if (!wanted.has(key)) {
            existing.destroy();
            rows.delete(key);
        }
    keys.forEach((key, index) => {
        let found = rows.get(key);
        if (!found) {
            found = create(key);
            rows.set(key, found);
            container.add_child(found.actor);
        }
        container.set_child_at_index(found.actor, index);
    });
}
