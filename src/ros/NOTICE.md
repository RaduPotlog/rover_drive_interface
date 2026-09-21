# Vendored foxglove_bridge client

`Impl.ts`, `Ros.ts`, `Topic.ts` and `index.ts` are copied from
[RaduPotlog/rover_cockpit_ros2_diagnostics](https://github.com/RaduPotlog/rover_cockpit_ros2_diagnostics)
`src/roslib/` at commit `a9b6d76e3aa47ee52a97703214a46b572445fecf`. That code is a fork of
[clearpathrobotics/cockpit-ros2-diagnostics](https://github.com/clearpathrobotics/cockpit-ros2-diagnostics),
which in turn took it from [tier4/roslibjs-foxglove](https://github.com/tier4/roslibjs-foxglove) (Apache-2.0).

These files remain under the **GNU Lesser General Public License v2.1 or later**
(`COPYING.LESSER`). The rest of this repository is Apache-2.0 (`/LICENSE`).

Changes made here:

- The transport is a native browser `WebSocket` (see `../components/RosProvider.tsx`) to the
  same-origin `/ws` endpoint that nginx proxies to foxglove_bridge, instead of Cockpit's TCP
  channel. `CockpitWebSocket.ts` and `wsFraming.ts` are therefore not vendored.
- `Impl.sendServiceRequest` rejects on the bridge's `serviceCallFailure` instead of hanging.
- `parseRos2idl` is imported from `@foxglove/ros2idl-parser`; upstream imports it from
  `@foxglove/rosmsg`, which does not export it (undefined at runtime for `ros2idl` schemas).
