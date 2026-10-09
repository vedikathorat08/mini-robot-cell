<script setup>
import { computed, onMounted, ref } from "vue";
import CameraView from "./CameraView.vue";
import { loadConfig } from "./config.js";
import { latencyOffsetMm, sourceToMm } from "./pickMath.js";
import { useRosPublisher } from "./useRosPublisher.js";

const config = ref(null);
const pick = ref(null);
const { connected, publishPoint } = useRosPublisher();

onMounted(() => loadConfig().then((c) => (config.value = c)).catch(console.error));

const mmPerPixel = computed(() => config.value?.calibration.mm_per_pixel ?? 0.4);
const beltSpeed = computed(() => config.value?.conveyor.belt_speed_mps ?? 0.25);
const latencyMs = computed(() => config.value?.conveyor.latency_ms ?? 200);
const compensationMm = computed(() => latencyOffsetMm(beltSpeed.value, latencyMs.value));
const offsetMm = computed(() =>
  pick.value ? sourceToMm(pick.value.u, pick.value.v, pick.value.width, pick.value.height, mmPerPixel.value) : null
);

const fmt = (n) => n.toFixed(1);

function onPick(p) {
  pick.value = p;
  publishPoint(offsetMm.value.dx, offsetMm.value.dy);
}
</script>

<template>
  <section class="vue-panel">
    <h2>Camera &amp; Pick Panel <small>(Vue)</small></h2>
    <CameraView src="/camera/mjpeg" @pick="onPick" />
    <ul class="readout">
      <li v-if="pick">Pixel (u, v): ({{ fmt(pick.u) }}, {{ fmt(pick.v) }})</li>
      <li v-else>Click the image to pick a point</li>
            <li v-if="offsetMm">Offset: dx = {{ fmt(offsetMm.dx) }} mm, dy = {{ fmt(offsetMm.dy) }} mm</li>
      <li>Scale: {{ mmPerPixel }} mm/px</li>
            <li>Latency compensation: +{{ fmt(compensationMm) }} mm along +X
        ({{ beltSpeed }} m/s x {{ latencyMs }} ms)</li>
      
      <li :class="connected ? 'ok' : 'bad'">pick_target link: {{ connected ? "connected" : "disconnected" }}</li>
    </ul>
  </section>
</template>

<style scoped>
.vue-panel { padding: 8px 24px 24px; font-family: Arial, sans-serif; color: #1d2430; }
h2 { font-size: 18px; margin: 8px 0 12px; }
.readout { list-style: none; padding: 0; margin: 12px 0 0; font-size: 14px; line-height: 1.7; }
.ok { color: #1a8f3c; }
.bad { color: #c62828; }
</style>