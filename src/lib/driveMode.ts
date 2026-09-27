// The rover's driving mode (rover_drive_mode, rover_msgs/DriveMode) as the UI shows it.
import type { Header } from "./rosTypes";
import type { Level } from "./status";

export const DRIVE_MODE = {
    MANUAL: 1,
    ASSISTED: 2,
    AUTOMATIC: 3,
} as const;

export type DriveModeId = (typeof DRIVE_MODE)[keyof typeof DRIVE_MODE];

export const DRIVE_MODES: DriveModeId[] = [DRIVE_MODE.MANUAL, DRIVE_MODE.ASSISTED, DRIVE_MODE.AUTOMATIC];

/** State of the collision monitor guarding the active mode. */
export const GUARD = {
    BYPASSED: 0,
    CLEAR: 1,
    SLOWING: 2,
    STOPPED: 3,
    NO_DATA: 4,
} as const;

export interface DriveModeMsg {
    header: Header;
    mode: number;
    guard: number;
    reason: string;
}

export const DRIVE_MODE_LABEL: Record<number, string> = {
    [DRIVE_MODE.MANUAL]: "Manual",
    [DRIVE_MODE.ASSISTED]: "Assisted",
    [DRIVE_MODE.AUTOMATIC]: "Automatic",
};

export const DRIVE_MODE_DETAIL: Record<number, string> = {
    [DRIVE_MODE.MANUAL]: "Manual: the joystick drives the rover directly, with no obstacle check.",
    [DRIVE_MODE.ASSISTED]: "Assisted: you drive, the lidar slows the rover down and stops it in front of obstacles.",
    [DRIVE_MODE.AUTOMATIC]: "Automatic: the rover drives itself to Go to goals. Moving the joystick takes over.",
};

export const isDriveMode = (mode: number | null | undefined): mode is DriveModeId =>
    mode === DRIVE_MODE.MANUAL || mode === DRIVE_MODE.ASSISTED || mode === DRIVE_MODE.AUTOMATIC;

/** Go to and places send the rover somewhere; only AUTOMATIC lets Nav 2 drive. */
export const canGoTo = (mode: number | null | undefined): boolean => mode === DRIVE_MODE.AUTOMATIC;

export const goToBlockedReason = (mode: number | null | undefined): string | null =>
    mode === null || mode === undefined || !isDriveMode(mode)
        ? "Driving mode unknown - is rover_drive_mode running on the orchestrator?"
        : canGoTo(mode)
            ? null
            : "Switch to Automatic to send the rover somewhere";

export interface GuardStatus {
    level: Level;
    label: string;
    detail: string;
}

/** The guard chip: what the lidar is doing to the commands of the current mode. */
export const guardStatus = (msg: DriveModeMsg | null): GuardStatus => {
    if (!msg || !isDriveMode(msg.mode)) {
        return { level: "unknown", label: "Guard ?", detail: "No driving mode received" };
    }
    switch (msg.guard) {
        case GUARD.BYPASSED:
            return { level: "warn", label: "No obstacle check", detail: "Manual: the lidar does not stop the rover" };
        case GUARD.CLEAR:
            return { level: "ok", label: "Path clear", detail: "Nothing in the slow-down or stop zones" };
        case GUARD.SLOWING:
            return { level: "warn", label: "Slowing", detail: "Obstacle ahead - speed is reduced" };
        case GUARD.STOPPED:
            return { level: "error", label: "Obstacle - stopped", detail: "Obstacle in the stop zone - steer or back away from it" };
        case GUARD.NO_DATA:
        default:
            return {
                level: "error",
                label: "No lidar - stopped",
                detail: "The collision monitor has no lidar data or is not running, so the rover will not move. Switch to Manual to drive without it.",
            };
    }
};

/** Why the rover last changed mode, as shown under the selector. */
export const reasonText = (msg: DriveModeMsg | null): string | null => {
    if (!msg?.reason) return null;
    switch (msg.reason) {
        case "operator takeover":
            return "Joystick took over - the mission was cancelled.";
        case "mission manager lost":
            return "The mission manager stopped - Automatic was left.";
        default:
            return null;
    }
};
