<template>
  <aside class="vps-guide" aria-label="Рекомендации по выбору VPS для медиа-ноды">
    <h3>Рекомендации по выбору VPS для медиа-ноды</h3>
    <dl>
      <div><dt>CPU</dt><dd>2–4 vCPU. Высокая частота важна для TLS и криптографии MTProto.</dd></div>
      <div><dt>RAM</dt><dd>Минимум 4 ГБ, рекомендуется 8 ГБ: 512 МБ–2 ГБ для L1-кэша, остальное — ОС, Nginx и SingleFlight.</dd></div>
      <div><dt>Диск</dt><dd>40–80 ГБ NVMe SSD; оставьте 20–40 ГБ свободными для горячего L2-кэша.</dd></div>
      <div><dt>Сеть</dt><dd>Порт 1 Гбит/с или 10 Гбит/с; безлимитный трафик либо 10–30 ТБ/месяц.</dd></div>
      <div><dt>ОС / KVM</dt><dd>Ubuntu 22.04 / 24.04 LTS, строго KVM — не OpenVZ/LXC. Нужны Docker, WireGuard и nftables.</dd></div>
    </dl>
    <p>На маленьком тестовом VPS лимит L2 автоматически ограничивается 70% текущего свободного диска. Это не заменяет достаточный запас RAM и диска.</p>
  </aside>
</template>
<style scoped>
.vps-guide { border: 1px solid #334155; border-radius: 8px; padding: 16px; margin: 16px 0; background: #172334; color: #e2e8f0; }
h3 { font-size: 17px; margin: 0 0 12px; } dl { margin: 0; } dl div { display: grid; grid-template-columns: 88px 1fr; gap: 12px; margin: 12px 0; }
dt { font-weight: 600; } dd { margin: 0; line-height: 1.5; font-size: 14px; } p { color: #cbd5e1; font-size: 14px; line-height: 1.5; margin: 16px 0 0; }
@media(max-width:480px) { dl div { grid-template-columns: 1fr; gap: 4px; } }
</style>
