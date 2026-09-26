import { Building2, Gamepad2, Navigation } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppContext, type DriveMode, useApp } from "./AppContext";
import type { AppConfig } from "./config";
import { DrivePanel } from "./components/DrivePanel";
import { EStopPanel } from "./components/EStopPanel";
import { FacilityPanel } from "./components/FacilityPanel";
import { MapDriveWidget } from "./components/MapDriveWidget";
import { MapToolbar } from "./components/MapToolbar";
import { type MapTool, MapView } from "./components/MapView";
import { isActive, NavPanel } from "./components/NavPanel";
import { PendingBar } from "./components/PendingBar";
import { PlacesPanel } from "./components/PlacesPanel";
import { type LocalizationStatus, TopBar } from "./components/TopBar";
import { DiagnosticsProvider } from "./hooks/useDiagnostics";
import { useIndoorNav } from "./hooks/useIndoorNav";
import { useLocalizationQuality } from "./hooks/useLocalizationQuality";
import { useNavigation } from "./hooks/useNavigation";
import { useSafetySummary } from "./hooks/useSafety";
import { TeleopProvider } from "./hooks/useTeleop";
import type { Pose2D } from "./lib/geometry";
import { type MapSummary, sameMapSummary } from "./lib/occupancyGrid";
import { nsFrame } from "./lib/namespace";
import { LOCALIZATION_LABEL, LOCALIZATION_MODE, type PlaceMsg } from "./lib/rosTypes";
import type { Level } from "./lib/status";
import { sameViewFrame, VIEW_FRAME_MODES, type ViewFrame, type ViewFrameMode } from "./lib/viewFrame";
import { RosProvider, useRos } from "./ros/RosProvider";

type Tab = "drive" | "navigate" | "facility";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const FRAME_MODE_KEY = "map.frameMode";

const loadFrameMode = (): ViewFrameMode => {
    try {
        const v = localStorage.getItem(FRAME_MODE_KEY) as ViewFrameMode | null;
        return v && VIEW_FRAME_MODES.includes(v) ? v : "auto";
    } catch {
        return "auto";
    }
};

const Workspace = () => {
    const { config, driveMode, setDriveMode } = useApp();
    const { connected } = useRos();
    const nav = useNavigation();
    const indoor = useIndoorNav();
    const safety = useSafetySummary();
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
    const [follow, setFollowState] = useState(false);
    const [headingUp, setHeadingUpState] = useState(false);
    // Heading up needs the rover centred, so it brings Follow with it; dropping Follow ends it.
    const setFollow = (v: boolean) => {
        setFollowState(v);
        if (!v) setHeadingUpState(false);
    };
    const setHeadingUp = (v: boolean) => {
        setHeadingUpState(v);
        if (v) setFollowState(true);
    };
    const [showCostmap, setShowCostmap] = useState(false);
    const [robotPose, setRobotPose] = useState<Pose2D | null>(null);
    const [mapFrame, setMapFrame] = useState<string | null>(null);
    const [mapInfo, setMapInfoState] = useState<MapSummary | null>(null);
    // The map arrives every second; only re-render when what the panel shows changes.
    const setMapInfo = useCallback((s: MapSummary) => setMapInfoState((prev) => (sameMapSummary(prev, s) ? prev : s)), []);
    const [frameMode, setFrameMode] = useState<ViewFrameMode>(loadFrameMode);
    useEffect(() => {
        try {
            localStorage.setItem(FRAME_MODE_KEY, frameMode);
        } catch {
            // per-viewer convenience only
        }
    }, [frameMode]);
    const [viewFrame, setViewFrameState] = useState<ViewFrame | null>(null);
    const setViewFrame = useCallback((f: ViewFrame) => setViewFrameState((prev) => (sameViewFrame(prev, f) ? prev : f)), []);
    const odomView = viewFrame?.kind === "odom";
    // Poses drawn on the canvas are in the frame it draws in; Nav 2 transforms goals into its global frame.
    const frame = viewFrame?.frame ?? mapFrame ?? nsFrame(config.namespace, "map");

    const disabledTools: Partial<Record<MapTool, string>> = {};
    if (!connected) {
        disabledTools.setPose = disabledTools.goTo = disabledTools.place = "Not connected";
    }
    if (driveMode === "manual") disabledTools.goTo = "Switch to Neutral first - manual driving owns the base";
    if (odomView) {
        disabledTools.setPose = disabledTools.setPose ?? "Re-localizing needs the map frame - the view is on odometry";
        disabledTools.place = disabledTools.place ?? "Places are stored in the map frame - the view is on odometry";
    }
    const locMode = indoor.state?.mode;
    if (!indoor.available) {
        disabledTools.place = disabledTools.place ?? "Places need rover_indoor_nav_manager (indoor mode)";
    } else if (locMode !== LOCALIZATION_MODE.LOCALIZATION) {
        // AMCL only runs on a loaded map; while mapping, SLAM owns the pose.
        const why = locMode === LOCALIZATION_MODE.MAPPING ? "Not while mapping - load a saved map first" : "Load a map first";
        disabledTools.place = disabledTools.place ?? why;
        disabledTools.setPose = disabledTools.setPose ?? why;
    }

    // Quality only means something while AMCL localizes on a saved map; in the fixed
    // localization_source:=amcl mode (no indoor manager) it is shown as well.
    const localized = indoor.available ? locMode === LOCALIZATION_MODE.LOCALIZATION : true;
    // While mapping, judge the scan against the map slam_toolbox is building (as OTTO does).
    const mapping = indoor.available && locMode === LOCALIZATION_MODE.MAPPING;
    const judged = localized || mapping;
    const { quality, onScanMatch } = useLocalizationQuality(judged && connected, mapping);
    const modeLevel: Level = locMode === LOCALIZATION_MODE.LOCALIZATION ? "ok"
        : locMode === LOCALIZATION_MODE.MAPPING ? "warn"
            : locMode === LOCALIZATION_MODE.SWITCHING ? "stale" : "error";
    // Drawing on odometry while nothing localizes: say so instead of a bare "No localization".
    const odomFallback = odomView && locMode !== LOCALIZATION_MODE.LOCALIZATION && locMode !== LOCALIZATION_MODE.MAPPING;
    const localization: LocalizationStatus = odomFallback
        ? {
            mode: "Odometry only",
            modeLevel: "warn",
            modeDetail: [`No map pose - the map shows ${viewFrame?.frame} (drifts)`, indoor.state?.message].filter(Boolean).join("\n"),
            quality: null,
        }
        : {
            mode: indoor.available
                ? `${LOCALIZATION_LABEL[locMode ?? 0]}${indoor.state?.map_name ? ` · ${indoor.state.map_name}` : ""}`
                : quality ? "AMCL" : null,
            modeLevel,
            modeDetail: indoor.state?.message,
            quality: judged ? quality : null,
        };

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
            {/* Above the tabs, so manual driving keeps publishing whichever tab is open. */}
            <TeleopProvider>
                <div className="app">
                    <TopBar localization={localization} safety={safety} />
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
                                headingUp={headingUp}
                                rotationKey={indoor.state?.map_name || "default"}
                                onRobotPose={setRobotPose}
                                onMapFrame={setMapFrame}
                                onMapInfo={setMapInfo}
                                scanMatchEnabled={judged}
                                mapping={mapping}
                                onScanMatch={onScanMatch}
                                frameMode={frameMode}
                                onViewFrame={setViewFrame}
                            />
                            <MapToolbar
                                tool={tool}
                                setTool={(t) => { setTool(t); setPending(null) }}
                                disabledTools={disabledTools}
                                follow={follow}
                                setFollow={setFollow}
                                headingUp={headingUp}
                                setHeadingUp={setHeadingUp}
                                showCostmap={showCostmap}
                                setShowCostmap={setShowCostmap}
                                frameMode={frameMode}
                                setFrameMode={setFrameMode}
                                viewFrame={viewFrame}
                            />
                            <MapDriveWidget tab={tab} mapping={locMode === LOCALIZATION_MODE.MAPPING} safety={safety} />
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
                            <nav className="tabs" role="tablist">
                                <button role="tab" aria-selected={tab === "drive"} className={`tab ${tab === "drive" ? "tab-active" : ""}`} onClick={() => setTab("drive")}>
                                    <Gamepad2 size={16} />Drive
                                </button>
                                <button role="tab" aria-selected={tab === "navigate"} className={`tab ${tab === "navigate" ? "tab-active" : ""}`} onClick={() => setTab("navigate")}>
                                    <Navigation size={16} />Navigate
                                </button>
                                <button role="tab" aria-selected={tab === "facility"} className={`tab ${tab === "facility" ? "tab-active" : ""}`} onClick={() => setTab("facility")}>
                                    <Building2 size={16} />Facility
                                </button>
                            </nav>
                            <div className="tabs-rule" />
                            <div className="sidebar-body">
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
                                {tab === "facility" && <FacilityPanel indoor={indoor} robotPose={robotPose} mapInfo={mapInfo} />}
                            </div>
                        </aside>
                    </main>
                </div>
            </TeleopProvider>
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
                {/* Above Workspace so diagnostics history keeps filling while the popup is closed. */}
                <DiagnosticsProvider>
                    <Workspace />
                </DiagnosticsProvider>
            </AppContext.Provider>
        </RosProvider>
    );
};
