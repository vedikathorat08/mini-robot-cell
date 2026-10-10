import { useCallback, useEffect, useRef, useState } from "react";
import { loadConfig } from "./config.js";
import { useRos } from "./hooks/useRos.js";
import RobotViewer from "./components/RobotViewer.jsx";
import JointSliders from "./components/JointSliders.jsx";

const ESTOP_HEARTBEAT_MS = 1000;
const RESYNC_DELAY_MS = 300;

// Limits come from the URDF, not from hard-coded values.
function extractJoints(robot) {
  return Object.values(robot.joints)
    .filter((j) => j.jointType !== "fixed")
    .map((j) => ({
      name: j.name,
      lower: j.ignoreLimits ? -Math.PI : j.limit.lower,
      upper: j.ignoreLimits ? Math.PI : j.limit.upper,
    }));
}

export default function App() {
  const { connected, url, jointStates, pickTarget, ikStatus, publishCommand, publishEstop, moveToPick } = useRos();
  const [config, setConfig] = useState(null);
  const [joints, setJoints] = useState([]);
  const [targets, setTargets] = useState(null);
  const [estop, setEstop] = useState(false);
  const jointStatesRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => alive && setConfig(c)).catch(console.error);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    jointStatesRef.current = jointStates;
  }, [jointStates]);

  const onRobotLoaded = useCallback((robot) => setJoints(extractJoints(robot)), []);

  // Start the sliders from the robot's reported state, once.
  useEffect(() => {
    if (targets === null && jointStates && joints.length) setTargets({ ...jointStates });
  }, [targets, jointStates, joints]);

  // After an IK move the arm is somewhere new: re-sync sliders so the next slider move
  // does not send stale values for the other joints.
  useEffect(() => {
    if (!ikStatus.startsWith("OK")) return undefined;
    const id = setTimeout(() => {
      if (jointStatesRef.current) setTargets({ ...jointStatesRef.current });
    }, RESYNC_DELAY_MS);
    return () => clearTimeout(id);
  }, [ikStatus]);

  // While latched, keep re-sending E-STOP so the backend re-latches after a restart.
  useEffect(() => {
    if (!connected || !estop) return undefined;
    publishEstop(true);
    const id = setInterval(() => publishEstop(true), ESTOP_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [connected, estop, publishEstop]);

  const sendTargets = (next) => publishCommand(Object.keys(next), Object.values(next));

  const handleSlider = (name, value) => {
    if (estop || !targets) return;
    const next = { ...targets, [name]: value };
    setTargets(next);
    sendTargets(next);
  };

  const handleHome = () => {
    if (estop || !config || !joints.length) return;
    const next = Object.fromEntries(joints.map((j, i) => [j.name, config.home_pose_rad[i]]));
    setTargets(next);
    sendTargets(next);
  };

  const handleEstop = () => {
    setEstop(true);
    publishEstop(true);
  };

  const handleReset = () => {
    setEstop(false);
    publishEstop(false);
  };

  return (
    <div className="app">
      <header>
        <h1>Mini Robot Cell Operator Console</h1>
        <span className={`status ${connected ? "ok" : "bad"}`}>
          ● {connected ? "Connected" : "Disconnected"}
        </span>
        <code>{url}</code>
      </header>

      {estop && <div className="banner">E-STOP LATCHED: all commands disabled</div>}

      <main>
        <section className="viewer">
          <RobotViewer jointValues={jointStates} onLoaded={onRobotLoaded} config={config} target={pickTarget} />
        </section>
        <section className="panel">
          <div className="buttons">
            <button onClick={handleHome} disabled={estop || !connected}>HOME</button>
            <button onClick={moveToPick} disabled={estop || !connected || !pickTarget}>MOVE TO TARGET</button>
            <button className="estop" onClick={handleEstop} disabled={estop}>E-STOP</button>
            <button onClick={handleReset} disabled={!estop}>RESET</button>
          </div>
          {ikStatus && <p className="ik-status">IK: {ikStatus}</p>}
          {targets ? (
            <JointSliders
              joints={joints}
              targets={targets}
              actual={jointStates}
              disabled={estop || !connected}
              onChange={handleSlider}
            />
          ) : (
            <p>Waiting for /joint_states…</p>
          )}
        </section>
      </main>
    </div>
  );
}