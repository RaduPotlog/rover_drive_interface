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
  publishes `geometry_msgs/TwistStamped` on `<ns>/teleop_foxglove_cmd_vel_stamped` at 10 Hz.
  That input is twist_mux priority 100, which beats Nav 2 (5) and the RC link (10).
- **Deadman.** Publishing stops when:
  - the page is hidden or unfocused, or the bridge connection drops;
  - twist_mux's 0.5 s timeout then stops the rover.
- **Controls.**
  - On-screen joystick, or a gamepad while **L1/LB** is held.
  - Speed presets 20/50/80/100 % of the configured maximum.
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
- **Top bar.** Shows:
  - safety (e-stop, latch, contactor, `motion_lock`);
  - worst `diagnostics_agg` level;
  - battery and charging;
  - link latency (round trip through `/rosapi/get_time`);
  - the localization mode.

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

## License

Apache-2.0 (`LICENSE`). The vendored client in `src/ros/` is LGPL-2.1-or-later
(`src/ros/COPYING.LESSER`, `src/ros/NOTICE.md`).
