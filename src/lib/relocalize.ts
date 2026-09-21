// "Find me": ask AMCL to forget its estimate and spread particles over the whole map, then
// run a few filter updates on the current scan so the cloud starts collapsing at once.
// A last resort for a rover moved while off - in corridors or repeated bays AMCL can settle
// on a look-alike spot (see rover_nav_params.yaml), so Set pose stays the first choice.

export const GLOBAL_LOCALIZATION = "reinitialize_global_localization";
export const NOMOTION_UPDATE = "request_nomotion_update";

export interface RelocalizeDeps {
    /** Calls a std_srvs/Empty service under the rover namespace. */
    call: (service: string) => Promise<unknown>;
    sleep: (ms: number) => Promise<void>;
}

export const findMe = async ({ call, sleep }: RelocalizeDeps, updates = 3, gapMs = 300) => {
    await call(GLOBAL_LOCALIZATION);
    for (let i = 0; i < updates; i++) {
        await sleep(gapMs);
        await call(NOMOTION_UPDATE);
    }
};
