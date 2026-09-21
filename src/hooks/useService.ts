import { useCallback, useState } from "react";

import { useRos } from "../ros/RosProvider";

export interface CallState {
    busy: boolean;
    error: string | null;
}

/** Wraps Ros.callService with busy/error state for buttons. */
export const useServiceCall = <Req, Res>(name: string, timeoutMs = 5000) => {
    const { ros, connected } = useRos();
    const [state, setState] = useState<CallState>({ busy: false, error: null });

    const call = useCallback(async (request: Req): Promise<Res | null> => {
        if (!ros || !connected) {
            setState({ busy: false, error: "Not connected" });
            return null;
        }
        setState({ busy: true, error: null });
        try {
            const response = await ros.callService<Req, Res>(name, request, timeoutMs);
            setState({ busy: false, error: null });
            return response;
        } catch (error) {
            setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }, [ros, connected, name, timeoutMs]);

    return { call, ...state };
};
