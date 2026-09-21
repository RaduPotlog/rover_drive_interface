import { useCallback, useMemo, useState } from "react";

import { AppContext, type DriveMode, useApp } from "./AppContext";
import type { AppConfig } from "./config";
import { DrivePanel } from "./components/DrivePanel";
import { EStopPanel } from "./components/EStopPanel";
import { FacilityPanel } from "./components/FacilityPanel";
import { MapToolbar } from "./components/MapToolbar";
import { type MapTool, MapView } from "./components/MapView";
import { isActive, NavPanel } from "./components/NavPanel";
import { PendingBar } from "./components/PendingBar";
import { PlacesPanel } from "./components/PlacesPanel";
import { StatusChip } from "./components/StatusChip";
import { TopBar } from "./components/TopBar";
import { useIndoorNav } from "./hooks/useIndoorNav";
import { useNavigation } from "./hooks/useNavigation";
import type { Pose2D } from "./lib/geometry";
import { nsFrame } from "./lib/namespace";
import { LOCALIZATION_LABEL, LOCALIZATION_MODE, type PlaceMsg } from "./lib/rosTypes";
import { RosProvider, useRos } from "./ros/RosProvider";

type Tab = "drive" | "navigate" | "facility";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const Workspace = () => {
    const { config, driveMode, setDriveMode } = useApp();
    const { connected } = useRos();
    const nav = useNavigation();
    const indoor = useIndoorNav();
    const [highlighted, setHighlighted] = useState<string | null>(null);
    // The URL hash selects the tab (#drive, #navigate, #facility), so a tab can be bookmarked.
    const [tab, setTabState] = useState<Tab>(() => {
        const hash = window.location.hash.replace("#", "");
        return hash === "navigate" || hash === "facility" ? hash : "drive";
    });
    const setTab = useCallback((t: Tab) => {
        setTabState(t);
        window.history.replaceState(null, "", `#${t}`);
    }, []);
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
    const locMode = indoor.state?.mode;
    if (!indoor.available) {
        disabledTools.place = disabledTools.place ?? "Places need rover_indoor_nav_manager (indoor mode)";
    } else if (locMode !== LOCALIZATION_MODE.LOCALIZATION) {
        // AMCL only runs on a loaded map; while mapping, SLAM owns the pose.
        const why = locMode === LOCALIZATION_MODE.MAPPING ? "Not while mapping - load a saved map first" : "Load a map first";
        disabledTools.place = disabledTools.place ?? why;
        disabledTools.setPose = disabledTools.setPose ?? why;
    }

    const markers = indoor.places.map((p) => ({
        id: p.id,
        label: p.name,
        pose: { x: p.x, y: p.y, theta: p.theta },
        highlighted: p.id === highlighted,
    }));

    const goToPlaces = async (steps: PlaceMsg[], label: string) => {
        await nav.runMission(frame, steps.map((p) => ({ x: p.x, y: p.y, theta: p.theta })), label);
    };

    const onPoseDrawn = useCallback((t: MapTool, pose: Pose2D) => {
        setPendingError(null);
        setPending({ tool: t, pose });
    }, []);

    const confirm = async (placeName = "") => {
        if (!pending) return;
        setBusy(true);
        setPendingError(null);
        try {
            if (pending.tool === "goTo") {
                await nav.runMission(frame, [pending.pose], "goto");
                setTab("navigate");
            } else if (pending.tool === "setPose") {
                nav.setInitialPose(frame, pending.pose);
            } else if (pending.tool === "place") {
                const name = placeName.trim();
                await indoor.savePlace({ id: "", name, x: pending.pose.x, y: pending.pose.y, theta: pending.pose.theta });
                setTab("navigate");
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
                <TopBar>
                    {indoor.available && (
                        <StatusChip
                            level={locMode === LOCALIZATION_MODE.LOCALIZATION ? "ok" : locMode === LOCALIZATION_MODE.MAPPING ? "warn" : locMode === LOCALIZATION_MODE.SWITCHING ? "stale" : "error"}
                            label={`${LOCALIZATION_LABEL[locMode ?? 0]}${indoor.state?.map_name ? ` · ${indoor.state.map_name}` : ""}`}
                            title={indoor.state?.message}
                            icon="🗺"
                        />
                    )}
                </TopBar>
                <main className="workspace">
                    <div className="map-area">
                        <MapView
                            tool={tool}
                            onPoseDrawn={onPoseDrawn}
                            pending={pending}
                            markers={markers}
                            onMarkerClick={(id) => { setHighlighted(id); setTab("navigate") }}
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
                            <button className={`tab ${tab === "facility" ? "tab-active" : ""}`} onClick={() => setTab("facility")}>Facility</button>
                        </nav>
                        {tab === "drive" && (
                            <>
                                <DrivePanel />
                                <EStopPanel />
                            </>
                        )}
                        {tab === "navigate" && (
                            <>
                                <NavPanel mission={nav.mission} robotPose={robotPose} onStop={stop} stopError={stopError} />
                                <PlacesPanel
                                    indoor={indoor}
                                    robotPose={robotPose}
                                    onGo={goToPlaces}
                                    highlighted={highlighted}
                                    setHighlighted={setHighlighted}
                                />
                            </>
                        )}
                        {tab === "facility" && <FacilityPanel indoor={indoor} robotPose={robotPose} />}
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
