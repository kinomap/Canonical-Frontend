<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Tv, X, Copy, Check, Smartphone, QrCode, LogIn, ExternalLink } from 'lucide-vue-next'
import { TV_DEVICE_LIMIT, MSX_START_PARAMETER, TV_ENTRY_PATH, MSX_PLATFORMS } from '@/lib/tvConnect'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

async function copyStartParameter() {
  try {
    await navigator.clipboard?.writeText(MSX_START_PARAMETER)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    copied.value = false
  }
}

watch(() => props.show, (open) => {
  if (open) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
}, { immediate: true })

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(copiedTimer)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="tv-modal-overlay" data-testid="tv-connect-overlay" @click.self="close">
      <section
        class="tv-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-connect-title"
        data-testid="tv-connect-modal"
      >
        <button type="button" class="tv-modal-close" aria-label="Закрыть" data-testid="tv-connect-close" @click="close">
          <X :size="20" aria-hidden="true" />
        </button>

        <header class="tv-modal-head">
          <div class="tv-modal-icon"><Tv :size="30" aria-hidden="true" /></div>
          <h2 id="tv-connect-title" class="tv-modal-title">KINOSOTA на телевизоре</h2>
          <p class="tv-modal-lead">Три простых шага, и кино уже на большом экране.</p>
          <span class="tv-limit-badge" data-testid="tv-limit-badge">
            До {{ TV_DEVICE_LIMIT }} ТВ-устройств на одну подписку / аккаунт
          </span>
        </header>

        <ol class="tv-steps">
          <li class="tv-step" data-testid="tv-step-msx">
            <span class="tv-step-num">1</span>
            <div class="tv-step-body">
              <h3>Запуск на любом телевизоре через Media Station X</h3>
              <p>
                Откройте магазин приложений на вашем ТВ
                ({{ MSX_PLATFORMS.join(', ') }})
                и установите бесплатное приложение <b>Media Station X</b>.
              </p>
              <p>В настройках MSX (<b>Settings → Start Parameter</b>) укажите плейлист:</p>
              <div class="tv-param">
                <code data-testid="tv-start-parameter">{{ MSX_START_PARAMETER }}</code>
                <button type="button" class="tv-copy-btn" data-testid="tv-copy-parameter" @click="copyStartParameter">
                  <Check v-if="copied" :size="16" aria-hidden="true" />
                  <Copy v-else :size="16" aria-hidden="true" />
                  {{ copied ? 'Скопировано' : 'Копировать' }}
                </button>
              </div>
            </div>
          </li>

          <li class="tv-step" data-testid="tv-step-login">
            <span class="tv-step-num">2</span>
            <div class="tv-step-body">
              <h3><LogIn :size="18" aria-hidden="true" /> Вход в KINOSOTA</h3>
              <p>Нажмите большую кнопку <b>«ВОЙТИ В KINOSOTA»</b> на экране вашего ТВ.</p>
            </div>
          </li>

          <li class="tv-step" data-testid="tv-step-qr">
            <span class="tv-step-num">3</span>
            <div class="tv-step-body">
              <h3><QrCode :size="18" aria-hidden="true" /> Мгновенная авторизация по QR-коду</h3>
              <p>
                Вам не нужно набирать логин и пароль с пульта! На экране ТВ появится QR-код
                и 6-значный PIN. Просто наведите камеру телефона
                <Smartphone :size="15" aria-hidden="true" class="inline-icon" />
                — ТВ авторизуется за 1 секунду.
              </p>
            </div>
          </li>
        </ol>

        <a
          :href="TV_ENTRY_PATH"
          class="tv-open-btn"
          target="_blank"
          rel="noopener"
          data-testid="tv-open-browser"
        >
          <ExternalLink :size="18" aria-hidden="true" />
          Открыть ТВ-версию в браузере (для теста)
        </a>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tv-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.78);
  overflow-y: auto;
}

.tv-modal-card {
  position: relative;
  width: 100%;
  max-width: 560px;
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 28px 24px 24px;
  background: var(--ui-bg, #0d0e12);
  border: 1px solid var(--ui-border, #2a2c33);
  border-radius: var(--ui-radius-panel, 14px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
  color: var(--ui-text, #f3f4f6);
}

.tv-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-secondary, #a1a1aa);
  cursor: pointer;
}

.tv-modal-close:hover,
.tv-modal-close:focus-visible {
  background: var(--ui-raised, #1c1e24);
  color: var(--ui-text, #fff);
}

.tv-modal-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  margin-bottom: 20px;
}

.tv-modal-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(0, 210, 255, 0.12);
  color: #00d2ff;
}

.tv-modal-title {
  margin: 4px 0 0;
  font-size: 1.35rem;
  font-weight: 700;
}

.tv-modal-lead {
  margin: 0;
  color: var(--ui-secondary, #a1a1aa);
  font-size: 0.95rem;
}

.tv-limit-badge {
  margin-top: 4px;
  padding: 6px 12px;
  border: 1px solid rgba(244, 212, 94, 0.45);
  border-radius: 999px;
  background: rgba(244, 212, 94, 0.1);
  color: #f4d45e;
  font-size: 0.85rem;
  font-weight: 600;
}

.tv-steps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0 0 22px;
  padding: 0;
  list-style: none;
}

.tv-step {
  display: flex;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--ui-border, #2a2c33);
  border-radius: var(--ui-radius, 10px);
  background: var(--ui-raised, #15171c);
}

.tv-step-num {
  flex: 0 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #9ce8d7;
  color: #0d0e12;
  font-weight: 800;
}

.tv-step-body h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 6px;
  font-size: 1rem;
  font-weight: 700;
}

.tv-step-body p {
  margin: 0 0 6px;
  color: var(--ui-secondary, #c4c4cc);
  font-size: 0.92rem;
  line-height: 1.45;
}

.inline-icon {
  vertical-align: -2px;
}

.tv-param {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.tv-param code {
  padding: 6px 10px;
  border-radius: 6px;
  background: #0d0e12;
  color: #9ce8d7;
  font-size: 0.95rem;
  font-weight: 700;
  user-select: all;
}

.tv-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--ui-border, #2a2c33);
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text, #fff);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.tv-copy-btn:hover,
.tv-copy-btn:focus-visible {
  border-color: #9ce8d7;
  color: #9ce8d7;
}

.tv-open-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--ui-radius, 10px);
  background: #f4d45e;
  color: #0d0e12;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s ease;
}

.tv-open-btn:hover,
.tv-open-btn:focus-visible {
  background: #9ce8d7;
  outline: none;
}
</style>
