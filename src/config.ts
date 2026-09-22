// Runtime configuration. nginx serves /config.json, rendered by docker/start.sh from the
// container environment, so one image works for any $ROVER_NAMESPACE.
import { sanitizeNamespace } from "./lib/namespace";

export interface AppConfig {
    namespace: string;
    robotName: string;
    maxLinear: number;
    maxAngular: number;
    /** Outer-wheel rim speed budget [m/s], as rover_crsf_teleop's max_wheel_rim_speed; 0 = off. */
    maxRimSpeed: number;
    /** rover_crsf_teleop's effective_track_width [m]. */
    trackWidth: number;
}

const DEFAULTS: AppConfig = {
    namespace: "/rover",
    robotName: "rover",
    maxLinear: 1.0,
    maxAngular: 1.0,
    maxRimSpeed: 1.7,
    trackWidth: 1.0204,
};

const positive = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
const nonNegative = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;

export const parseConfig = (raw: Record<string, unknown>): AppConfig => ({
    namespace: typeof raw.namespace === "string" ? sanitizeNamespace(raw.namespace) : DEFAULTS.namespace,
    robotName: typeof raw.robotName === "string" && raw.robotName ? raw.robotName : DEFAULTS.robotName,
    maxLinear: positive(raw.maxLinear, DEFAULTS.maxLinear),
    maxAngular: positive(raw.maxAngular, DEFAULTS.maxAngular),
    maxRimSpeed: nonNegative(raw.maxRimSpeed, DEFAULTS.maxRimSpeed),
    trackWidth: positive(raw.trackWidth, DEFAULTS.trackWidth),
});

export const loadConfig = async (): Promise<AppConfig> => {
    try {
        const response = await fetch("config.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseConfig(await response.json());
    } catch (error) {
        console.warn("config.json unavailable, using defaults:", error);
        return DEFAULTS;
    }
};
