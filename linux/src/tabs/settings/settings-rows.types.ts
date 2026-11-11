import type Gio from 'gi://Gio';
import type {SettingsKey, SettingsProperty, SettingsValues} from '../../settings/frodo-settings.types.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';

export interface Range {
    readonly min: number;
    readonly max: number;
}

export type SettingsSection = Component;

export interface InterfaceFlag {
    readonly settings: Gio.Settings;
    readonly key: string;
}

export type Watch = readonly SettingsKey[] | InterfaceFlag;

type PropertyOf<V> = {[P in SettingsProperty]: SettingsValues[P] extends V ? P : never}[SettingsProperty];

export type BooleanProperty = PropertyOf<boolean>;
export type NumberProperty = PropertyOf<number>;
export type StringProperty = PropertyOf<string>;

export interface NumberOption {
    readonly id: number;
    readonly label: string;
}
