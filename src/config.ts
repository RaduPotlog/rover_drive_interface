// Runtime configuration. nginx serves /config.json, rendered by docker/start.sh from the
// container environment, so one image works for any $ROVER_NAMESPACE.
import { AUX_COUNT, parseAuxNames } from "./lib/auxIo";
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
    /** Stick expo 0 (linear) .. 1 per axis; turning gets more, it is the twitchy one. */
    expoLinear: number;
    expoAngular: number;
    /** Operator names for aux outputs DIO00..05 and inputs DIO06..11; always AUX_COUNT each. */
    auxOutputNames: string[];
    auxInputNames: string[];
}

const DEFAULTS: AppConfig = {
    namespace: "/rover",
    robotName: "rover",
    maxLinear: 1.0,
    maxAngular: 1.0,
    maxRimSpeed: 1.7,
    trackWidth: 1.0204,
    expoLinear: 0.3,
    expoAngular: 0.5,
    auxOutputNames: parseAuxNames("", AUX_COUNT, "Output"),
    auxInputNames: parseAuxNames("", AUX_COUNT, "Input"),
};

const positive = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
const nonNegative = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
const unit = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;

export const parseConfig = (raw: Record<string, unknown>): AppConfig => ({
    namespace: typeof raw.namespace === "string" ? sanitizeNamespace(raw.namespace) : DEFAULTS.namespace,
    robotName: typeof raw.robotName === "string" && raw.robotName ? raw.robotName : DEFAULTS.robotName,
    maxLinear: positive(raw.maxLinear, DEFAULTS.maxLinear),
    maxAngular: positive(raw.maxAngular, DEFAULTS.maxAngular),
    maxRimSpeed: nonNegative(raw.maxRimSpeed, DEFAULTS.maxRimSpeed),
    trackWidth: positive(raw.trackWidth, DEFAULTS.trackWidth),
    expoLinear: unit(raw.expoLinear, DEFAULTS.expoLinear),
    expoAngular: unit(raw.expoAngular, DEFAULTS.expoAngular),
    auxOutputNames: parseAuxNames(raw.auxOutputNames, AUX_COUNT, "Output"),
    auxInputNames: parseAuxNames(raw.auxInputNames, AUX_COUNT, "Input"),
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
