#!/bin/bash
set -e
source /opt/ros/lyrical/setup.bash
exec ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
