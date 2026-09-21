import { useCallback, useMemo, useState } from "react";

import { AppContext, type DriveMode, useApp } from "./AppContext";
import type { AppConfig } from "./config";
import { DrivePanel } from "./components/DrivePanel";
import { EStopPanel } from "./components/EStopPanel";
import { MapToolbar } from "./components/MapToolbar";
import { type MapTool, MapView } from "./components/MapView";
import { isActive, NavPanel } from "./components/NavPanel";
import { PendingBar } from "./components/PendingBar";
import { TopBar } from "./components/TopBar";
import { useNavigation } from "./hooks/useNavigation";
import type { Pose2D } from "./lib/geometry";
import { nsFrame } from "./lib/namespace";
import { RosProvider, useRos } from "./ros/RosProvider";

type Tab = "drive" | "navigate";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const Workspace = () => {
    const { config, driveMode, setDriveMode } = useApp();
    const { connected } = useRos();
    const nav = useNavigation();
    const [tab, setTab] = useState<Tab>("drive");
    const [tool, setTool] = useState<MapTool>("pan");
    const [pending, setPending] = useState<{ tool: MapTool; pose: Pose2D } | null>(null);
    const [busy, setBusy] = useState(false);
    const [pendingError, setPendingError] = useState<string | null>(null);
    const [stopError, setStopError] = useState<string | null>(null);
    const [follow, setFollow] = useState(false);
    const [showCostmap, setShowCostmap] = useState(false);
    const [robotPose, setRobotPose] = useState<Pose2D | null>(null);
    const [mapFrame, setMapFrame] = useState<string | null>(null);
    const frame = mapFrame ?? nsFrame(config.namespace, "map");

    const disabledTools: Partial<Record<MapTool, string>> = {};
    if (!connected) {
        disabledTools.setPose = disabledTools.goTo = disabledTools.place = "Not connected";
    }
    if (driveMode === "manual") disabledTools.goTo = "Switch to Neutral first - manual driving owns the base";
    disabledTools.place = disabledTools.place ?? "Places arrive with rover_indoor_nav_manager";

    const onPoseDrawn = useCallback((t: MapTool, pose: Pose2D) => {
        setPendingError(null);
        setPending({ tool: t, pose });
    }, []);

    const confirm = async () => {
        if (!pending) return;
        setBusy(true);
        setPendingError(null);
        try {
            if (pending.tool === "goTo") {
                await nav.runMission(frame, [pending.pose], "goto");
                setTab("navigate");
            } else if (pending.tool === "setPose") {
                nav.setInitialPose(frame, pending.pose);
            }
            setPending(null);
            setTool("pan");
        } catch (e) {
            setPendingError(errorText(e));
        } finally {
            setBusy(false);
        }
    };

    const stop = async () => {
        setStopError(null);
        try {
            await nav.stop();
        } catch (e) {
            setStopError(errorText(e));
        }
    };

    // Manual and autonomous driving are exclusive (as in IndoorNav): taking manual control
    // cancels the mission instead of letting Nav 2 fight the operator and time out.
    const guardedSetDriveMode = useCallback((mode: DriveMode) => {
        if (mode === "manual" && isActive(nav.mission)) {
            nav.stop().catch((e) => setStopError(errorText(e)));
        }
        setDriveMode(mode);
    }, [nav, setDriveMode]);

    return (
        <AppContext.Provider value={{ config, driveMode, setDriveMode: guardedSetDriveMode }}>
            <div className="app">
                <TopBar />
                <main className="workspace">
                    <div className="map-area">
                        <MapView
                            tool={tool}
                            onPoseDrawn={onPoseDrawn}
                            pending={pending}
                            markers={[]}
                            showCostmap={showCostmap}
                            follow={follow}
                            onRobotPose={setRobotPose}
                            onMapFrame={setMapFrame}
                        />
                        <MapToolbar
                            tool={tool}
                            setTool={(t) => { setTool(t); setPending(null) }}
                            disabledTools={disabledTools}
                            follow={follow}
                            setFollow={setFollow}
                            showCostmap={showCostmap}
                            setShowCostmap={setShowCostmap}
                        />
                        {pending && (
                            <PendingBar
                                tool={pending.tool}
                                pose={pending.pose}
                                busy={busy}
                                error={pendingError}
                                onConfirm={confirm}
                                onCancel={() => setPending(null)}
                            />
                        )}
                    </div>
                    <aside className="sidebar">
                        <nav className="tabs">
                            <button className={`tab ${tab === "drive" ? "tab-active" : ""}`} onClick={() => setTab("drive")}>Drive</button>
                            <button className={`tab ${tab === "navigate" ? "tab-active" : ""}`} onClick={() => setTab("navigate")}>Navigate</button>
                        </nav>
                        {tab === "drive" && (
                            <>
                                <DrivePanel />
                                <EStopPanel />
                            </>
                        )}
                        {tab === "navigate" && (
                            <NavPanel mission={nav.mission} robotPose={robotPose} onStop={stop} stopError={stopError} />
                        )}
                    </aside>
                </main>
            </div>
        </AppContext.Provider>
    );
};

export const App = ({ config }: { config: AppConfig }) => {
    const [driveMode, setDriveMode] = useState<DriveMode>("neutral");
    // Raw drive mode here; Workspace re-provides it with the mission-cancelling guard.
    const state = useMemo(() => ({ config, driveMode, setDriveMode }), [config, driveMode]);
    return (
        <RosProvider>
            <AppContext.Provider value={state}>
                <Workspace />
            </AppContext.Provider>
        </RosProvider>
    );
};
