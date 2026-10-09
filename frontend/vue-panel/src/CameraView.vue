<script setup>
import { clientToSource } from "./pickMath.js";

defineProps({ src: { type: String, required: true } });
const emit = defineEmits(["pick"]);

function onClick(event) {
  const img = event.currentTarget;
  if (!img.naturalWidth) return;
  const { u, v } = clientToSource(
    event.clientX, event.clientY, img.getBoundingClientRect(), img.naturalWidth, img.naturalHeight
  );
  emit("pick", { u, v, width: img.naturalWidth, height: img.naturalHeight });
}
</script>

<template>
  <div class="camera">
    <img :src="src" alt="camera" @click="onClick" />
    <div class="cross-h" />
    <div class="cross-v" />
  </div>
</template>

<style scoped>
.camera { position: relative; width: 100%; max-width: 640px; line-height: 0; }
.camera img { width: 100%; height: auto; display: block; cursor: crosshair; border: 1px solid #d5d9e0; }
.cross-h, .cross-v { position: absolute; background: rgba(0, 200, 255, 0.9); pointer-events: none; }
.cross-h { left: 0; right: 0; top: 50%; height: 1px; }
.cross-v { top: 0; bottom: 0; left: 50%; width: 1px; }
</style>