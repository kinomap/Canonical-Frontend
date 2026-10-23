# KINOSOTA · Единая UI-система

Один источник: `tokens.css` (семантика), `foundation.css` (доступные базовые элементы), `BrandMark.vue` (фирменный знак). Оба приложения импортируют их до локальных стилей. Геометрия экранов остаётся scoped: публичная витрина — крупные постеры, админка — плотные таблицы и формы.

Направление: Taste Skill `true-black-flat`, seed 22, исходник Leonxlnx/taste-skill commit `6010f91a9935f1c167dfc500fb1a475681892e6b`. Нейтральные тёмные поверхности, инвертированное основное действие, синий только для бренда/ссылок/данных. Статусы имеют текст, не только цвет. Manrope хранится локально; лицензия и хеши в `fonts/`.

## Правила
- Не задавать новые цвета/шрифты в компонентах; использовать `--ui-*`.
- Кнопки/поля: 40 px на desktop, 44 px на mobile; радиусы 8/12 px.
- Числа — tabular-nums, код — monospace, обычные тексты — Manrope.
- Сохранять видимый keyboard-focus, `prefers-reduced-motion`, подписи полей и осмысленные пустые/ошибочные состояния.
- Затемнения над видео/постерами и белый фон QR — намеренные исключения; не заменять непрозрачной поверхностью.
- Миграция не меняет API, правила показа рекламы, авторизацию, платежи или настройки инфраструктуры.

## Проверка / сборка
```sh
(cd frontend && npm ci && npm test -- --maxWorkers=2 && npm run build)
(cd admin-frontend && npm ci && npm test && npm run build)
node --test design-system/tests/*.test.mjs
```
Все три Dockerfile копируют `design-system/` в build-stage. Shared SFC разрешает Vue из зависимостей конкретного приложения (Vite alias + TS paths), без нового root package/node_modules. Зависимости не удалены. Выкатка только из чистого зафиксированного Git-коммита через `control-plan/deployment/canonical/deploy_committed.py`; runtime-секреты не входят в Git.

## Личный кабинет — пользовательский референс 2026-10-23

По отдельному запросу владельца `.account-page` имеет локальный тематический слой: тёмные сине-чёрные карточки, синий primary, зелёные/янтарные реальные статусы и декоративный кинофон. Это намеренное исключение из нейтральной общей палитры; storefront за пределами кабинета и Admin не перекрашены. Семантические `--ui-*` переопределены только внутри account root и наследуются существующими Billing/Security-компонентами. Manrope, доступность, mobile sizing и reduced motion общие.

`account-reference.test.mjs` проверяет scoped-границы, контраст текста/primary >=4.5 и границ полей/focus >=3. Default primary #2473df/white — контраст 4.57:1. Декоративные card-границы не заменяют видимый focus.

API не расширялись: аватар, поддерживаемые поля, Telegram, платежи, настройки и 2FA используют прежние обработчики. Сессии берутся из /account/sessions; количество — сеансы, не выдуманные устройства. При ошибке — состояние «недоступны», не 0/1 по умолчанию. Для revoke-others добавлено явное подтверждение, single-session revoke Backend не поддерживает. Пароль/2FA при редактировании профиля показываются только для смены логина/email; прежняя серверная reauthentication остаётся обязательной.

История/избранное с account-scoped API и хранилищем в текущей версии отсутствуют; фиктивные вкладки не добавлены. Тема и иные неработающие настройки также не добавлялись.

Браузерный скрипт `scripts/verify_account_layout.mjs`: QA_ORIGIN указывает на локальный readonly preview с существующим authenticated API relay, QA_CDP — порт отдельного тестового Chrome, QA_EVIDENCE — каталог доказательств. Это не обход авторизации публичного сайта; local cookie-session marker работает только совместно с серверным QA relay. Скрипт читает реальные данные, переключает UI, не меняет аккаунты и не проводит платежи. 4 раздела × 5 размеров (1536/1024/768/390/320), нулевые JS errors/broken images/page overflow. Действия записи покрыты компонентными тестами с fixtures.

### PRO billing reference (2026-10-23)
BillingPanel uses the account cinematic palette with compact benefit/plan cards, blue selected borders and primary actions, distinct network icons, amber Stars, real promo/history states. The free membership CTA only scrolls to existing plans. Desktop account navigation remains reachable while scrolling the billing page; mobile remains in document flow. No prices, payment handlers, APIs, TON validation, invoice polling, wallet proof/MFA, promo payloads or purchase history rules changed. No faux clickable benefit chevrons.

`verify_billing_layout.mjs` captures 5 widths / four page regions against a readonly localhost relay and separate local unavailable/invoice/error fixtures. Fixtures never create real orders, call wallet bridges or submit transfers. Payment action tests use mocks and the real transaction validator without network submission.
