import type { StickInput } from "./teleop";

// Standard-mapping gamepads (PS4/PS5/Xbox in Chrome and Firefox): left stick on axes 0/1,
// LB/L1 = button 4. The shoulder button is a deadman: the stick only counts while it is held.
export const DEADMAN_BUTTON = 4;

export interface PadSnapshot {
    axes: readonly number[];
    buttons: readonly { pressed: boolean }[];
}

/** Stick input from a pad, or null when the deadman is released (the pad is not driving). */
export const padToStick = (pad: PadSnapshot | null | undefined): StickInput | null => {
    if (!pad || !pad.buttons[DEADMAN_BUTTON]?.pressed) return null;
    return { x: pad.axes[0] ?? 0, y: -(pad.axes[1] ?? 0) };
};

export const firstPad = (): PadSnapshot | null => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
        if (pad && pad.connected) return pad;
    }
    return null;
};
