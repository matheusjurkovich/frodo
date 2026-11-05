import type St from 'gi://St';
import type {TabId} from '../settings/schema-values.types.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import type {FrodoIconName} from '../shared/ui/icons.types.js';

export interface TabSpec {
    readonly id: TabId;
    readonly icon: FrodoIconName;
    readonly label: string;
    create(): Component;
}

export interface TabItem {
    readonly button: St.Button;
    readonly badge: St.Label;
}
