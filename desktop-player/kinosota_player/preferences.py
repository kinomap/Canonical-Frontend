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
