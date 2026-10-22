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
