import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader from "urdf-loader";

// Poses the robot ONLY from the jointValues prop (which comes from /joint_states).
export default function RobotViewer({ jointValues, onLoaded }) {
  const mountRef = useRef(null);
  const robotRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef0f3);

    // ROS is Z-up, so the camera is Z-up too and the robot needs no rotation.
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
    camera.up.set(0, 0, 1);
    camera.position.set(1.4, 1.4, 1.0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(2, 2, 3);
    scene.add(sun);

    const grid = new THREE.GridHelper(2, 20, 0x999999, 0xcccccc);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0.4);
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

    let frame = 0;
    const tick = () => {
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
    };
  }, [onLoaded]);

  useEffect(() => {
    const robot = robotRef.current;
    if (!robot || !jointValues) return;
    Object.entries(jointValues).forEach(([name, value]) => robot.joints[name]?.setJointValue(value));
  }, [jointValues]);

  return <div ref={mountRef} className="viewer-canvas" />;
}
