#!/usr/bin/env python3
"""Position IK for the UR5e: moves tool0 above the last /pick_target.

Forward kinematics is built from the committed URDF (joint origins and axes), so it
matches the 3D model. IK is damped least squares on tool position plus a weak
"tool points down" constraint. Commands go through /joint_command, so the
server-side E-STOP in joint_sim still applies.
"""
import math
import xml.etree.ElementTree as ET

import rclpy
import yaml
from geometry_msgs.msg import PointStamped
from rclpy.node import Node
from sensor_msgs.msg import JointState
from std_msgs.msg import Bool, Empty, String

CONFIG_PATH = "/app/config/cell.yaml"
MM = 0.001
DOWN = [0.0, 0.0, -1.0]
TILT_WEIGHT = 0.3
MAX_ITERS = 150
MAX_STEP = 0.3      # rad per iteration
DAMPING = 0.05
FD_STEP = 1e-5
POS_TOL = 0.003     # m
TILT_TOL = 0.35     # sin(angle), about 20 degrees


def identity():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def origin_matrix(xyz, rpy):
    roll, pitch, yaw = rpy
    cr, sr = math.cos(roll), math.sin(roll)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cy, sy = math.cos(yaw), math.sin(yaw)
    r = [
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ]
    return [r[0] + [xyz[0]], r[1] + [xyz[1]], r[2] + [xyz[2]], [0.0, 0.0, 0.0, 1.0]]


def axis_rotation(axis, angle):
    x, y, z = axis
    n = math.sqrt(x * x + y * y + z * z)
    x, y, z = x / n, y / n, z / n
    c, s = math.cos(angle), math.sin(angle)
    t = 1.0 - c
    return [
        [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0.0],
        [t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0.0],
        [t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def clamp(value, low, high):
    return max(low, min(high, value))


def vec(text, default):
    return [float(v) for v in text.split()] if text else list(default)


def joint_limits(joint):
    limit = joint.find("limit")
    if joint.get("type") == "revolute" and limit is not None:
        return float(limit.get("lower")), float(limit.get("upper"))
    return -math.pi, math.pi


def load_chain(urdf_path, base="base_link", tip="tool0"):
    """Joints from base to tip, each with origin matrix, axis and limits."""
    root = ET.parse(urdf_path).getroot()
    by_child = {}
    for joint in root.iter("joint"):
        if joint.find("child") is not None:  # skip ros2_control joint entries
            by_child[joint.find("child").get("link")] = joint
    chain, link = [], tip
    while link != base:
        joint = by_child[link]
        origin, axis = joint.find("origin"), joint.find("axis")
        xyz = vec(origin.get("xyz") if origin is not None else None, (0, 0, 0))
        rpy = vec(origin.get("rpy") if origin is not None else None, (0, 0, 0))
        chain.append({
            "name": joint.get("name"),
            "revolute": joint.get("type") in ("revolute", "continuous"),
            "origin": origin_matrix(xyz, rpy),
            "axis": vec(axis.get("xyz") if axis is not None else None, (1, 0, 0)),
            "limits": joint_limits(joint),
        })
        link = joint.find("parent").get("link")
    chain.reverse()
    return chain


def forward(chain, q):
    """tool0 position and z axis in base_link. q maps joint name -> angle."""
    t = identity()
    for joint in chain:
        t = mat_mul(t, joint["origin"])
        if joint["revolute"]:
            t = mat_mul(t, axis_rotation(joint["axis"], q[joint["name"]]))
    return [t[0][3], t[1][3], t[2][3]], [t[0][2], t[1][2], t[2][2]]


def features(chain, q):
    """[x, y, z, w*(tool_z x down)]: zero tilt part means the tool points straight down."""
    p, z = forward(chain, q)
    return p + [TILT_WEIGHT * v for v in cross(z, DOWN)]


def jacobian(chain, names, q, f):
    cols = []
    for name in names:
        bumped = dict(q)
        bumped[name] += FD_STEP
        cols.append([(b - a) / FD_STEP for a, b in zip(f, features(chain, bumped))])
    return [[cols[k][i] for k in range(len(names))] for i in range(6)]


def solve_linear(a, b):
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[piv] = m[piv], m[col]
        for r in range(col + 1, n):
            factor = m[r][col] / m[col][col]
            for k in range(col, n + 1):
                m[r][k] -= factor * m[col][k]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (m[i][n] - sum(m[i][k] * x[k] for k in range(i + 1, n))) / m[i][i]
    return x


def damped_step(jac, err):
    """dq = J^T (J J^T + lambda^2 I)^-1 err."""
    n = len(jac[0])
    jjt = [[sum(jac[i][k] * jac[j][k] for k in range(n)) + (DAMPING ** 2 if i == j else 0.0)
            for j in range(6)] for i in range(6)]
    y = solve_linear(jjt, err)
    return [sum(jac[i][k] * y[i] for i in range(6)) for k in range(n)]


def evaluate(chain, q, target):
    p, z = forward(chain, q)
    tilt = math.sqrt(sum(v * v for v in cross(z, DOWN)))
    return math.dist(p, target), tilt


def solve_ik(chain, names, limits, seed, target):
    q = dict(seed)
    goal = list(target) + [0.0, 0.0, 0.0]
    for _ in range(MAX_ITERS):
        f = features(chain, q)
        err = [g - v for g, v in zip(goal, f)]
        if math.sqrt(sum(e * e for e in err[:3])) < 0.001 \
                and math.sqrt(sum(e * e for e in err[3:])) / TILT_WEIGHT < 0.05:
            break
        dq = damped_step(jacobian(chain, names, q, f), err)
        scale = min(1.0, MAX_STEP / max(max(abs(d) for d in dq), 1e-12))
        q = {n: clamp(q[n] + d * scale, *limits[n]) for n, d in zip(names, dq)}
    pos_err, tilt = evaluate(chain, q, target)
    return q, pos_err, tilt


class IkNode(Node):
    def __init__(self, cfg):
        super().__init__("ik_node")
        self.chain = load_chain(cfg["robot"]["urdf_path"])
        self.names = [j["name"] for j in self.chain if j["revolute"]]
        self.limits = {j["name"]: j["limits"] for j in self.chain if j["revolute"]}
        self.home = dict(zip(self.names, cfg["home_pose_rad"]))
        self.center = cfg["table"]["center_m"]
        self.hover = cfg["ik"]["hover_m"]
        self.pick = None
        self.state = None
        self.estop = False
        self.count = 0
        self.command_pub = self.create_publisher(JointState, "/joint_command", 10)
        self.status_pub = self.create_publisher(String, "/ik_status", 10)
        self.create_subscription(PointStamped, "/pick_target", self.on_pick, 10)
        self.create_subscription(JointState, "/joint_states", self.on_state, 10)
        self.create_subscription(Bool, "/estop", self.on_estop, 10)
        self.create_subscription(Empty, "/move_to_pick", self.on_move, 10)
        self.get_logger().info(f"ik_node ready, joints: {self.names}")

    def on_pick(self, msg):
        self.pick = (msg.point.x, msg.point.y)  # mm from image centre

    def on_state(self, msg):
        self.state = dict(zip(msg.name, msg.position))

    def on_estop(self, msg):
        self.estop = msg.data

    def target_in_base(self):
        """Same mapping as the 3D view: image up = +X, image right = -Y, table top z = 0."""
        dx, dy = self.pick
        return [self.center[0] - dy * MM, self.center[1] - dx * MM, self.hover]

    def say(self, kind, text):
        message = f"{kind} #{self.count}: {text}"
        self.get_logger().info(f"IK {message}")
        self.status_pub.publish(String(data=message))

    def best_solution(self, target):
        best = None
        for seed in (self.state, self.home):
            q, pos_err, tilt = solve_ik(self.chain, self.names, self.limits,
                                        {n: seed[n] for n in self.names}, target)
            if best is None or pos_err < best[1]:
                best = (q, pos_err, tilt)
            if pos_err < POS_TOL and tilt < TILT_TOL:
                break
        return best

    def on_move(self, _msg):
        self.count += 1
        if self.estop:
            return self.say("BLOCKED", "E-STOP is latched")
        if self.pick is None:
            return self.say("NO TARGET", "click the camera image first")
        if self.state is None or any(n not in self.state for n in self.names):
            return self.say("NO STATE", "no /joint_states yet")
        target = self.target_in_base()
        q, pos_err, tilt = self.best_solution(target)
        where = f"x={target[0] * 1000:.0f} y={target[1] * 1000:.0f} z={target[2] * 1000:.0f} mm"
        if pos_err >= POS_TOL or tilt >= TILT_TOL:
            return self.say("UNREACHABLE", f"{where}, best error {pos_err * 1000:.0f} mm")
        self.command_pub.publish(JointState(name=self.names, position=[q[n] for n in self.names]))
        tilt_deg = math.degrees(math.asin(min(1.0, tilt)))
        self.say("OK", f"moving to {where} (error {pos_err * 1000:.1f} mm, tool tilt {tilt_deg:.0f} deg)")


def main():
    with open(CONFIG_PATH) as f:
        cfg = yaml.safe_load(f)
    rclpy.init()
    node = IkNode(cfg)
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()