// Visibility of the map drive widget. Kept free of React so the rules can be unit tested.

export type WidgetState = "hidden" | "collapsed" | "expanded";

/** The Drive tab has the full joystick, so the map widget is only on the other tabs. */
export const driveWidgetState = (tab: string, collapsed: boolean): WidgetState =>
    tab === "drive" ? "hidden" : collapsed ? "collapsed" : "expanded";

/**
 * Starting to map opens the widget: covering the area means driving, and without the RC
 * transmitter the map joystick is the only way to do it. Otherwise the viewer's choice stands.
 */
export const collapsedAfterModeChange = (collapsed: boolean, wasMapping: boolean, mapping: boolean): boolean =>
    mapping && !wasMapping ? false : collapsed;
