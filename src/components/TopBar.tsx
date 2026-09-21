import { useApp } from "../AppContext";
import { useLatency } from "../hooks/useLatency";
import { useNow, useTopic } from "../hooks/useTopic";
import { nsName } from "../lib/namespace";
import {
    batteryPercent,
    type Level,
    type SafetyCommandEchoMsg,
    type SafetyStatusMsg,
    summarizeSafety,
    worstDiagnosticLevel,
} from "../lib/status";
import { useRos } from "../ros/RosProvider";
import { StatusChip } from "./StatusChip";

const STALE_MS = 3000;

const fresh = (receivedAt: number | null, now: number) => receivedAt !== null && now - receivedAt < STALE_MS;

export const TopBar = ({ children }: { children?: React.ReactNode }) => {
    const { config, driveMode } = useApp();
    const { connected } = useRos();
    const ns = config.namespace;
    const now = useNow(1000);
    const latency = useLatency();

    const battery = useTopic<{ percentage: number; voltage: number }>(
        nsName(ns, "rover_battery/battery_status"), "sensor_msgs/msg/BatteryState", 1000);
    const charging = useTopic<{ charging: boolean }>(
        nsName(ns, "rover_battery/charging_status"), "rover_msgs/msg/ChargingStatus", 1000);
    const safety = useTopic<SafetyStatusMsg>(
        nsName(ns, "hardware_interface/safety_status"), "rover_msgs/msg/SafetyStatus", 250);
    const echo = useTopic<SafetyCommandEchoMsg>(
        nsName(ns, "hardware_interface/safety_command_echo"), "rover_msgs/msg/SafetyCommandEcho", 250);
    const lock = useTopic<{ data: boolean }>(nsName(ns, "motion_lock"), "std_msgs/msg/Bool", 250);
    const diag = useTopic<{ status: { level: number }[] }>(
        nsName(ns, "diagnostics_agg"), "diagnostic_msgs/msg/DiagnosticArray", 1000);

    const safetySummary = summarizeSafety(
        fresh(safety.receivedAt, now) ? safety.message : null,
        fresh(echo.receivedAt, now) ? echo.message : null,
        fresh(lock.receivedAt, now) ? lock.message?.data ?? null : true, // stale lock = locked, like twist_mux
    );

    const pct = fresh(battery.receivedAt, now) ? batteryPercent(battery.message?.percentage) : null;
    const isCharging = fresh(charging.receivedAt, now) && charging.message?.charging;
    const batteryLevel: Level = pct === null ? "unknown" : pct < 15 ? "error" : pct < 30 ? "warn" : "ok";

    const diagLevel: Level = diag.message && fresh(diag.receivedAt, now)
        ? worstDiagnosticLevel(diag.message.status)
        : "unknown";

    const linkLevel: Level = !connected ? "error" : latency === null ? "unknown" : latency > 400 ? "warn" : "ok";

    return (
        <header className="topbar">
            <div className="topbar-left">
                <span className={`status-light status-${connected ? safetySummary.level : "error"}`} />
                <span className="robot-name">{config.robotName}</span>
                <StatusChip
                    level={driveMode === "manual" ? "warn" : "ok"}
                    label={driveMode === "manual" ? "MANUAL" : "NEUTRAL"}
                    title={driveMode === "manual" ? "Manual driving - the web UI owns the base" : "Neutral - the web UI is not driving"}
                />
                {children}
            </div>
            <div className="topbar-right">
                <StatusChip level={safetySummary.level} label={safetySummary.label} title={safetySummary.detail} icon="⛔" />
                <StatusChip level={diagLevel} label="Diag" title="Worst level in diagnostics_agg" icon="🩺" />
                <StatusChip
                    level={batteryLevel}
                    label={pct === null ? "—" : `${pct}%${isCharging ? " ⚡" : ""}`}
                    title={battery.message ? `${battery.message.voltage?.toFixed(1)} V` : "No battery_status"}
                    icon="🔋"
                />
                <StatusChip
                    level={linkLevel}
                    label={!connected ? "Offline" : latency === null ? "—" : `${latency} ms`}
                    title="Round trip to the rover through foxglove_bridge"
                    icon="📶"
                />
            </div>
        </header>
    );
};
