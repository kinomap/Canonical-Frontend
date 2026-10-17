<script setup lang="ts">
import { ref } from 'vue'
const current = ref(''), password = ref(''), confirmation = ref(''), busy = ref(false), error = ref(''), success = ref('')
async function save() {
  error.value=''; success.value=''
  if (password.value !== confirmation.value) { error.value='Новые пароли не совпадают.'; return }
  if (password.value.length < 15 || password.value.length > 128) { error.value='Используйте от 15 до 128 символов.'; return }
  busy.value=true
  try {
    const response = await fetch('/api/v1/auth/change-password', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({current_password:current.value,new_password:password.value})})
    const data=await response.json()
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось изменить пароль.')
    current.value=''; password.value=''; confirmation.value=''
    success.value='Пароль изменён. Остальные сеансы завершены; текущий вход сохранён.'
  } catch (e:any) { error.value=e.message } finally { busy.value=false }
}
</script>
<template>
  <section class="password-security">
    <h2>Безопасность · Сменить пароль</h2>
    <p>Длинная уникальная фраза: 15–128 символов. Разрешены пробелы и вставка из менеджера паролей. Не используйте пароль от другого сайта.</p>
    <form @submit.prevent="save">
      <label>Текущий пароль<input v-model="current" type="password" autocomplete="current-password" required maxlength="1024" /></label>
      <label>Новый пароль<input v-model="password" type="password" autocomplete="new-password" required minlength="15" maxlength="128" /></label>
      <label>Повторите новый пароль<input v-model="confirmation" type="password" autocomplete="new-password" required minlength="15" maxlength="128" /></label>
      <p v-if="error" role="alert" class="error">{{error}}</p><p v-if="success" role="status" class="success">{{success}}</p>
      <button type="submit" :disabled="busy">{{busy?'Сохраняем…':'Сменить пароль и завершить другие сеансы'}}</button>
    </form>
  </section>
</template>
<style scoped>
.password-security{padding:24px;border:1px solid #475569;border-radius:12px;margin:20px 0;color:#e2e8f0;background:#18202d;max-width:640px}.password-security p{line-height:1.6}label{display:block;margin:12px 0}input{display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:6px;color:#fff;background:#0f172a;border:1px solid #64748b;border-radius:6px}button{padding:12px 16px;border:0;border-radius:6px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer}button:disabled{opacity:.5}.error{color:#fca5a5}.success{color:#86efac}
</style>
