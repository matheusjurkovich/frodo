import type Gio from 'gi://Gio';
import type {accessors} from './frodo-settings.js';

export interface Accessor<K extends string, V> {
    readonly key: K;
    read(settings: Gio.Settings): V;
    write(settings: Gio.Settings, value: V): void;
}

type Accessors = typeof accessors;

export type SettingsKey = Accessors[keyof Accessors]['key'];

export type SettingsProperty = keyof Accessors;

export type SettingsValues = {[P in SettingsProperty]: Accessors[P] extends Accessor<string, infer V> ? V : never};
