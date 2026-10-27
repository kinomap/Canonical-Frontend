<template>
  <section class="playback-unavailable" role="alert" aria-labelledby="unavailable-title">
    <h2 id="unavailable-title">Фильм больше недоступен на сайте</h2>
    <p>Попробуйте позднее — возможно, он появится снова.</p>
    <router-link to="/movies">Вернуться в каталог</router-link>
  </section>
</template>
<style scoped>
.playback-unavailable{padding:clamp(24px,5vw,64px);background:#10171d;border:1px solid #b88d27;border-radius:12px;color:#eef2f6;display:flex;flex-direction:column;align-items:flex-start;gap:16px;min-height:240px;justify-content:center}.playback-unavailable h2{font-size:clamp(22px,3vw,30px);line-height:1.25;margin:0}.playback-unavailable p{margin:0;color:#c2cbd3;line-height:1.6}.playback-unavailable a{display:inline-flex;align-items:center;min-height:44px;color:#ffce40}.playback-unavailable a:focus-visible{outline:2px solid white;outline-offset:4px}
</style>
