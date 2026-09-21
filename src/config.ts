// Runtime configuration. nginx serves /config.json, rendered by docker/start.sh from the
// container environment, so one image works for any $ROVER_NAMESPACE.
import { sanitizeNamespace } from "./lib/namespace";

export interface AppConfig {
    namespace: string;
    robotName: string;
    maxLinear: number;
    maxAngular: number;
}

const DEFAULTS: AppConfig = {
    namespace: "/rover",
    robotName: "rover",
    maxLinear: 1.0,
    maxAngular: 1.0,
};

const positive = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;

export const parseConfig = (raw: Record<string, unknown>): AppConfig => ({
    namespace: typeof raw.namespace === "string" ? sanitizeNamespace(raw.namespace) : DEFAULTS.namespace,
    robotName: typeof raw.robotName === "string" && raw.robotName ? raw.robotName : DEFAULTS.robotName,
    maxLinear: positive(raw.maxLinear, DEFAULTS.maxLinear),
    maxAngular: positive(raw.maxAngular, DEFAULTS.maxAngular),
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
