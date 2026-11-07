/**
 * Window-level app events.
 *
 * The constructor is taken from `window` (not the bare global) so the event is
 * created in the same realm as the listeners — plain `new Event(...)` throws
 * "parameter 1 is not of type 'Event'" inside jsdom-style test environments.
 */
export function fireWindowEvent(name: string, detail?: unknown) {
  const w = window as Window & { CustomEvent?: typeof CustomEvent };
  const Ctor = w.CustomEvent ?? CustomEvent;
  w.dispatchEvent(detail === undefined ? new Ctor(name) : new Ctor(name, { detail }));
}

/** Opens the new-project modal from anywhere (sidebar button, pipeline CTA). */
export const requestNewProject = () => fireWindowEvent('cp-new-project');

/** Ask the Settings page to jump to a specific card (used when it is already open). */
export const requestSettingsSection = (id: string) => fireWindowEvent('cp-settings-section', id);
