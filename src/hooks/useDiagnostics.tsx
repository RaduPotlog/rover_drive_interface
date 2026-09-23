import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useApp } from "../AppContext";
import {
    type DiagnosticArrayMsg,
    type DiagnosticsSnapshot,
    type DiagnosticStatusMsg,
    pushSnapshot,
    snapshotFromMessage,
} from "../lib/diagnostics";
import { nsName } from "../lib/namespace";
import { useRos } from "../ros/RosProvider";
import { useSubscriptionRef } from "./useSubscriptionRef";

/** The aggregator publishes at 1 Hz; after this long with nothing, the history is worthless. */
const SILENCE_MS = 5000;

export interface DiagnosticsState {
    /** Newest snapshot, or null before the first message. */
    latest: DiagnosticsSnapshot | null;
    /** Raw statuses of the newest message - what the top-bar pill ranks. */
    latestStatuses: DiagnosticStatusMsg[];
    receivedAt: number | null;
    /** Up to HISTORY_SIZE snapshots, oldest first. Kept while the popup is closed. */
    history: DiagnosticsSnapshot[];
    /** While paused, new messages stop being appended (the popup is scrubbing). */
    paused: boolean;
    setPaused: (paused: boolean) => void;
    clearHistory: () => void;
}

const EMPTY: DiagnosticsState = {
    latest: null,
    latestStatuses: [],
    receivedAt: null,
    history: [],
    paused: false,
    setPaused: () => {},
    clearHistory: () => {},
};

const DiagnosticsContext = createContext<DiagnosticsState>(EMPTY);

export const useDiagnostics = () => useContext(DiagnosticsContext);

/**
 * One subscription to diagnostics_agg for the whole page, feeding both the top-bar pill and
 * the diagnostics popup.
 *
 * It lives here rather than in the popup for two reasons: two subscribers would make the
 * bridge send the same topic twice and could show the pill a different snapshot than the
 * table; and the timeline has to be full the moment the popup opens, which means the history
 * must accumulate while it is closed. It subscribes without a throttle because every message
 * is one timeline step - `useTopic`'s coalescing would silently drop snapshots.
 */
export const DiagnosticsProvider = ({ children }: { children: ReactNode }) => {
    const { config } = useApp();
    const { ros, connected, session } = useRos();
    const topic = nsName(config.namespace, "diagnostics_agg");

    const [latest, setLatest] = useState<DiagnosticsSnapshot | null>(null);
    const [latestStatuses, setLatestStatuses] = useState<DiagnosticStatusMsg[]>([]);
    const [receivedAt, setReceivedAt] = useState<number | null>(null);
    const [history, setHistory] = useState<DiagnosticsSnapshot[]>([]);
    const [paused, setPaused] = useState(false);

    // Read inside the subscription callback, which must not change identity per render.
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const silenceTimer = useRef<ReturnType<typeof setTimeout>>();

    const clearHistory = useCallback(() => setHistory([]), []);

    const reset = useCallback(() => {
        setLatest(null);
        setLatestStatuses([]);
        setReceivedAt(null);
        setHistory([]);
    }, []);

    useSubscriptionRef<DiagnosticArrayMsg>(topic, "diagnostic_msgs/msg/DiagnosticArray", (message) => {
        if (!Array.isArray(message?.status)) return;
        const now = Date.now();
        const snapshot = snapshotFromMessage(message, now);

        setLatest(snapshot);
        setLatestStatuses(message.status);
        setReceivedAt(now);
        // Scrubbing freezes the strip, as in the Cockpit page: the operator is reading a
        // snapshot and the steps under the cursor must not shift.
        if (!pausedRef.current) setHistory((prev) => pushSnapshot(prev, snapshot));

        clearTimeout(silenceTimer.current);
        silenceTimer.current = setTimeout(reset, SILENCE_MS);
    });

    // Whatever we hold belongs to the previous bridge session (or namespace).
    useEffect(() => {
        reset();
        return () => clearTimeout(silenceTimer.current);
    }, [ros, connected, session, topic, reset]);

    return (
        <DiagnosticsContext.Provider
            value={{ latest, latestStatuses, receivedAt, history, paused, setPaused, clearHistory }}
        >
            {children}
        </DiagnosticsContext.Provider>
    );
};
