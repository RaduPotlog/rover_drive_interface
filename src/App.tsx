import { useMemo, useState } from "react";

import { AppContext, type DriveMode } from "./AppContext";
import type { AppConfig } from "./config";
import { DrivePanel } from "./components/DrivePanel";
import { EStopPanel } from "./components/EStopPanel";
import { TopBar } from "./components/TopBar";
import { RosProvider } from "./ros/RosProvider";

type Tab = "drive";

export const App = ({ config }: { config: AppConfig }) => {
    const [driveMode, setDriveMode] = useState<DriveMode>("neutral");
    const [tab, setTab] = useState<Tab>("drive");
    const state = useMemo(() => ({ config, driveMode, setDriveMode }), [config, driveMode]);

    return (
        <RosProvider>
            <AppContext.Provider value={state}>
                <div className="app">
                    <TopBar />
                    <main className="workspace">
                        <div className="map-area">
                            <div className="map-placeholder">Map view</div>
                        </div>
                        <aside className="sidebar">
                            <nav className="tabs">
                                <button className={`tab ${tab === "drive" ? "tab-active" : ""}`} onClick={() => setTab("drive")}>
                                    Drive
                                </button>
                            </nav>
                            {tab === "drive" && (
                                <>
                                    <DrivePanel />
                                    <EStopPanel />
                                </>
                            )}
                        </aside>
                    </main>
                </div>
            </AppContext.Provider>
        </RosProvider>
    );
};
