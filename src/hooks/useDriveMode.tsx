import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { useApp } from "../AppContext";
import { type DriveModeId, type DriveModeMsg, isDriveMode } from "../lib/driveMode";
import { nsName } from "../lib/namespace";
import { useRos } from "../ros/RosProvider";
import { useTopic } from "./useTopic";

interface SetDriveModeResponse { success: boolean; message: string; mode: number }

export interface DriveModeState {
    /** Latest rover_msgs/DriveMode, null until one arrives. */
    message: DriveModeMsg | null;
    /** The rover's mode, null while unknown. */
    mode: DriveModeId | null;
    /** A set_drive_mode call is in flight. */
    requesting: boolean;
    /** Why the last request was refused or failed. */
    error: string | null;
    requestMode: (mode: DriveModeId) => Promise<void>;
}

const DriveModeContext = createContext<DriveModeState | null>(null);

export const useDriveMode = (): DriveModeState => {
    const state = useContext(DriveModeContext);
    if (!state) throw new Error("useDriveMode outside DriveModeProvider");
    return state;
};

/**
 * The rover's driving mode, owned by rover_drive_mode on the orchestrator and shared by every
 * browser: drive_mode is latched, set_drive_mode changes it. The UI never assumes a mode it has
 * not been told, so a missing manager shows as "unknown" and every control that needs a mode
 * stays disabled.
 */
export const DriveModeProvider = ({ children }: { children: ReactNode }) => {
    const { config } = useApp();
    const { ros, connected } = useRos();
    const ns = config.namespace;
    const latest = useTopic<DriveModeMsg>(nsName(ns, "drive_mode"), "rover_msgs/msg/DriveMode");
    const [requesting, setRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requestMode = useCallback(async (mode: DriveModeId) => {
        if (!ros || !connected) {
            setError("Not connected");
            return;
        }
        setRequesting(true);
        setError(null);
        try {
            const res = await ros.callService<{ mode: number }, SetDriveModeResponse>(
                nsName(ns, "set_drive_mode"), { mode }, 5000);
            if (!res.success) setError(res.message);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setRequesting(false);
        }
    }, [ros, connected, ns]);

    const message = latest.message;
    const mode = message && isDriveMode(message.mode) ? message.mode : null;

    const value = useMemo<DriveModeState>(() => ({
        message, mode, requesting, error, requestMode,
    }), [message, mode, requesting, error, requestMode]);

    return <DriveModeContext.Provider value={value}>{children}</DriveModeContext.Provider>;
};
