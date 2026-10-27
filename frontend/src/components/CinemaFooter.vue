<script setup lang="ts">
import CinemaBrand from './CinemaBrand.vue'
import { Send, ArrowRight, Search } from 'lucide-vue-next'
// Official channel confirmed by the operator; one destination for every footer CTA.
const telegramUrl = 'https://t.me/kinosota'
const library = [{name:'Фильмы',to:'/movies'},{name:'Сериалы',to:'/series'},{name:'Новинки',to:'/movies?sort=newest'},{name:'Популярное',to:'/movies?sort=popular'},{name:'Подборки',to:'/discover'}]
const genres = [{name:'Боевик',slug:'boevik'},{name:'Комедия',slug:'komedija'},{name:'Фантастика',slug:'fantastika'},{name:'Ужасы',slug:'uzhasy'},{name:'Триллер',slug:'triller'},{name:'Драма',slug:'drama'}]
function focusSearch(){ window.dispatchEvent(new CustomEvent('showcase:search')) }
</script>
<template>
<footer class="cinema-footer">
 <div class="footer-stage" aria-hidden="true">
  <picture class="footer-interior">
   <source media="(min-width: 1400px)" srcset="/cinema/v4/footer-interior-1400.webp 1400w, /cinema/v4/footer-interior-2000.webp 2000w" sizes="100vw" />
   <img src="/cinema/v4/footer-mobile-scene.webp" width="365" height="440" alt="" loading="lazy" decoding="async" />
  </picture>
 </div>
 <div class="footer-inner">
  <div class="footer-brand-block">

   <div><CinemaBrand /><p>Твоя следующая история<br />начинается здесь.</p><span class="gold-swash" aria-hidden="true"></span></div>
  </div>
  <nav class="footer-column" aria-label="Кинотека"><h2>КИНОТЕКА</h2><router-link v-for="item in library" :key="item.to" :to="item.to">{{item.name}}</router-link></nav>
  <nav class="footer-column" aria-label="Жанры"><h2>ЖАНРЫ</h2><router-link v-for="item in genres" :key="item.slug" :to="`/genres?genre=${item.slug}`">{{item.name}}</router-link><router-link to="/genres">Все жанры</router-link></nav>
  <nav class="footer-column" aria-label="Полезное"><h2>ПОЛЕЗНОЕ</h2><button @click="focusSearch"><Search :size="16" aria-hidden="true" />Поиск</button><a :href="telegramUrl" target="_blank" rel="noopener noreferrer">Мы в Telegram</a><a :href="telegramUrl" target="_blank" rel="noopener noreferrer">Сообщество</a><router-link to="/profile">Личный кабинет</router-link><router-link to="/player">Приложение для ПК</router-link></nav>
  <aside class="telegram-promo" aria-labelledby="telegram-promo-title"><div class="telegram-heading"><span class="telegram-icon"><Send :size="27" aria-hidden="true" /></span><h2 id="telegram-promo-title">НЕ ПРОПУСТИ<br /><span>НОВИНКИ</span></h2></div><p>Новые фильмы, сериалы и подборки — в нашем Telegram.</p><a :href="telegramUrl" target="_blank" rel="noopener noreferrer" class="telegram-subscribe">ПОДПИСАТЬСЯ <ArrowRight :size="22" aria-hidden="true" /></a></aside>
 </div>
 <img class="footer-filmstrip" src="/cinema/v4/footer-mobile-strip.webp" width="2000" height="215" alt="Киноплёнка со студиями Universal, WB, Paramount, 20th Century Studios, Lionsgate, A24. Больше, чем просто просмотр" loading="lazy" decoding="async" />
</footer>
</template>
