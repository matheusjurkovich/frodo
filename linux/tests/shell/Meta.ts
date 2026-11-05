export const prefs = {dynamicWorkspaces: true};

export default {
    prefs_get_dynamic_workspaces: (): boolean => prefs.dynamicWorkspaces,
};
