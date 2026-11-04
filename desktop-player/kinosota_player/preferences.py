"""Local, non-secret preferences and deterministic RU/EN presentation.

Catalogue providers do not always supply an English translation. Never invent one:
prefer title_en, then provider original_title, then the catalogue title.
"""
from PySide6.QtCore import QSettings

TEXT = {
 'Сессия завершена. Откройте фильм снова.':'Playback session ended. Open the movie again.',
 'Воспроизведение завершено.':'Playback finished.',
 'Проверяем доступность фильма…':'Checking movie availability…',
 'Не удалось воспроизвести видео. Проверьте соединение и повторите позднее.':'Could not play the video. Check your connection and try again later.',
 'Ваш личный\nкинотеатр.':'Your personal\ncinema.',
 'Каталог KINOSOTA и просмотр через mpv.\nВойдите аккаунтом сайта и выбирайте кино.':'Your KINOSOTA library, powered by mpv.\nSign in with your website account.',
 'Вход в KINOSOTA':'Sign in to KINOSOTA',
 'Приложение доступно с платной подпиской.':'A paid subscription is required.',
 'Логин или email':'Username or email','Пароль':'Password','Код 2FA':'2FA code',
 'Если включена двухфакторная защита':'Only if two-factor authentication is enabled',
 'Запомнить вход в защищённом хранилище ОС':'Remember me in the secure OS vault',
 'Войти':'Sign in','или':'or','Войти через аккаунт в браузере  →':'Continue in browser  →',
 '← Назад':'← Previous','Далее →':'Next →','Выйти':'Sign out',
 'Поиск фильмов — название или латиница…':'Search movies by title…',
 'Настройки':'Settings','Закрыть настройки':'Close settings','ПРЕДПОЧТЕНИЯ':'PREFERENCES',
 'Язык интерфейса':'Interface language','Названия фильмов':'Movie titles',
 'Сохраняются на этом устройстве.':'Saved on this device.',
 'EN: английское название, если доступно; иначе — оригинальное или название каталога.':'EN: English when supplied; otherwise the original or catalogue title.',
 'АККАУНТ':'ACCOUNT','Логин':'Username','Почта':'Email','Подписка':'Subscription',
 'Активная платная':'Active · paid','Пробная':'Trial','Бесплатная':'Free','Истекла':'Expired',
 'Не указана':'Not provided','Нет данных':'Unavailable','Обновить аккаунт':'Refresh account',
 'Загружаем аккаунт…':'Loading account…','Не удалось загрузить аккаунт. Повторите.':'Could not load account. Try again.',
 'Введите логин и пароль.':'Enter your username and password.',
 'Проверяем аккаунт…':'Checking your account…','Вход выполнен. Выберите фильм.':'Signed in. Choose a movie.',
 'Вход выполнен. Защищённое хранилище недоступно: сессия останется только в памяти.':'Signed in. Secure vault unavailable; session is kept in memory only.',
 'Ищем фильмы…':'Searching movies…','Загружаем каталог…':'Loading your library…',
 'Ничего не найдено. Попробуйте другое название.':'No results. Try another title.',
 'Выберите фильм':'Choose a movie','Открываем фильм…':'Opening movie…',
 'Не удалось выполнить действие. Проверьте установку mpv и соединение.':'Could not complete the action. Check mpv and your connection.',
 'Вы вышли из аккаунта. Сайт также может запросить повторный вход.':'Signed out. The website may also ask you to sign in again.',
 'Подтвердите вход в открывшемся окне браузера.\nВводить код не нужно.':'Confirm sign-in in your browser.\nNo code is needed.',
 'Ожидаем подтверждение входа в браузере…':'Waiting for browser confirmation…',
 'Время подтверждения истекло. Повторите вход через браузер.':'Confirmation expired. Start browser sign-in again.',
 'Сессия истекла. Войдите снова.':'Your session expired. Please sign in again.',
 'Для приложения нужна действующая платная подписка.':'An active paid subscription is required.',
 'Фильм не найден.':'Movie not found.','Сейчас этот источник недоступен.':'This source is currently unavailable.',
 'Слишком много попыток. Подождите и повторите.':'Too many attempts. Please wait and try again.',
 'Сервис временно недоступен.':'Service temporarily unavailable.','Не удалось выполнить запрос.':'Request failed.',
 'Нет соединения. Проверьте интернет и повторите.':'No connection. Check your internet and try again.',
 'Сервер не вернул сессию приложения.':'The server did not return an app session.',
 'Введите код из приложения-аутентификатора.':'Enter the code from your authenticator app.',
 'Фильм больше недоступен на сайте. Попробуйте позднее — возможно, он появится снова.':'This movie is no longer available. Please try again later.',
 'Медиасервер временно недоступен. Приложение продолжает работать — попробуйте открыть фильм чуть позже.':'Media server unavailable. The app is still working; try this movie later.',
}

TEXT.update({'ВАШ КИНОТЕАТР': 'YOUR CINEMA', 'Мой аккаунт': 'My account', 'О приложении': 'About', 'Помощь': 'Help', 'Персонализируйте приложение под себя.': 'Make the player your own.', 'Интерфейс': 'Interface', 'Язык управления приложением.': 'Choose the app interface language.', 'На каком языке показывать названия.': 'Choose how movie titles are displayed.', 'Язык названий': 'Title language', 'Аккаунт': 'Account', 'Информация о текущем аккаунте.': 'Your current account information.', 'Обновить данные аккаунта': 'Refresh account details', 'Управлять подпиской на сайте': 'Manage subscription on website', 'Выйти из аккаунта': 'Sign out', 'Приложение': 'Application', 'Версия и системная информация.': 'Version and system information.', 'Проверить доступные версии': 'Check available versions', 'Удалить приложение…': 'Uninstall application…', 'Удаление потребует подтверждения ОС. Данные аккаунта на сайте останутся.': 'Removal requires OS confirmation. Your website account is preserved.', 'Установка и безопасность.': 'Installation and security.', 'Windows: запуск после установки включён в мастере. macOS: перенесите приложение в Applications и откройте его. Linux: откройте пакет в менеджере приложений, затем нажмите «Открыть» или запустите KINOSOTA из меню.': 'Windows: launch after setup is enabled in the wizard. macOS: drag the app to Applications, then open it. Linux: open the package in your software manager, then choose Open or launch KINOSOTA from the app menu.', 'Не отключайте защиту ОС. Подпись Windows и notarization macOS пока не подтверждены.': 'Do not disable OS security. Windows signing and macOS notarization are not yet verified.', 'Открыть руководство на сайте': 'Open installation guide', 'Копировать': 'Copy', 'Гость': 'Guest', 'Удалить приложение': 'Uninstall application', 'Удалить KINOSOTA Player с этого компьютера? ОС запросит подтверждение. Другие приложения и аккаунт на сайте не будут удалены.': 'Remove KINOSOTA Player from this computer? The OS will ask for confirmation. Other apps and your website account will not be removed.', 'Подтвердите удаление в системном окне.': 'Confirm removal in the system dialog.', 'Закрыть': 'Close', 'Удаление отменено или недоступно. Приложение не удалено. Закройте окно и повторите через менеджер пакетов.': 'Removal was cancelled or unavailable. The app was not removed. Close this dialog and try your package manager.', 'macOS: закройте плеер и переместите KINOSOTA Player из Applications в Корзину.': 'macOS: close the player and move KINOSOTA Player from Applications to the Trash.', 'Удаление доступно для установленного пакета. Откройте системный менеджер приложений.': 'Uninstall is available for the installed package. Open your system software manager.'})

# 0.1.6: «Торренты» section and website «▶ Смотреть» launches.
TEXT.update({
 'Каталог':'Catalogue','Торренты':'Torrents','Кинотека':'Library','Фильмы':'Movies','Сериалы':'Series',
 'Поиск фильмов и сериалов — название…':'Search movies and series by title…','← К списку':'← Back to list',
 'КАЧЕСТВО':'QUALITY','ЯЗЫК':'LANGUAGE','Русская озвучка':'Russian audio','Украинская озвучка':'Ukrainian audio',
 'Английская дорожка':'English audio','Сериал':'Series','Фильм':'Movie','Выбрано':'Selected','сид':'seeds',
 'Подождите…':'Please wait…','Загружаем…':'Loading…','Повторить':'Retry','Нужна подписка PRO':'PRO subscription required',
 '▶  Смотреть':'▶  Watch','Серия не найдена':'Episode not found','Подготовить раздачу':'Prepare release',
 'Готовим раздачу…':'Preparing release…','Найти раздачи':'Find releases','Добавить в кинотеку':'Add to library',
 'Сезон':'Season','Серия':'Episode','Спецвыпуски':'Specials','Загружаем кинотеку…':'Loading your library…',
 'В кинотеке пока пусто. Найдите фильм или сериал и добавьте его.':'Your library is empty. Find a movie or series and add it.',
 'Раздача поставлена в очередь на проверку':'The release is queued for checking',
 'Повторный поиск станет доступен чуть позже':'Another search will be available a little later',
 'Добавьте запись в кинотеку, чтобы начать поиск':'Add the title to your library to start the search',
 'Ищем раздачи…':'Searching releases…','Добавлено в кинотеку — ищем раздачи':'Added to your library — searching releases',
 'Не удалось выполнить действие. Повторите попытку.':'Could not complete the action. Please try again.',
 'Ссылка из браузера не распознана. Нажмите «Смотреть» на сайте ещё раз.':'The browser link was not recognised. Press “Watch” on the website again.',
 'Войдите в аккаунт — фильм с сайта откроется сразу после входа.':'Sign in — the title from the website opens right after.',
 'Открываем фильм с сайта…':'Opening the title from the website…',
 'Не удалось открыть фильм с сайта. Нажмите «Смотреть» ещё раз.':'Could not open the title from the website. Press “Watch” again.',
 'Этот запуск создан другим аккаунтом. Войдите в приложение тем же аккаунтом, что и на сайте.':'This launch belongs to another account. Sign in to the app with the same account as on the website.',
 'Ссылка устарела. Нажмите «Смотреть» на сайте ещё раз.':'The link has expired. Press “Watch” on the website again.',
 'Для просмотра торрентов нужна подписка PRO.':'A PRO subscription is required for torrents.',
 'Раздача ещё готовится. Попробуйте через минуту.':'The release is still being prepared. Try again in a minute.',
 'Такой серии нет в выбранной раздаче.':'This episode is not in the selected release.',
 'Медиасервер временно недоступен. Попробуйте открыть фильм чуть позже.':'Media server unavailable. Try this title a little later.',
})

# 0.1.7: header sections, «Фильтры» panel, found counter, pages and bookmarks.
TEXT.update({
 'Главная':'Home','Поиск фильмов и сериалов...':'Search movies and series...','Сетка':'Grid','Список':'List',
 'Найдено:':'Found:','Страница':'Page','Вперёд →':'Next →','Торрент':'Torrent',
 'Фильтры':'Filters','Показать фильтры':'Show filters','Скрыть фильтры':'Hide filters',
 'Жанры':'Genres','Рейтинг':'Rating','Год выпуска':'Release year','Источник':'Source','Сортировка':'Sort by',
 'Сбросить':'Reset','Все жанры':'All genres','Выбрать жанры':'Choose genres','Убрать жанр':'Remove genre',
 'Сбросить жанры':'Clear genres','Загружаем жанры…':'Loading genres…',
 'Не удалось загрузить жанры. Откройте список ещё раз.':'Could not load genres. Open the list again.',
 'Любой':'Any','от':'from','С любого':'From any','По любой':'To any',
 'Все источники':'All sources','KINOSOTA':'KINOSOTA','По популярности':'Most popular','По рейтингу':'Top rated',
 'Новинки':'Newest','По названию':'Title A–Z','Сериалы доступны только из торрентов':'Series come from torrents only',
 'Ничего не найдено. Измените или сбросьте фильтры.':'Nothing found. Change or reset the filters.',
 'Добавлено в кинотеку':'Added to your library','Удалено из кинотеки':'Removed from your library',
 'Фильм больше недоступен':'This movie is no longer available','Загружаем каталог…':'Loading the catalogue…',
})

def translate(text, language):
    if language != 'en': return text
    if text in TEXT: return TEXT[text]
    for prefix, replacement in [('Найдено: ', 'Found: '), ('Воспроизводится: ', 'Playing: ')]:
        if text.startswith(prefix): return replacement + text[len(prefix):]
    return text

class Preferences:
    def __init__(self, settings=None):
        self.settings=settings if settings is not None else QSettings('KINOSOTA','Player')
    def get(self,key):
        value=self.settings.value(key,'ru')
        return value if value in ('ru','en') else 'ru'
    def set(self,key,value):
        if key not in ('interface_language','title_language') or value not in ('ru','en'):
            raise ValueError('Unsupported preference')
        self.settings.setValue(key,value);self.settings.sync()

def movie_title(movie, language='ru'):
    keys=('title_en','original_title','title') if language=='en' else ('title_ru','title','original_title')
    return next((movie[k].strip() for k in keys if isinstance(movie.get(k),str) and movie[k].strip()),'KINOSOTA')
