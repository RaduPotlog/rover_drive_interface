import { createContext, useContext } from "react";

import type { AppConfig } from "./config";

export interface AppState {
    config: AppConfig;
    /**
     * This browser's joystick is on (the old Neutral/Manual switch). Local on purpose: the
     * rover's driving mode (useDriveMode) is shared by every browser, while arming is about the
     * one operator in front of this page, and drops back to off when the page is left.
     */
    armed: boolean;
    setArmed: (armed: boolean) => void;
}

export const AppContext = createContext<AppState | null>(null);

export const useApp = (): AppState => {
    const state = useContext(AppContext);
    if (!state) throw new Error("useApp outside AppContext");
    return state;
};
