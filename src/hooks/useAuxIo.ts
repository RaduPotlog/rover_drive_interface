import { useApp } from "../AppContext";
import { type AuxIoStateMsg, type AuxIoSummary, summarizeAuxIo } from "../lib/auxIo";
import { nsName } from "../lib/namespace";
import { useRos } from "../ros/RosProvider";
import { useNow, useTopic } from "./useTopic";

/** Latest aux_io_state, summarized for the top-bar chip and the Aux IO popup. */
export const useAuxIo = (): AuxIoSummary => {
    const { config } = useApp();
    const { connected } = useRos();
    const now = useNow(500);
    const aux = useTopic<AuxIoStateMsg>(
        nsName(config.namespace, "hardware_interface/aux_io_state"), "rover_msgs/msg/AuxIoState", 100);

    return summarizeAuxIo(aux.message, aux.receivedAt, now, connected);
};
