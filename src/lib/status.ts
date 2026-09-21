// Turning raw status messages into what the top bar shows.

export type Level = "ok" | "warn" | "error" | "stale" | "unknown";

// diagnostic_msgs/DiagnosticStatus levels.
const DIAG_LEVEL: Record<number, Level> = { 0: "ok", 1: "warn", 2: "error", 3: "stale" };

export const worstDiagnosticLevel = (statuses: { level: number }[]): Level => {
    if (statuses.length === 0) return "unknown";
    let worst = 0;
    for (const s of statuses) {
        // STALE (3) ranks between WARN and ERROR for the operator: something stopped reporting.
        const rank = s.level === 2 ? 3 : s.level === 3 ? 2 : s.level;
        worst = Math.max(worst, rank);
    }
    return worst === 3 ? "error" : worst === 2 ? "stale" : DIAG_LEVEL[worst] ?? "unknown";
};

/** sensor_msgs/BatteryState.percentage is 0..1 (NaN when unmeasured); returns 0..100 or null. */
export const batteryPercent = (percentage: number | undefined): number | null => {
    if (percentage === undefined || !Number.isFinite(percentage)) return null;
    const pct = percentage <= 1 ? percentage * 100 : percentage;
    return Math.round(Math.min(100, Math.max(0, pct)));
};

export interface SafetyStatusMsg {
    hw_e_stop_user_button: boolean;
    motor_contactor_engaged: boolean;
    latch_active: boolean;
    latch_cause: number;
    link_healthy: boolean;
}

export interface SafetyCommandEchoMsg {
    sw_e_stop_user_button: boolean;
    sw_e_stop_motor_driver_fault: boolean;
}

export const LATCH_CAUSES: Record<number, string> = {
    0: "unknown",
    1: "software e-stop",
    2: "motor driver fault",
    3: "CPU watchdog",
    4: "hardware e-stop button",
};

export interface SafetySummary {
    level: Level;
    label: string;
    detail: string;
}

export const summarizeSafety = (
    status: SafetyStatusMsg | null,
    echo: SafetyCommandEchoMsg | null,
    motionLock: boolean | null,
): SafetySummary => {
    if (!status) {
        return { level: "unknown", label: "Safety ?", detail: "No safety_status received" };
    }
    if (!status.link_healthy) {
        return { level: "error", label: "IO link down", detail: "Safety IO link is not healthy" };
    }
    if (status.hw_e_stop_user_button) {
        return { level: "error", label: "E-STOP (HW)", detail: "Hardware e-stop button pressed" };
    }
    if (echo?.sw_e_stop_user_button) {
        return { level: "error", label: "E-STOP (SW)", detail: "Software e-stop is set" };
    }
    if (echo?.sw_e_stop_motor_driver_fault) {
        return { level: "error", label: "Driver fault", detail: "Motor driver fault e-stop" };
    }
    if (status.latch_active) {
        const cause = LATCH_CAUSES[status.latch_cause] ?? "unknown";
        return { level: "warn", label: "Latched", detail: `Safety latch active (${cause}) - reset the latch to drive` };
    }
    if (motionLock) {
        return { level: "warn", label: "Motion locked", detail: "motion_lock is engaged" };
    }
    if (!status.motor_contactor_engaged) {
        return { level: "warn", label: "Contactor open", detail: "Motor contactor not engaged" };
    }
    return { level: "ok", label: "Ready", detail: "No e-stop, latch or motion lock" };
};
