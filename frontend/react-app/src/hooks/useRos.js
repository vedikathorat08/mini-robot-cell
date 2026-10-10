import { useCallback, useEffect, useRef, useState } from "react";
import ROSLIB from "roslib";

const RECONNECT_MS = 2000;

const rosUrl = () =>
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/rosbridge`;

const makeTopic = (ros, name, messageType) => new ROSLIB.Topic({ ros, name, messageType });

export function useRos() {
  const url = rosUrl();
  const [connected, setConnected] = useState(false);
  const [jointStates, setJointStates] = useState(null);
  const [pickTarget, setPickTarget] = useState(null);
  const [ikStatus, setIkStatus] = useState("");
  const topics = useRef({});

  useEffect(() => {
    let closed = false;
    let timer = null;
    let ros = null;

    const connect = () => {
      ros = new ROSLIB.Ros({ url });
      ros.on("connection", () => {
        const states = makeTopic(ros, "/joint_states", "sensor_msgs/msg/JointState");
        states.subscribe((msg) =>
          setJointStates(Object.fromEntries(msg.name.map((n, i) => [n, msg.position[i]])))
        );
        const pick = makeTopic(ros, "/pick_target", "geometry_msgs/msg/PointStamped");
        pick.subscribe((msg) => setPickTarget({ dx: msg.point.x, dy: msg.point.y }));
        const ik = makeTopic(ros, "/ik_status", "std_msgs/msg/String");
        ik.subscribe((msg) => setIkStatus(msg.data));
        topics.current = {
          states,
          pick,
          ik,
          command: makeTopic(ros, "/joint_command", "sensor_msgs/msg/JointState"),
          estop: makeTopic(ros, "/estop", "std_msgs/msg/Bool"),
          move: makeTopic(ros, "/move_to_pick", "std_msgs/msg/Empty"),
        };
        setConnected(true);
      });
      ros.on("error", () => {});
      ros.on("close", () => {
        topics.current = {};
        setConnected(false);
        if (!closed) timer = setTimeout(connect, RECONNECT_MS);
      });
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      topics.current.states?.unsubscribe();
      topics.current.pick?.unsubscribe();
      topics.current.ik?.unsubscribe();
      ros?.close();
    };
  }, [url]);

  const publishCommand = useCallback((names, positions) => {
    topics.current.command?.publish(
      new ROSLIB.Message({
        header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "" },
        name: names,
        position: positions,
        velocity: [],
        effort: [],
      })
    );
  }, []);

  const publishEstop = useCallback((value) => {
    topics.current.estop?.publish(new ROSLIB.Message({ data: value }));
  }, []);

  const moveToPick = useCallback(() => {
    topics.current.move?.publish(new ROSLIB.Message({}));
  }, []);

  return { connected, url, jointStates, pickTarget, ikStatus, publishCommand, publishEstop, moveToPick };
}