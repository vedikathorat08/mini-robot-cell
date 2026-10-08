#!/bin/bash
set -e
source /opt/ros/lyrical/setup.bash
exec ros2 launch /app/backend/launch/cell.launch.py
