import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { INITIAL_LINK, type LinkState, nextLinkState } from "../lib/link";
import { useRos } from "../ros/RosProvider";

// Round trip browser -> nginx -> foxglove_bridge -> ROS service -> back. /rosapi/get_time is
// cheap and always up alongside the bridge (rover_web_bridges.launch.py starts both).
const PROBE_SERVICE = "/rosapi/get_time";
const PERIOD_MS = 2000;
const PROBE_TIMEOUT_MS = 1500;

const LinkContext = createContext<LinkState>(INITIAL_LINK);

/** The link quality, shared by the Link pill and the map's low-bandwidth mode. */
export const useLink = () => useContext(LinkContext);

export const LinkProvider = ({ children }: { children: ReactNode }) => {
    const { ros, connected, session } = useRos();
    const [link, setLink] = useState<LinkState>(INITIAL_LINK);

    useEffect(() => {
        // Keep slow/paused across a reconnect: a weak link is the usual reason for one.
        setLink((prev) => ({ ...prev, latency: null }));
        if (!ros || !connected) return;
        let cancelled = false;
        let inFlight = false;
        const probe = async () => {
            if (inFlight || !ros.hasService(PROBE_SERVICE)) return;
            inFlight = true;
            const start = performance.now();
            try {
                await ros.callService(PROBE_SERVICE, {}, PROBE_TIMEOUT_MS);
                const latency = Math.round(performance.now() - start);
                if (!cancelled) setLink((prev) => nextLinkState(prev, { ok: true, latency }, Date.now()));
            } catch {
                if (!cancelled) setLink((prev) => nextLinkState(prev, { ok: false }, Date.now()));
            } finally {
                inFlight = false;
            }
        };
        const id = setInterval(probe, PERIOD_MS);
        probe();
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [ros, connected, session]);

    return <LinkContext.Provider value={link}>{children}</LinkContext.Provider>;
};
