# rover_drive_interface

A browser drive interface for **rover_a1**, modelled on the Clearpath Boxer's OTTO App and
the Clearpath IndoorNav web GUI. It covers one rover and indoor (2D map) navigation.

The page is a static React + TypeScript app. It talks ROS 2 through
[foxglove_bridge](https://github.com/foxglove/ros-foxglove-bridge) using the Foxglove
websocket protocol, so the container that serves it runs no ROS. On the rover it ships as the
balena service **`rover-a1-drive-interface`** (see `rover_docker/rover_a1_drive_interface/`
in the rover_a1 workspace):
- nginx on port **5000**, behind a basic-auth login;
- the same-origin **`/ws`** endpoint proxied to foxglove_bridge on `127.0.0.1:8765`.

```
browser ──http/ws :5000──► nginx (rover-a1-drive-interface) ──ws──► foxglove_bridge :8765 (rover-a1-platform) ──► ROS 2
```

## Features

- **Neutral / Manual.** The page starts in Neutral and publishes nothing. **Manual**
  publishes `geometry_msgs/TwistStamped` on `<ns>/teleop_driver_interface_cmd_vel_stamped` at 10 Hz.
  That is the UI's own twist_mux input, priority 8: it beats Nav 2 (5), while the RC link (110)
  and Foxglove (100) override it.
- **Deadman.** Publishing stops when:
  - the page is hidden or unfocused, or the bridge connection drops;
  - twist_mux's 0.5 s timeout then stops the rover.
- **Controls.**
  - On-screen joystick, or a gamepad while **L1/LB** is held.
  - A compact **map drive widget** (Neutral/Manual, joystick, speed) at the lower right of
    the map on the Navigate and Facility tabs. It opens by itself when mapping starts, so a
    facility map can be recorded without the RC transmitter.
  - Manual driving keeps publishing whichever tab is open; the loop lives above the tabs.
  - Speed presets 20/50/80/100 % of the configured maximum.
  - Expo curve per axis (`expoLinear` 0.3, `expoAngular` 0.5): small stick moves give much
    less speed (30 % turn stick → 16 %), full stick is still full speed. 0 = linear.
  - Rim-speed limit, as in rover_crsf_teleop. When |v| + |w| · track/2 would exceed
    `maxRimSpeed` (1.7 m/s), v and w are scaled together, so the rover drives the commanded arc
    more slowly instead of the outer wheel being clipped into a tighter turn.
  - Software e-stop set/reset and safety-latch reset (`<ns>/hardware_interface/sw_*`).
- **Map (Navigate).** Shows:
  - the occupancy map;
  - the lidar scan, the Nav 2 plan and an optional global costmap;
  - the rover and its places.
  Tools:
  - **Set pose** (AMCL `initialpose`);
  - **Go to**, which calls rover_mission_manager's `set_mission`;
  - **Add place**;
  - **Stop**.
- **Places.** Named poses per map, stored on the rover by rover_indoor_nav_manager:
  - **Go** to one;
  - rename or delete;
  - **Save here**;
  - an **A → B → C workflow**, run as one mission.
- **Facility.** **Start mapping** (slam_toolbox), **Save map**, and **Load** a saved map
  (map_server + AMCL, switched at runtime) or delete one.
  Needs `ROVER_LOCALIZATION_SOURCE=indoor` on the orchestrator.
- **Localization quality.** A Boxer-style Good / Fair / Poor indicator in the top bar. It combines:
  - the share of lidar points that land on a wall of the saved map (scan-to-map match);
  - AMCL's reported uncertainty (`amcl_pose` covariance).
  On the map, matched scan points are green and unmatched ones red, so you can see where the map
  and the world disagree.
  Thresholds: Good ≥ 70 % matched and σ ≤ 0.35 m; Poor < 40 % or σ > 1 m.
- **Top bar.** Shows:
  - safety (e-stop, latch, contactor, `motion_lock`);
  - worst `diagnostics_agg` level - click it for the diagnostics popup;
  - aux IO: how many aux outputs are on - click it for the Aux IO popup;
  - battery and charging;
  - link latency (round trip through `/rosapi/get_time`);
  - the localization mode.

- **Diagnostics popup.** Clicking the top bar's diagnostics level opens the same view as
  Cockpit's **ROS 2 Diagnostics** page, over the same `<ns>/diagnostics_agg` topic:
  - a timeline of the last 30 snapshots (~30 s at the aggregator's 1 Hz) - click one to
    freeze the view on it, **Pause** / **Resume** to stop and restart the strip;
  - **Errors** and **Warnings** cards listing the failing tasks by name, path and message
    (a task that stopped reporting - STALE - counts as an error, as it does in Cockpit);
  - **All Diagnostics**: the whole aggregated tree, expandable, with a detail pane showing
    a task's path, hardware ID, level and key/value pairs.
  The history keeps filling while the popup is closed, so the timeline is already full when
  it opens. Cockpit's *Capture Diagnostics* has no equivalent here - it runs commands on the
  robot through Cockpit's privileged API, so log capture stays on the Cockpit page.

- **Aux IO popup.** Clicking the top bar's **Aux IO** chip opens a popup for the safety PLC's
  general-purpose IO (not part of the safety chain):
  - six **outputs** (PLC DIO00..05), each with an ON/OFF switch that calls
    `<ns>/hardware_interface/aux_output_<i>/set` (`std_srvs/SetBool`). No confirmation.
  - The switch shows what the PLC reads back, not just the last click. A switch that the PLC
    still disagrees with 1 s after the rover accepted it is flagged, and a rejected or
    timed-out call shows its reason on that row.
  - six **inputs** (DIO06..11), shown ON/OFF.
  - Both come from `<ns>/hardware_interface/aux_io_state` (`rover_msgs/AuxIoState`).
    Switches are disabled while that topic is stale (3 s) or reports the PLC link down.
  - Names come from `auxOutputNames` / `auxInputNames` in `config.json`
    (`ROVER_DRIVE_AUX_OUTPUT_NAMES` / `ROVER_DRIVE_AUX_INPUT_NAMES`, comma-separated).
  Needs the rover_hardware_interface aux IO support. There is none in simulation.

Tabs can be deep-linked: `#drive`, `#navigate`, `#facility`.

## Development

```bash
npm ci
npm test            # vitest: geometry, TF, teleop, occupancy grid, status
npm run build       # type-check + production bundle in dist/
ROVER_BRIDGE=ws://<rover-ip>:8765 npm run dev   # http://localhost:5000, Vite proxies /ws
```

`public/config.json` holds the development defaults. In the container, `start.sh` renders it
from `ROVER_NAMESPACE` and `ROVER_DRIVE_*`.

## Layout

```
src/
├── ros/          # vendored foxglove_bridge client (LGPL-2.1, see src/ros/NOTICE.md)
├── lib/          # pure logic, unit tested: geometry, tf, teleop, occupancy grid, status
├── hooks/        # useTopic, useServiceCall, useLatency, usePageActive
└── components/   # TopBar, DrivePanel, Joystick, EStopPanel, …
test/             # vitest
```

## Branding

The Mechatronics Academy logo (`public/logo.png`, from `icons/LogoMATransparentRound-80x80-1.png`)
is used in the top bar and as the favicon. The accent colour `#fca800` was sampled from it.
Icons come from [lucide-react](https://lucide.dev) (ISC).

## License

Apache-2.0 (`LICENSE`). The vendored client in `src/ros/` is LGPL-2.1-or-later
(`src/ros/COPYING.LESSER`, `src/ros/NOTICE.md`), and so are `src/lib/diagnostics.ts` and
`src/lib/valueLabels.ts`, whose tree building, leaf filtering and value labels are ported
from [rover_cockpit_ros2_diagnostics](https://github.com/RaduPotlog/rover_cockpit_ros2_diagnostics)
(itself a fork of clearpathrobotics/cockpit-ros2-diagnostics). Each file names its upstream
in its header.
