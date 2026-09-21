import { useEffect, useState } from "react";

import { useRos } from "../ros/RosProvider";

// Round trip browser -> nginx -> foxglove_bridge -> ROS service -> back. /rosapi/get_time is
// cheap and always up alongside the bridge (rover_web_bridges.launch.py starts both).
const PROBE_SERVICE = "/rosapi/get_time";
const PERIOD_MS = 2000;

export const useLatency = (): number | null => {
    const { ros, connected, session } = useRos();
    const [latency, setLatency] = useState<number | null>(null);

    useEffect(() => {
        setLatency(null);
        if (!ros || !connected) return;
        let cancelled = false;
        const probe = async () => {
            if (!ros.hasService(PROBE_SERVICE)) return;
            const start = performance.now();
            try {
                await ros.callService(PROBE_SERVICE, {}, 1500);
                if (!cancelled) setLatency(Math.round(performance.now() - start));
            } catch {
                if (!cancelled) setLatency(null);
            }
        };
        const id = setInterval(probe, PERIOD_MS);
        probe();
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [ros, connected, session]);

    return latency;
};
