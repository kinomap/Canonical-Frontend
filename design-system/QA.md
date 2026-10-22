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
