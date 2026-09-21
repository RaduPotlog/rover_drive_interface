import { createContext, useContext } from "react";

import type { AppConfig } from "./config";

export type DriveMode = "neutral" | "manual";

export interface AppState {
    config: AppConfig;
    driveMode: DriveMode;
    setDriveMode: (mode: DriveMode) => void;
}

export const AppContext = createContext<AppState | null>(null);

export const useApp = (): AppState => {
    const state = useContext(AppContext);
    if (!state) throw new Error("useApp outside AppContext");
    return state;
};
