<template>
 <section class="compatibility" role="alert" aria-labelledby="compatibility-title">
  <h2 id="compatibility-title">Не удалось воспроизвести этот формат в браузере</h2>
  <p>Фильм остаётся в каталоге. Его формат или кодеки могут не поддерживаться вашим браузером.</p>
  <p>Для просмотра этого формата может потребоваться KINOSOTA Player. Проверить наличие сборки для Windows, macOS или Linux можно в профиле. Скачивание опубликованных сборок доступно с платной подпиской.</p>
  <router-link class="primary" to="/profile#desktop-player">Перейти в профиль</router-link>
  <router-link to="/player">Подробнее о KINOSOTA Player</router-link>
 </section>
</template>
<style scoped>
.compatibility{padding:clamp(24px,5vw,64px);background:#10171d;border:1px solid #b88d27;border-radius:12px;color:#eef2f6;display:flex;flex-direction:column;align-items:flex-start;gap:16px;min-height:260px;justify-content:center}.compatibility h2{font-size:clamp(22px,3vw,30px);margin:0;line-height:1.25}.compatibility p{max-width:650px;margin:0;color:#c2cbd3;line-height:1.6}.compatibility a{color:#ffce40;min-height:44px;display:inline-flex;align-items:center;padding:8px 0}.compatibility .primary{background:#ffc400;color:#141414;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700}.compatibility a:focus-visible{outline:2px solid white;outline-offset:4px}
</style>
