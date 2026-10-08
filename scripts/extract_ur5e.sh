#!/bin/bash
# One-time helper: expand the UR5e xacro from ur_description into plain URDF + meshes.
set -ex
find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) -exec sed -i 's|http://|https://|g' {} +
apt-get update
apt-get install -y --no-install-recommends ros-lyrical-ur-description ros-lyrical-xacro
source /opt/ros/lyrical/setup.bash
SHARE=$(ros2 pkg prefix ur_description)/share/ur_description
mkdir -p /out/urdf/meshes
xacro "$SHARE/urdf/ur.urdf.xacro" ur_type:=ur5e name:=ur > /out/urdf/ur5e.urdf
cp -r "$SHARE/meshes/ur5e" /out/urdf/meshes/ur5e
cp "$SHARE/package.xml" /out/urdf/ur_description_package.xml
cp "$SHARE"/LICENSE* /out/urdf/ 2>/dev/null || true
