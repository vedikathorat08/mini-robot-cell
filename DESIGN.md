# DESIGN

## 1. Architecture and topics

```
Browser (http://localhost:8080)
  [React console]  [Vue camera/pick panel]
        |  ws /rosbridge        |  ws /rosbridge      img /camera/mjpeg
        v                       v                     v
   nginx :8080 --(proxy /rosbridge)--> backend:9090  rosbridge_websocket
          --(proxy /camera/)--------> backend:8081  camera_node (MJPEG, /frame.jpg)
Backend container (ROS 2 Lyrical): rosbridge, robot_state_publisher, joint_sim,
camera_node, pick_target_logger. One launch file; settings from config/cell.yaml.
```

| Topic / endpoint | Type | Direction, units |
|---|---|---|
| `/joint_command` | sensor_msgs/JointState | UI -> backend, radians |
| `/joint_states` | sensor_msgs/JointState | backend -> UI, rad, ~30 Hz; the only thing that poses the 3D model |
| `/estop` | std_msgs/Bool | UI -> backend; latched in backend, commands rejected while true |
| `/pick_target` | geometry_msgs/PointStamped | Vue -> backend, **millimetres**, frame_id `camera`, offset from image centre; logged |
| `/camera/mjpeg`, `/camera/frame.jpg` | HTTP | backend -> browser, 1280x720 JPEG |

## 2. Why React for A, Vue for B, and how they are integrated

React owns the main console (new screens are React); the Vue panel stands in for the
older widget library. Both are built in separate Node stages of one Dockerfile and
served by one nginx. Vue is built as a single self-running script (`panel.js`) that
mounts into `<div id="vue-root">` on the same page.
**Trade-offs:** simplest to build and explain (two roots, one page, no iframe
messaging, shared origin so one `/rosbridge` proxy). Cost: both frameworks share one
page, CSS and global scope (mitigated with Vue scoped styles); each opens its own
websocket instead of sharing one connection. A Web Component would give a cleaner
boundary; an iframe would give total isolation but awkward sizing and messaging.

## 3. Camera transport

MJPEG over HTTP, proxied by nginx. **Why:** an `<img>` tag displays it with no JS,
bandwidth is acceptable at 1280x720 JPEG (about 40 KB per frame, ~10 fps), and the
server is about 30 lines of stdlib Python. **Compared with** CompressedImage over
rosbridge: that needs base64 in JSON (+33% size) and JS decoding, so it adds latency
and complexity. A REST `/frame.jpg` endpoint is also provided for polling and debugging.

## 4. Pixel -> mm maths

Let the displayed image have rectangle `rect` (CSS pixels) and natural size `W x H`.

```
u  = (clientX - rect.left) * naturalWidth  / rect.width
v  = (clientY - rect.top)  * naturalHeight / rect.height
dx = (u - W/2) * mm_per_px
dy = (v - H/2) * mm_per_px
```

Scaling by `naturalWidth / rect.width` makes the result independent of the displayed
size. Image y points down, so +dy is down in the image. The image is not letterboxed
(`width:100%; height:auto`), so no extra correction is needed.
Worked example: 1280x720 source shown at 640x360, click at (480, 90):
u,v = (960, 180); dx = (960-640)*0.4 = **+128 mm**, dy = (180-360)*0.4 = **-72 mm**.
`mm_per_px` (default 0.4) comes from `config/cell.yaml`.

## 5. Latency compensation

```
offset_mm = belt_speed [m/s] * latency [s] * 1000 [mm/m]
```
Latency is configured in ms, so it is divided by 1000 first. Default:
0.25 m/s * 0.200 s = 0.05 m = **50 mm**, added along +X. Both values come from `cell.yaml`.

## 6. Where E-STOP is enforced

In the backend `joint_sim` node: while `/estop` is true it logs
`REJECTED joint command` and ignores every `/joint_command`, whatever the sender.
The UI also disables its sliders and stops sending, but that is convenience only.
Enforcing at the backend is correct because any client (a terminal, another UI) can
publish commands, and the safety decision must sit where the commands are applied.

## 7. What I deliberately did not do

- Bonus items: scope control; I prioritised one-command run and honest docs.
- Smooth motion / velocity limits: "command becomes state" is acceptable per the brief.
- Real-webcam testing: no webcam passthrough on my Windows/Docker Desktop machine.
- Joint limits are read from the URDF, not hard-coded.
- Automated tests and CI: the maths is small and documented; tests are listed as next.