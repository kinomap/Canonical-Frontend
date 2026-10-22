# Возврат к месту в каталоге

Исправление использует историю Vue Router: полный URL фильтров/страницы и сохранённую прокрутку. Возврат ждёт окончания загрузки списка, чтобы короткий skeleton не обрезал позицию. Прямая ссылка без истории списка возвращает в /movies. Ctrl/Cmd-клик остаётся обычной ссылкой.

Автотесты: `cd frontend && npm test -- --maxWorkers=1`; `npm run build`.
Регрессии: CatalogNavigation.spec.ts, CatalogPageRestore.spec.ts.

Браузерная проверка: `QA_ORIGIN=http://127.0.0.1:PORT QA_CDP=OWNED_CHROME_DEBUG_PORT QA_EVIDENCE=/absolute/evidence/path node scripts/verify_catalog_return.mjs`.
Скрипт подключается к уже запущенному тестовому браузеру; не запускает Chrome и не меняет данные. Используйте отдельный тестовый профиль. Для внешнего сайта используйте разрешённый общий браузер.

Проверяются desktop 1440 и mobile 390, страница 2 + сортировка, одинаковые карточки и точное scrollY, кнопка страницы, browser Back, reload detail → Back. Сервер локального preview дополнительно задерживал GET /movies на 800 ms. Скрипт не нажимает Play и не проверяет медиапоток.
