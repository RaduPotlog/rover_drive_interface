import { useCallback, useMemo, useRef, useState } from "react";

import { useApp } from "../AppContext";
import { classifyQuality, type Quality, type ScanMatch, sigmaFromCovariance, smooth } from "../lib/locQuality";
import { nsName } from "../lib/namespace";
import { useTopic } from "./useTopic";

interface AmclPose { pose: { covariance: ArrayLike<number> } }

/**
 * Combines the map view's scan-to-map match with AMCL's reported uncertainty into the
 * Good / Fair / Poor indicator. `onScanMatch` is handed to MapView.
 */
export const useLocalizationQuality = (enabled: boolean, mapping = false) => {
    const { config } = useApp();
    const amcl = useTopic<AmclPose>(
        enabled && !mapping ? nsName(config.namespace, "amcl_pose") : null, "geometry_msgs/msg/PoseWithCovarianceStamped", 500);
    const smoothed = useRef<number | null>(null);
    const [match, setMatch] = useState<ScanMatch | null>(null);

    const onScanMatch = useCallback((m: ScanMatch | null) => {
        if (!m || m.count === 0) { // nothing to judge (e.g. a fresh map): "—", not 0%
            smoothed.current = null;
            setMatch(null);
            return;
        }
        smoothed.current = smooth(smoothed.current, m.ratio);
        setMatch({ ratio: smoothed.current, count: m.count });
    }, []);

    const sigmaXY = !mapping && amcl.message ? sigmaFromCovariance(amcl.message.pose.covariance) : null;
    const quality: Quality | null = useMemo(
        () => (enabled ? classifyQuality({ match, sigmaXY, mapping }) : null), [enabled, match, sigmaXY, mapping]);

    return { quality, onScanMatch };
};
