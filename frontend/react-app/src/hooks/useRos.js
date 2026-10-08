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
        topics.current = {
          states,
          command: makeTopic(ros, "/joint_command", "sensor_msgs/msg/JointState"),
          estop: makeTopic(ros, "/estop", "std_msgs/msg/Bool"),
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

  return { connected, url, jointStates, publishCommand, publishEstop };
}
