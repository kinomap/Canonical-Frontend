# Проверка UI-релиза

## Изменения
Общие семантические токены, базовые элементы, self-hosted Manrope и BrandMark используются обоими SPA. Миграция scoped CSS не изменяет бизнес-логику рекламы, авторизации, платежей или сетевую архитектуру. Исключения в скриптах: импорт общего логотипа и русские тексты ошибок входа администратора.

## Повторяемые проверки
```sh
(cd frontend && npm test -- --maxWorkers=1 && npm run build)
(cd admin-frontend && npm test && npm run build)
node --test design-system/tests/*.test.mjs
python3 -m pytest -q tests
# После сборки public image: реальный Nginx, аватары, жанры и локальный шрифт
python3 scripts/verify_public_static.py --image kinosota-public-frontend:COMMIT_SHA
```

## Браузерная матрица
Размеры 1440, 768, 390 px; login, registration, home, movies, series, genres; admin overview, movies, Ad Studio, audience, security, media nodes, system, login. Проверять отсутствие JS-исключений, битых картинок и горизонтального скролла всей страницы. Внутренний скролл таблиц и вкладок допустим.

Дополнительно: загрузка ролика и подтверждение удаления **с отменой**, мобильное меню, профиль, подписка, 2FA и настройки. Внешние видео должны загружаться непосредственно с Media Node. Нельзя удалять реальные ролики или проводить оплату ради проверки цвета/верстки. Проверять фокус клавиатурой и reduced-motion. Предпросмотр реальных API не является проверкой Telegram-реавторизации/платежа end-to-end.

Для UI-релиза перезапускаются только private-admin и public frontend из зафиксированного SHA. Backend, PostgreSQL, WireGuard и Media Node не перезапускаются без отдельного функционального изменения. Перед выкаткой полный backend-прогон, свежий зашифрованный runtime-backup и проверка восстановления в изолированной БД.


## Brand + Security/Settings — 2026-10-23
Right-side security/settings visual layer only. Approved sidebar identity/menu/logout/art unchanged; branding/hover are the only exceptions. Shared transparent 3D bee (8,576 bytes, 132px for a 44px UI slot) and genuine vector compact/favicons. Full PNG/SVG/ICO exports + Russian guide + SHA256 in brand/export. 3D SVG files documented as embedded-raster mascot with vector outlined wordmark.

Public 161, admin 77, design 23, Python 31 +3 subtests; both builds pass. Read-only actual-Backend preview: 20 screenshots /40 invariant checks across five widths. Local-only disabled/setup/recovery/empty-sessions/settings fixtures: 26 screenshots; hover/focus + reduced motion verified. Four business scripts and original event/model bindings unchanged (icon imports excepted). No real 2FA, password, profile, payment or session mutations performed. No API/backend/schema/node modifications.

Visual review corrected phone-crop text fragments and mobile wizard spacing/scroll margins. Evidence outside Git: implementation/brand-security-20261023.
