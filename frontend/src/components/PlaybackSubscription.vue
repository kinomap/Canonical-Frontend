<script setup lang="ts">
import { onMounted, ref } from 'vue'
defineProps<{poster?: string}>()
const heading = ref<HTMLElement | null>(null)
onMounted(() => heading.value?.focus({preventScroll: true}))
</script>

<template>
  <section class="subscription-player" aria-labelledby="subscription-player-title">
    <img v-if="poster" class="subscription-poster" :src="poster" alt="" />
    <div class="subscription-shade"></div>
    <div class="subscription-message">
      <span class="subscription-badge">KINOSOTA <b>PRO</b></span>
      <h2 id="subscription-player-title" ref="heading" tabindex="-1">Этот фильм доступен по подписке</h2>
      <p>Оформите платную подписку PRO, чтобы продолжить просмотр. Или выберите другой фильм в каталоге.</p>
      <div class="subscription-actions">
        <router-link class="subscription-primary" to="/profile?tab=billing">Выбрать подписку <span aria-hidden="true">→</span></router-link>
        <router-link class="subscription-secondary" to="/movies">Выбрать другой фильм</router-link>
      </div>
      <span class="subscription-note">Условия и стоимость доступны на странице подписки</span>
    </div>
  </section>
</template>

<style scoped>
.subscription-player{position:relative;isolation:isolate;display:grid;place-items:center;aspect-ratio:16/9;min-height:360px;overflow:hidden;border:1px solid #313131;border-radius:12px;background:#181818;color:#fff;font-family:inherit}
.subscription-poster{position:absolute;inset:0;z-index:-3;width:100%;height:100%;object-fit:cover;filter:blur(4px);opacity:.35;transform:scale(1.03)}
.subscription-shade{position:absolute;inset:0;z-index:-2;background:#000000;opacity:.6}
.subscription-message{display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;max-width:680px;padding:40px 24px;text-align:center;box-sizing:border-box}
.subscription-badge{display:inline-flex;align-items:center;gap:8px;font-size:14px;line-height:20px;font-weight:600;letter-spacing:.08em;color:#fff}
.subscription-badge b{border:1px solid #eac54f;border-radius:4px;padding:2px 8px;background:#131209;color:#f4cc4c;font-size:12px;line-height:16px;font-weight:600}
.subscription-message h2{margin:0;font-size:30px;line-height:36px;font-weight:600;text-wrap:balance;outline:none}
.subscription-message h2:focus-visible{outline:2px solid #f4cc4c;outline-offset:8px;border-radius:4px}
.subscription-message p{margin:0;max-width:540px;color:#dedede;font-size:16px;line-height:24px;text-wrap:pretty}
.subscription-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.subscription-actions a{display:inline-flex;align-items:center;justify-content:center;gap:16px;min-height:44px;box-sizing:border-box;border:1px solid #f4cc4c;border-radius:8px;padding:8px 12px;font-size:16px;line-height:24px;font-weight:600;text-decoration:none;transition:background-color 300ms cubic-bezier(.22,1,.36,1),color 300ms cubic-bezier(.22,1,.36,1),opacity 300ms cubic-bezier(.22,1,.36,1)}
.subscription-primary{color:#131209;background:#f4cc4c}.subscription-primary:hover{background:#ffe180}
.subscription-actions .subscription-secondary{border-color:#757575;background:#181818;color:#fff}.subscription-secondary:hover{background:#313131}
.subscription-actions a:focus-visible{outline:2px solid #fff;outline-offset:4px}.subscription-actions a:active{opacity:.8}
.subscription-note{font-size:12px;line-height:16px;color:#bdbdbd}
@media(max-width:600px){.subscription-player{min-height:400px}.subscription-message{padding:24px 16px;gap:16px}.subscription-message h2{font-size:24px;line-height:32px}.subscription-actions{flex-direction:column;width:100%;max-width:320px}.subscription-actions a{width:100%}}
@media(prefers-reduced-motion:reduce){.subscription-actions a{transition:none}}
</style>
