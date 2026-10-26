<script setup lang="ts">
import { Star, Flame, Film, Tv, Gamepad2, Drama, Orbit, Skull, ScanSearch, Grid2X2 } from 'lucide-vue-next'
const categories = [
 {name:'Новинки',to:'/movies?sort=newest',icon:Star}, {name:'Популярное',to:'/movies?sort=popular',icon:Flame},
 {name:'Фильмы',to:'/movies',icon:Film}, {name:'Сериалы',to:'/series',icon:Tv},
 {name:'Боевик',to:'/genres?genre=boevik',icon:Gamepad2}, {name:'Комедия',to:'/genres?genre=komedija',icon:Drama},
 {name:'Фантастика',to:'/genres?genre=fantastika',icon:Orbit}, {name:'Ужасы',to:'/genres?genre=uzhasy',icon:Skull},
 {name:'Триллер',to:'/genres?genre=triller',icon:ScanSearch}, {name:'Все жанры',to:'/genres',icon:Grid2X2}
]
</script>
<template><nav class="quick-categories" aria-label="Быстрые категории"><router-link v-for="category in categories" :key="category.name" :to="category.to"><component :is="category.icon" :size="22" aria-hidden="true" />{{category.name}}</router-link></nav></template>
