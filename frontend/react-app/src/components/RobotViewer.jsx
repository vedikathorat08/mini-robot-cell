import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader from "urdf-loader";

const MM = 0.001;

// Image up = +X (base_link), image right = -Y. dx, dy are mm from the image centre (image y down).
function targetToBase(dx, dy, center) {
  return [center[0] - dy * MM, center[1] - dx * MM];
}

// Tabletop, overhead camera and the camera's field of view drawn on the table.
function addTable(scene, cfg) {
  const group = new THREE.Group();
  const [cx, cy] = cfg.table.center_m;
  const [sx, sy] = cfg.table.size_m;

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xc4a878 })
  );
  top.position.set(cx, cy, -0.01);
  group.add(top);

  const mmPerPx = cfg.calibration.mm_per_pixel;
  const halfX = (cfg.camera.height * mmPerPx * MM) / 2; // image height spans base X
  const halfY = (cfg.camera.width * mmPerPx * MM) / 2; // image width spans base Y
  const camPos = new THREE.Vector3(cx, cy, cfg.camera_pose.height_m);
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(
    ([a, b]) => new THREE.Vector3(cx + a * halfX, cy + b * halfY, 0.003)
  );
  const pts = [];
  corners.forEach((c, i) => pts.push(camPos, c, c, corners[(i + 1) % 4]));
  group.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x0099cc })
    )
  );

  const cam = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  cam.position.copy(camPos);
  group.add(cam);

  scene.add(group);
  return group;
}

// Poses the robot ONLY from jointValues (from /joint_states). target comes from /pick_target.
export default function RobotViewer({ jointValues, onLoaded, config, target }) {
  const mountRef = useRef(null);
  const robotRef = useRef(null);
  const sceneRef = useRef(null);
  const markerRef = useRef(null);
  const readoutRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xeef0f3);

    // ROS is Z-up, so the camera is Z-up too and the robot needs no rotation.
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
    camera.up.set(0, 0, 1);
    camera.position.set(1.5, -1.4, 1.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(2, 2, 3);
    scene.add(sun);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd32f2f })
    );
    marker.visible = false;
    scene.add(marker);
    markerRef.current = marker;

    const linkGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const link = new THREE.Line(linkGeom, new THREE.LineBasicMaterial({ color: 0xd32f2f }));
    link.frustumCulled = false;
    link.visible = false;
    scene.add(link);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.3, 0, 0.3);
    controls.update();

    const resize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    let cancelled = false;
    const loader = new URDFLoader();
    loader.packages = { ur_description: "/urdf" };
    loader.load("/urdf/ur5e.urdf", (robot) => {
      if (cancelled) return;
      robotRef.current = robot;
      scene.add(robot);
      onLoaded(robot);
    });

    const tip = new THREE.Vector3();
    let frame = 0;
    const tick = () => {
      const tool = robotRef.current?.links?.tool0;
      if (marker.visible && tool) {
        tool.getWorldPosition(tip);
        const pos = linkGeom.attributes.position;
        pos.setXYZ(0, tip.x, tip.y, tip.z);
        pos.setXYZ(1, marker.position.x, marker.position.y, marker.position.z);
        pos.needsUpdate = true;
        link.visible = true;
        if (readoutRef.current) {
          const mm = tip.distanceTo(marker.position) * 1000;
          readoutRef.current.textContent =
            `tool0 to target: ${mm.toFixed(0)} mm (MOVE TO TARGET hovers the tool above it)`; // CHANGED
        }
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      markerRef.current = null;
    };
  }, [onLoaded]);

  useEffect(() => {
    const robot = robotRef.current;
    if (!robot || !jointValues) return;
    Object.entries(jointValues).forEach(([name, value]) => robot.joints[name]?.setJointValue(value));
  }, [jointValues]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !config) return undefined;
    const group = addTable(scene, config);
    return () => scene.remove(group);
  }, [config]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !config || !target) return;
    const [x, y] = targetToBase(target.dx, target.dy, config.table.center_m);
    marker.position.set(x, y, 0.02);
    marker.visible = true;
  }, [target, config]);

  return (
    <>
      <div ref={mountRef} className="viewer-canvas" />
      <div ref={readoutRef} className="readout-3d" />
      <div className="legend">
        Brown = table · dark box = overhead camera · blue lines = camera view · red = pick target
      </div>
    </>
  );
}