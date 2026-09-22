import type { ReactNode } from "react";
import {
    Activity,
    Battery,
    BatteryCharging,
    BatteryWarning,
    Crosshair,
    Gamepad2,
    Hand,
    OctagonX,
    ShieldAlert,
    ShieldCheck,
    Wifi,
    WifiOff,
} from "lucide-react";

import { useApp } from "../AppContext";
import { useLatency } from "../hooks/useLatency";
import { useNow, useTopic } from "../hooks/useTopic";
import type { Quality } from "../lib/locQuality";
import { nsName } from "../lib/namespace";
import { batteryPercent, type Level, type SafetySummary, worstDiagnosticLevel } from "../lib/status";
import { useRos } from "../ros/RosProvider";
import { TriggerButton } from "./TriggerButton";

const STALE_MS = 3000;
const ICON = 18;

const fresh = (receivedAt: number | null, now: number) => receivedAt !== null && now - receivedAt < STALE_MS;

export const Pill = ({ level, icon, label, value, title, children }: {
    level: Level;
    icon: ReactNode;
    label: string;
    value: ReactNode;
    title?: string;
    children?: ReactNode;
}) => (
    <div className={`pill pill-${level}`} title={title}>
        <span className="pill-icon">{icon}</span>
        <span className="pill-text">
            <span className="pill-label">{label}</span>
            <span className="pill-value">{value}</span>
        </span>
        {children}
    </div>
);

export interface LocalizationStatus {
    /** Mode label from rover_indoor_nav_manager ("Localized · lab", "Mapping", ...), if running. */
    mode: string | null;
    modeLevel: Level;
    modeDetail?: string;
    /** Scan-to-map quality; null while not localizing on a saved map. */
    quality: Quality | null;
}

const QUALITY_LEVEL: Record<Quality["level"], Level> = { good: "ok", fair: "warn", poor: "error", unknown: "unknown" };

export const TopBar = ({ localization, safety: safetySummary }: { localization: LocalizationStatus; safety: SafetySummary }) => {
    const { config, driveMode } = useApp();
    const { connected } = useRos();
    const ns = config.namespace;
    const now = useNow(1000);
    const latency = useLatency();

    const battery = useTopic<{ percentage: number; voltage: number }>(
        nsName(ns, "rover_battery/battery_status"), "sensor_msgs/msg/BatteryState", 1000);
    const charging = useTopic<{ charging: boolean }>(
        nsName(ns, "rover_battery/charging_status"), "rover_msgs/msg/ChargingStatus", 1000);
    const diag = useTopic<{ status: { level: number }[] }>(
        nsName(ns, "diagnostics_agg"), "diagnostic_msgs/msg/DiagnosticArray", 1000);

    const pct = fresh(battery.receivedAt, now) ? batteryPercent(battery.message?.percentage) : null;
    const isCharging = Boolean(fresh(charging.receivedAt, now) && charging.message?.charging);
    const batteryLevel: Level = pct === null ? "unknown" : pct < 15 ? "error" : pct < 30 ? "warn" : "ok";
    const BatteryIcon = isCharging ? BatteryCharging : batteryLevel === "error" ? BatteryWarning : Battery;

    const diagLevel: Level = diag.message && fresh(diag.receivedAt, now)
        ? worstDiagnosticLevel(diag.message.status)
        : "unknown";
    const diagText: Record<Level, string> = { ok: "OK", warn: "Warning", error: "Error", stale: "Stale", unknown: "—" };

    const linkLevel: Level = !connected ? "error" : latency === null ? "unknown" : latency > 400 ? "warn" : "ok";
    const q = localization.quality;

    return (
        <header className="topbar">
            <div className="brand">
                <img className="brand-logo" src="logo.png" alt="Mechatronics Academy" />
                <div className="brand-text">
                    <span className="brand-name">{config.robotName}</span>
                    <span className="brand-sub">Drive interface</span>
                </div>
                <span className={`mode-badge ${driveMode === "manual" ? "manual" : ""}`}
                    title={driveMode === "manual" ? "Manual driving - the web UI owns the base" : "Neutral - the web UI is not driving"}>
                    {driveMode === "manual" ? <Gamepad2 size={14} /> : <Hand size={14} />}
                    {driveMode === "manual" ? "MANUAL" : "NEUTRAL"}
                </span>
            </div>

            <div className="topbar-right">
            <div className="status-strip">
                {localization.mode !== null && (
                    <Pill
                        level={q ? QUALITY_LEVEL[q.level] : localization.modeLevel}
                        icon={<Crosshair size={ICON} />}
                        label="Localization"
                        value={q ? `${q.label}${q.percent !== null ? ` · ${q.percent}%` : ""}` : localization.mode}
                        title={[localization.mode, q?.detail, localization.modeDetail].filter(Boolean).join("\n")}
                    />
                )}
                <Pill
                    level={connected ? safetySummary.level : "unknown"}
                    icon={safetySummary.level === "ok" ? <ShieldCheck size={ICON} /> : <ShieldAlert size={ICON} />}
                    label="Safety"
                    value={connected ? safetySummary.label : "—"}
                    title={safetySummary.detail}
                />
                <Pill level={diagLevel} icon={<Activity size={ICON} />} label="Diagnostics" value={diagText[diagLevel]}
                    title="Worst level in diagnostics_agg" />
                <Pill
                    level={batteryLevel}
                    icon={<BatteryIcon size={ICON} />}
                    label={isCharging ? "Charging" : "Battery"}
                    value={pct === null ? "—" : `${pct}%`}
                    title={battery.message ? `${battery.message.voltage?.toFixed(1)} V` : "No battery_status"}
                >
                    {pct !== null && <span className="battery-bar"><span className="battery-fill" style={{ width: `${pct}%` }} /></span>}
                </Pill>
                <Pill
                    level={linkLevel}
                    icon={connected ? <Wifi size={ICON} /> : <WifiOff size={ICON} />}
                    label="Link"
                    value={!connected ? "Offline" : latency === null ? "—" : `${latency} ms`}
                    title="Round trip to the rover through foxglove_bridge"
                />
            </div>
            {/* On every tab, outside the scrolling strip: a stop must never be one tab away. */}
            <TriggerButton
                service={nsName(ns, "hardware_interface/sw_user_e_stop_set")}
                label="E-STOP"
                icon={<OctagonX size={18} />}
                className="btn btn-estop-top"
                disabled={!connected}
                title="Software e-stop: cuts the motor contactor (no confirmation)"
            />
            </div>
        </header>
    );
};
