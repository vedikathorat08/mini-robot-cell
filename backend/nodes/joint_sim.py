#!/usr/bin/env python3
"""Fake robot: command becomes state immediately, clamped to URDF limits."""
import xml.etree.ElementTree as ET

import rclpy
import yaml
from rclpy.node import Node
from sensor_msgs.msg import JointState
from std_msgs.msg import Bool

CONFIG_PATH = "/app/config/cell.yaml"


def load_config(path=CONFIG_PATH):
    with open(path) as f:
        return yaml.safe_load(f)


def load_joint_limits(urdf_path):
    """Return {joint_name: (lower, upper)} for revolute joints, in URDF order."""
    root = ET.parse(urdf_path).getroot()
    limits = {}
    for joint in root.iter("joint"):
        if joint.get("type") == "revolute":
            limit = joint.find("limit")
            limits[joint.get("name")] = (float(limit.get("lower")), float(limit.get("upper")))
    return limits


def clamp(value, low, high):
    return max(low, min(high, value))


class JointSim(Node):
    def __init__(self, cfg):
        super().__init__("joint_sim")
        self.limits = load_joint_limits(cfg["robot"]["urdf_path"])
        self.names = list(self.limits)
        self.positions = list(cfg["home_pose_rad"])
        self.estop = False

        self.state_pub = self.create_publisher(JointState, "/joint_states", 10)
        self.create_subscription(JointState, "/joint_command", self.on_command, 10)
        self.create_subscription(Bool, "/estop", self.on_estop, 10)
        self.create_timer(1.0 / cfg["robot"]["state_rate_hz"], self.publish_state)
        self.get_logger().info(f"joint_sim ready, joints: {self.names}")

    def on_estop(self, msg):
        if msg.data != self.estop:
            self.estop = msg.data
            self.get_logger().warning(f"E-STOP {'LATCHED' if self.estop else 'RESET'}")

    def on_command(self, msg):
        if self.estop:
            self.get_logger().warning("REJECTED joint command: E-STOP is latched",
                                   throttle_duration_sec=1.0)
            return
        self.positions = self.apply_command(msg)

    def apply_command(self, msg):
        """Return a new positions list with the command applied (no mutation)."""
        targets = dict(zip(msg.name, msg.position)) if msg.name \
            else dict(zip(self.names, msg.position))
        return [
            clamp(targets.get(name, current), *self.limits[name])
            for name, current in zip(self.names, self.positions)
        ]

    def publish_state(self):
        msg = JointState()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.name = self.names
        msg.position = self.positions
        self.state_pub.publish(msg)


def main():
    rclpy.init()
    node = JointSim(load_config())
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
