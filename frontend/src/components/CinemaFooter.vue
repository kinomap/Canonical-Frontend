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
 <div class="footer-inner">
  <div class="footer-brand-block">
   <img class="footer-mascot" src="/cinema/v1/footer-mascot-400.webp" srcset="/cinema/v1/footer-mascot-240.webp 240w, /cinema/v1/footer-mascot-400.webp 400w" sizes="(max-width: 600px) 130px, 180px" width="400" height="510" alt="Маскот KINOSOTA в режиссёрском кресле с кинохлопушкой" loading="lazy" decoding="async" />
   <div><CinemaBrand /><p>Твоя следующая история<br />начинается здесь.</p><span class="gold-swash" aria-hidden="true"></span></div>
  </div>
  <nav class="footer-column" aria-label="Кинотека"><h2>КИНОТЕКА</h2><router-link v-for="item in library" :key="item.to" :to="item.to">{{item.name}}</router-link></nav>
  <nav class="footer-column" aria-label="Жанры"><h2>ЖАНРЫ</h2><router-link v-for="item in genres" :key="item.slug" :to="`/genres?genre=${item.slug}`">{{item.name}}</router-link><router-link to="/genres">Все жанры</router-link></nav>
  <nav class="footer-column" aria-label="Полезное"><h2>ПОЛЕЗНОЕ</h2><button @click="focusSearch"><Search :size="16" aria-hidden="true" />Поиск</button><a :href="telegramUrl" target="_blank" rel="noopener noreferrer">Мы в Telegram</a><a :href="telegramUrl" target="_blank" rel="noopener noreferrer">Сообщество</a><router-link to="/profile">Личный кабинет</router-link></nav>
  <aside class="telegram-promo" aria-labelledby="telegram-promo-title"><div class="telegram-heading"><span class="telegram-icon"><Send :size="27" aria-hidden="true" /></span><h2 id="telegram-promo-title">НЕ ПРОПУСТИ<br /><span>НОВИНКИ</span></h2></div><p>Новые фильмы, сериалы и подборки — в нашем Telegram.</p><a :href="telegramUrl" target="_blank" rel="noopener noreferrer" class="telegram-subscribe">ПОДПИСАТЬСЯ <ArrowRight :size="22" aria-hidden="true" /></a></aside>
 </div>
 <img class="footer-filmstrip" src="/cinema/v1/filmstrip-1600.webp" srcset="/cinema/v1/filmstrip-800.webp 800w, /cinema/v1/filmstrip-1600.webp 1600w" sizes="100vw" width="1600" height="148" alt="Киноплёнка со студиями Universal, WB, Paramount, 20th Century Studios, Lionsgate, A24. Больше, чем просто просмотр" loading="lazy" decoding="async" />
</footer>
</template>
