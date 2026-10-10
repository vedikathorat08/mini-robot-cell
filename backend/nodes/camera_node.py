#!/usr/bin/env python3
"""Camera node: real webcam if available, else a synthetic 1280x720 frame.

Serves the latest JPEG on /frame.jpg and an MJPEG stream on /mjpeg.
"""
import io
import math
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yaml
from PIL import Image, ImageDraw

CONFIG_PATH = "/app/config/cell.yaml"


def load_config(path=CONFIG_PATH):
    with open(path) as f:
        return yaml.safe_load(f)


def synthetic_frame(width, height, t):
    """Top-down view of the table: wood top, grid, and a coloured object moving on it."""
    img = Image.new("RGB", (width, height), (196, 168, 120))
    draw = ImageDraw.Draw(img)
    for x in range(0, width, 80):
        draw.line([(x, 0), (x, height)], fill=(180, 152, 106))
    for y in range(0, height, 80):
        draw.line([(0, y), (width, y)], fill=(180, 152, 106))
    cx = width / 2 + math.cos(t) * width * 0.3
    cy = height / 2 + math.sin(t * 0.7) * height * 0.3
    draw.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], fill=(40, 90, 200))
    draw.text((20, 20), "OVERHEAD CAMERA (top-down)  " + time.strftime("%H:%M:%S"), fill=(30, 30, 30))
    draw.text((20, 40), "image up = +X base, image right = -Y base", fill=(30, 30, 30))
    return img


def try_open_webcam(device):
    """Return an opened cv2.VideoCapture or None. Never raises."""
    if os.environ.get("NO_CAMERA") == "1":
        print("WARNING: NO_CAMERA=1, using synthetic camera", flush=True)
        return None
    if not os.path.exists(device):
        print(f"WARNING: {device} not found, using synthetic camera", flush=True)
        return None
    try:
        import cv2
        cap = cv2.VideoCapture(device)
        if cap.isOpened():
            return cap
    except Exception as exc:  # noqa: BLE001 - any failure means fallback
        print(f"WARNING: camera open failed ({exc}), using synthetic camera", flush=True)
        return None
    print(f"WARNING: could not open {device}, using synthetic camera", flush=True)
    return None


def to_jpeg(img):
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


class FrameStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._jpeg = b""

    def set(self, jpeg):
        with self._lock:
            self._jpeg = jpeg

    def get(self):
        with self._lock:
            return self._jpeg


def capture_loop(store, cfg):
    cam = cfg["camera"]
    width, height, period = cam["width"], cam["height"], 1.0 / cam["fps"]
    cap = try_open_webcam(cam["device"])
    start = time.time()
    while True:
        frame_img = None
        if cap is not None:
            ok, frame = cap.read()
            if ok:
                import cv2
                rgb = cv2.cvtColor(cv2.resize(frame, (width, height)), cv2.COLOR_BGR2RGB)
                frame_img = Image.fromarray(rgb)
            else:
                print("WARNING: webcam read failed, switching to synthetic camera", flush=True)
                cap.release()
                cap = None
        if frame_img is None:
            frame_img = synthetic_frame(width, height, time.time() - start)
        store.set(to_jpeg(frame_img))
        time.sleep(period)


def make_handler(store):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if self.path.startswith("/frame.jpg"):
                self.send_jpeg()
            elif self.path.startswith("/mjpeg"):
                self.stream_mjpeg()
            else:
                self.send_error(404)

        def send_jpeg(self):
            data = store.get()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def stream_mjpeg(self):
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.end_headers()
            try:
                while True:
                    data = store.get()
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(data)}\r\n\r\n".encode())
                    self.wfile.write(data + b"\r\n")
                    time.sleep(0.1)
            except (BrokenPipeError, ConnectionResetError):
                pass

    return Handler


def main():
    cfg = load_config()
    store = FrameStore()
    threading.Thread(target=capture_loop, args=(store, cfg), daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", cfg["camera_http"]["port"]), make_handler(store))
    print(f"camera_node serving on :{cfg['camera_http']['port']}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
