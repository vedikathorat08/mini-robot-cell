# Mini Robot Cell Operator Console

Browser-based operator console for a 6-axis UR5e arm and an overhead camera.
React main console + Vue camera/pick panel + ROS 2 backend, all in Docker.

## Run it

```bash
git clone https://github.com/vedikathorat08/mini-robot-cell.git
cd mini-robot-cell
docker compose up --build
```

Open **http://localhost:8080** (if `localhost` fails on Windows, use http://127.0.0.1:8080).

No other steps. Needs Docker with compose v2 only. Network is needed at **build time** only;
nothing is downloaded when the containers start.

## Screenshots

![React console](docs/screenshot1.png)
![Vue camera panel](docs/screenshot2.png)

Demo video: https://drive.google.com/file/d/1XCeClcmiudhYEKdOawyjIpy9Uzjhxmvk/view?usp=sharing

## Stack

- **ROS 2 Lyrical** (`ros:lyrical-ros-base` image, not desktop)
- **URDF:** UR5e from `ur_description` (BSD-3-Clause), expanded from xacro once by
  `scripts/extract_ur5e.sh` and committed with meshes and its `package.xml` in `backend/urdf/`.
  Credit: Universal Robots / ROS-Industrial `ur_description`.
- **Frontend:** React 18 + Three.js + urdf-loader (console), Vue 3 (camera panel), nginx.
- **Config:** everything tunable is in `config/cell.yaml`.

## What works

- One command build and run; no runtime downloads (everything is installed at build time).
- 3D UR5e viewer posed **only** from `/joint_states`
  (UI -> `/joint_command` -> backend -> `/joint_states` -> UI).
- Six sliders with limits read from the URDF, shown in degrees and radians.
- Connection indicator with the URL; auto-reconnects when the backend restarts.
- HOME, E-STOP and RESET. E-STOP is enforced in the backend (`joint_sim`), not only in the UI.
- `/joint_states` at about 30 Hz (measured with `ros2 topic hz`).
- `robot_state_publisher` publishes the TF tree `base_link -> ... -> tool0`.
- Camera node: real webcam if `/dev/video0` opens, otherwise a synthetic 1280x720 top-down
  frame. Never blocks or crashes startup.
- Vue panel: camera stream, crosshair, click -> pixel -> mm with display-vs-source scaling,
  latency compensation, and it publishes `/pick_target`, which the backend logs.
- Scene and target link (see below): tabletop, overhead camera, pick target in 3D, MOVE TO TARGET.

## Scene realism and the pick target

- The 3D scene models a **tabletop** (`table` in `config/cell.yaml`), the **overhead camera**
  (`camera_pose`) and the camera's **field of view** drawn on the table.
- The synthetic camera frame is a **top-down view of that same table** with an object on it.
- A click in the Vue panel publishes `/pick_target` (mm from the image centre). The React
  scene subscribes and shows a red marker on the table, with a line from `tool0` and the
  tool-to-target distance in mm.
- **MOVE TO TARGET:** `ik_node` solves position IK for `tool0` hovering `ik.hover_m` (100 mm)
  above the picked point with the tool pointing down. Forward kinematics is built from the
  URDF; the solver is damped least squares (Jacobian by finite differences), pure Python.
  The result is sent on `/joint_command`, so the backend E-STOP still blocks it.
- **Assumed mapping** (hand-set, not calibrated): image centre = table centre, image up = +X
  of `base_link`, image right = -Y, table top at z = 0.

## What doesn't work / known limits

- **Webcam on Windows / Docker Desktop is not passed through.** I only tested the synthetic
  fallback (Windows + Docker Desktop). The real-webcam path (`/dev/video0` via OpenCV) is
  untested on hardware.
- **Camera-to-table mapping is assumed, not calibrated.** The pick target is only as accurate
  as that assumption. The synthetic image is a stand-in for a real calibrated camera.
- **IK is position plus "tool points down" only.** No full orientation control, no collision
  checking, and no check that the path to the pose is free. Unreachable points are reported
  (`IK UNREACHABLE`) and the arm does not move.
- "Command becomes state immediately": no smoothing, so the arm jumps to the commanded pose.
- E-STOP state is held in the UI and re-sent every second while latched. The backend latch
  comes from the last `/estop` message, so if the backend restarts while latched, it starts
  unlatched until the UI's next heartbeat (up to 1 s).
- Camera uses a plain MJPEG stream; no bandwidth adaptation.
- No automated tests for the React or backend code (only the pick maths is tested).

## What I'd do next

- Smooth motion (max joint velocity) so the arm animates between poses.
- Calibrate the camera-to-base transform and publish it through TF instead of the assumed mapping.
- Full-orientation IK with collision checking.
- Test the real webcam on a Linux host and add a camera-health indicator in the UI.
- Persist the E-STOP latch in the backend across restarts.

## Bonus items attempted

- **Bonus 5 (Tests):** 9 unit tests for the pixel->mm and latency maths in
  `frontend/vue-panel/src/pickMath.test.js` (Vitest). Run (no Node needed on the host):
```bash
  docker build --target vue-test --progress=plain -f frontend/Dockerfile .
```
- **Bonus 6 (IK):** position IK for MOVE TO TARGET, described above.

## Image size and build time

- Backend image: about 3 GB (`ros:lyrical-ros-base` + rosbridge + OpenCV pull in many
  dependencies; I used `ros-base`, not desktop, and cleared the apt lists).
- Frontend image: about 30 MB (nginx:alpine + built React and Vue bundles + URDF).
- Cold build time: about 3 minutes (2 min 50 s with `docker compose build --no-cache`; base
  images already pulled, my laptop and network). A first-ever build also downloads the
  ROS, Node and nginx base images, so it takes longer.

## Tests I ran

- Fresh clone into a new folder, only `docker compose up --build`: passed.
- Offline: built online, disconnected the network, `docker compose up` (no `--build`):
  console, 3D arm and camera panel loaded.
- Ctrl+C: stops within about X seconds (replace X with your measured value), no orphaned containers.
- Reconnect: `docker compose stop backend` turns the indicator red, `start` turns it green again.
- Unit tests: 9 passed (command above).

## How to verify E-STOP and the no-camera fallback

**E-STOP (server side):**
1. Click E-STOP in the UI: red banner, sliders, HOME and MOVE TO TARGET disabled.
2. Send a command from a terminal while latched:
```bash
   docker compose exec backend bash -c "source /opt/ros/lyrical/setup.bash && ros2 topic pub -w 1 -t 3 -r 2 /joint_command sensor_msgs/msg/JointState '{name: [shoulder_pan_joint], position: [1.0]}'"
   docker compose logs backend --tail 10 | grep -E "E-STOP|REJECTED"
```
   Expect `E-STOP LATCHED` and `REJECTED joint command: E-STOP is latched`.
3. Click RESET to clear.

**No camera:** on any machine without `/dev/video0` the stack logs one
`WARNING: /dev/video0 not found, using synthetic camera` and shows the synthetic frame.
To force it, add `environment: [NO_CAMERA=1]` to the backend service in `docker-compose.yml`.

**Camera access (Linux):** `docker-compose.yml` bind-mounts `/dev` and sets
`device_cgroup_rules: ["c 81:* rmw"]` instead of listing `/dev/video0` under `devices:`,
so a missing device cannot stop the container from being created.

## Repo layout

```
docker-compose.yml     single entry point
config/cell.yaml       all tunables (ports, camera, calibration, conveyor, home pose, table, IK)
backend/               Dockerfile, launch/, nodes/ (joint_sim, camera_node,
                       pick_target_logger, ik_node), urdf/
frontend/              Dockerfile (multi-stage), nginx.conf, react-app/, vue-panel/
scripts/               one-time URDF extraction helper (not run by the reviewer)
docs/                  screenshots, demo video link
```
