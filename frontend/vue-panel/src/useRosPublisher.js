import { onBeforeUnmount, onMounted, ref } from "vue";
import ROSLIB from "roslib";

const RECONNECT_MS = 2000;

export function useRosPublisher() {
  const connected = ref(false);
  let ros = null;
  let topic = null;
  let timer = null;
  let closed = false;

  const connect = () => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ros = new ROSLIB.Ros({ url: `${proto}//${location.host}/rosbridge` });
    ros.on("connection", () => {
      topic = new ROSLIB.Topic({ ros, name: "/pick_target", messageType: "geometry_msgs/msg/PointStamped" });
      connected.value = true;
    });
    ros.on("error", () => {});
    ros.on("close", () => {
      topic = null;
      connected.value = false;
      if (!closed) timer = setTimeout(connect, RECONNECT_MS);
    });
  };

  // Units: millimetres, frame_id "camera" (offset from image centre).
  const publishPoint = (x, y) => {
    topic?.publish(
      new ROSLIB.Message({
        header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "camera" },
        point: { x, y, z: 0 },
      })
    );
  };

  onMounted(connect);
  onBeforeUnmount(() => {
    closed = true;
    clearTimeout(timer);
    ros?.close();
  });

  return { connected, publishPoint };
}