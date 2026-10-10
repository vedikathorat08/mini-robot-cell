# DESIGN

## 1. Architecture and topics

```
Browser (http://localhost:8080)
  [React console: 3D scene, sliders]   [Vue panel: camera image, click -> mm]
        | ws /rosbridge                      | ws /rosbridge        | img /camera/mjpeg
        v                                    v                      v
   nginx :8080 --(proxy /rosbridge)--> backend:9090   rosbridge_websocket
          --(proxy /camera/)---------> backend:8081   camera_node (MJPEG, /frame.jpg)
Backend container (ROS 2 Lyrical), started by one launch file, settings from config/cell.yaml:
  rosbridge, robot_state_publisher, joint_sim, camera_node, pick_target_logger, ik_node
```

| Topic / endpoint | Type | Direction, units |
|---|---|---|
| `/joint_command` | sensor_msgs/JointState | UI or ik_node -> backend, radians |
| `/joint_states` | sensor_msgs/JointState | backend -> UI, rad, ~30 Hz; the only thing that poses the 3D model |
| `/estop` | std_msgs/Bool | UI -> backend; latched in joint_sim, commands rejected while true |
| `/pick_target` | geometry_msgs/PointStamped | Vue -> backend and React, **millimetres**, frame_id `camera`, offset from image centre; logged |
| `/move_to_pick` | std_msgs/Empty | React button -> ik_node |
| `/ik_status` | std_msgs/String | ik_node -> React (OK, UNREACHABLE, BLOCKED, ...) |
| `/camera/mjpeg`, `/camera/frame.jpg` | HTTP | backend -> browser, 1280x720 JPEG |

## 2. Why React for A, Vue for B, and how they are integrated

React owns the main console (new screens are React); the Vue panel stands in for the older
widget library. Both are built in separate Node stages of one Dockerfile and served by one
nginx. Vue is built as a single self-running script (`panel.js`) that mounts into
`<div id="vue-root">` on the same page.
**Trade-offs:** simplest to build and explain (two roots, one page, no iframe messaging, one
origin so one `/rosbridge` proxy). Costs: both frameworks share one page, CSS and global
scope (mitigated with Vue scoped styles), and each opens its own websocket. A Web Component
would give a cleaner boundary; an iframe would give total isolation but awkward sizing and
messaging. The two apps share no code and talk only through ROS topics: Vue publishes
`/pick_target`, React subscribes to it.

## 3. Camera transport

MJPEG over HTTP, proxied by nginx. **Why:** an `<img>` tag displays it with no JavaScript,
bandwidth is acceptable (1280x720 JPEG, about 40 KB per frame, ~10 fps), and the server is
about 30 lines of stdlib Python. **Compared with** CompressedImage over rosbridge: that needs
base64 inside JSON (+33% size) and JS decoding, so more latency and complexity. A REST
`/frame.jpg` endpoint is also served for polling and debugging. Without a webcam the node
draws a synthetic top-down view of the table, so the UI behaves identically.

## 4. Scene model and coordinate frames

The 3D scene and the camera image describe the same cell (`table`, `camera_pose` in
`config/cell.yaml`): a tabletop centred at `table.center_m` in `base_link`, an overhead
camera above its centre looking down, and the camera's field of view drawn on the table.
**Assumed (not calibrated) mapping:** image centre = table centre, image up = +X of
`base_link`, image right = -Y, table top at z = 0. A pick at (dx, dy) mm from the image
centre is placed at

```
x = table_x - dy * 0.001        y = table_y - dx * 0.001        (metres, base_link)
```

The same function is used by the 3D marker (React) and by `ik_node` (Python), so they agree.

## 5. Pixel -> mm maths

Let the displayed image have rectangle `rect` (CSS pixels) and natural size `W x H`.

```
u  = (clientX - rect.left) * naturalWidth  / rect.width
v  = (clientY - rect.top)  * naturalHeight / rect.height
dx = (u - W/2) * mm_per_px
dy = (v - H/2) * mm_per_px
```

Scaling by `naturalWidth / rect.width` makes the result independent of the displayed size.
Image y points down, so +dy is down in the image. The image is not letterboxed
(`width:100%; height:auto`), so no extra correction is needed.
Worked example: 1280x720 source shown at 640x360, click at (480, 90): u,v = (960, 180);
dx = (960-640)*0.4 = **+128 mm**, dy = (180-360)*0.4 = **-72 mm**.
`mm_per_px` (default 0.4) comes from `config/cell.yaml`. These cases are unit tested
(`pickMath.test.js`, 9 tests).

## 6. Latency compensation

```
offset_mm = belt_speed [m/s] * latency [s] * 1000 [mm/m]
```
Latency is configured in ms, so it is divided by 1000 first (the classic off-by-1000 bug is
covered by a test). Default: 0.25 m/s * 0.200 s = 0.05 m = **50 mm**, added along +X.
Both values come from `cell.yaml`.

## 7. Inverse kinematics (MOVE TO TARGET)

`ik_node` builds forward kinematics from the committed URDF (joint origins, axes, limits), so
it always matches the 3D model. Goal: `tool0` at the picked point plus `ik.hover_m` (100 mm)
above the table, tool z axis pointing down. Error vector `e = [target - p, 0.3 * (tool_z x down)]`;
update `dq = J^T (J J^T + 0.05^2 I)^-1 e` (damped least squares, Jacobian by finite
differences), step-limited to 0.3 rad, joint-limit clamped, 150 iterations, seeded from the
current state and then from the home pose. A solution is accepted only if position error
< 3 mm and tool tilt < about 20 degrees; otherwise `IK UNREACHABLE` is reported and nothing
is sent. The result goes out on `/joint_command`, so the E-STOP check in `joint_sim` still
applies. Pure Python: no new packages in the image.
**Limits:** position and "tool down" only, no collision checking, no motion smoothing,
mapping assumed as in section 4.

## 8. Where E-STOP is enforced

In the backend `joint_sim` node: while `/estop` is true it logs `REJECTED joint command` and
ignores every `/joint_command`, whatever the sender (UI, terminal, or ik_node). `ik_node`
also refuses to plan while latched, but that is a courtesy. The UI disables its sliders and
buttons, also a convenience. Enforcing at the backend is correct because any client can
publish commands, and the safety decision must sit where commands are applied.

## 9. What I deliberately did not do

- Smooth motion / velocity limits: "command becomes state" is acceptable per the brief.
- Calibrated camera-to-base transform via TF: the mapping is a documented assumption.
- Full-orientation IK and collision checking.
- Real-webcam testing: no webcam passthrough on my Windows / Docker Desktop machine.
- Persisting the E-STOP latch across backend restarts (re-latched by the UI heartbeat).
- Automated tests beyond the pick maths, and CI.
- Joint limits are read from the URDF, not hard-coded.