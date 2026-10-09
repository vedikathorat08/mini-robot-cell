#!/usr/bin/env python3
"""Subscribes to /pick_target (geometry_msgs/PointStamped) and logs every point."""
import rclpy
import yaml
from geometry_msgs.msg import PointStamped
from rclpy.node import Node

CONFIG_PATH = "/app/config/cell.yaml"


class PickTargetLogger(Node):
    def __init__(self, units):
        super().__init__("pick_target_logger")
        self.units = units
        self.create_subscription(PointStamped, "/pick_target", self.on_target, 10)

    def on_target(self, msg):
        p = msg.point
        self.get_logger().info(
            f"PICK TARGET x={p.x:.1f} y={p.y:.1f} z={p.z:.1f} {self.units} (frame '{msg.header.frame_id}')")


def main():
    with open(CONFIG_PATH) as f:
        units = yaml.safe_load(f)["pick_target"]["units"]
    rclpy.init()
    node = PickTargetLogger(units)
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
