// Displayed-image click -> source-image pixel. Handles display size != source size.
export function clientToSource(clientX, clientY, rect, naturalWidth, naturalHeight) {
  return {
    u: ((clientX - rect.left) * naturalWidth) / rect.width,
    v: ((clientY - rect.top) * naturalHeight) / rect.height,
  };
}

// Source pixel -> mm offset from image centre. Image y points down, so +dy is down.
export function sourceToMm(u, v, width, height, mmPerPixel) {
  return { dx: (u - width / 2) * mmPerPixel, dy: (v - height / 2) * mmPerPixel };
}

// Extra offset along +X: belt_speed [m/s] * latency [s] * 1000 [mm/m].
export function latencyOffsetMm(beltSpeedMps, latencyMs) {
  return beltSpeedMps * (latencyMs / 1000) * 1000;
}