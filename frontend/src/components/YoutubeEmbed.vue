<script setup>
defineProps({
  videoId: { type: String, required: true },
});
</script>

<template>
  <div class="wrap">
    <iframe
      :src="`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&playsinline=1`"
      title="live"
      frameborder="0"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
    />
  </div>
</template>

<style scoped>
.wrap {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #000;
}
.wrap iframe {
  position: absolute;
  top: 50%;
  left: 50%;
  /* infla o iframe e recorta pra cobrir o quadro inteiro, sem tarja preta do embed */
  width: 100%;
  height: 100%;
  min-height: 100%;
  min-width: 177.77vh; /* 16:9 */
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
