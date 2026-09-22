import { useApp } from "../AppContext";
import { nsName } from "../lib/namespace";
import { type SafetyCommandEchoMsg, type SafetyStatusMsg, type SafetySummary, summarizeSafety } from "../lib/status";
import { useNow, useTopic } from "./useTopic";

const STALE_MS = 3000;
const fresh = (receivedAt: number | null, now: number) => receivedAt !== null && now - receivedAt < STALE_MS;

/**
 * E-stop, latch, contactor and motion_lock in one summary. Subscribed once in the workspace and
 * handed to the top bar and the map drive widget.
 */
export const useSafetySummary = (): SafetySummary => {
    const { config } = useApp();
    const ns = config.namespace;
    const now = useNow(1000);
    const safety = useTopic<SafetyStatusMsg>(
        nsName(ns, "hardware_interface/safety_status"), "rover_msgs/msg/SafetyStatus", 250);
    const echo = useTopic<SafetyCommandEchoMsg>(
        nsName(ns, "hardware_interface/safety_command_echo"), "rover_msgs/msg/SafetyCommandEcho", 250);
    const lock = useTopic<{ data: boolean }>(nsName(ns, "motion_lock"), "std_msgs/msg/Bool", 250);
    return summarizeSafety(
        fresh(safety.receivedAt, now) ? safety.message : null,
        fresh(echo.receivedAt, now) ? echo.message : null,
        fresh(lock.receivedAt, now) ? lock.message?.data ?? null : true, // stale lock = locked, like twist_mux
    );
};
