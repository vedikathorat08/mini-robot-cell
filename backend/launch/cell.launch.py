import os

import yaml
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import ExecuteProcess, IncludeLaunchDescription
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch_ros.actions import Node

CONFIG_PATH = "/app/config/cell.yaml"


def generate_launch_description():
    with open(CONFIG_PATH) as f:
        cfg = yaml.safe_load(f)
    with open(cfg["robot"]["urdf_path"]) as f:
        urdf = f.read()

    rosbridge_launch = os.path.join(
        get_package_share_directory("rosbridge_server"),
        "launch", "rosbridge_websocket_launch.xml")

    return LaunchDescription([
        IncludeLaunchDescription(
            AnyLaunchDescriptionSource(rosbridge_launch),
            launch_arguments={"port": str(cfg["rosbridge"]["port"])}.items()),
        Node(package="robot_state_publisher", executable="robot_state_publisher",
             parameters=[{"robot_description": urdf}]),
        ExecuteProcess(cmd=["python3", "-u", "/app/backend/nodes/joint_sim.py"],
                       output="screen"),
    ])
