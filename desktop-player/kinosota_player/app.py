"""Native catalogue shell; all network work runs outside the UI thread."""
import sys, time, webbrowser, subprocess
from .engine import child_environment, native_loader
from pathlib import Path
from PySide6.QtCore import Qt, QObject, QRunnable, QThreadPool, Signal, QTimer, QSize
from PySide6.QtGui import QIcon, QPixmap, QFontDatabase
from .theme import CinemaBackdrop, PREMIUM_STYLE
from PySide6.QtWidgets import (QApplication,QMainWindow,QWidget,QVBoxLayout,QHBoxLayout,QLabel,
 QLineEdit,QPushButton,QStackedWidget,QListWidget,QListWidgetItem,QCheckBox,QFormLayout,QFrame,QScrollArea,QSizePolicy)
from .api import Api, ApiError
from .credentials import SessionVault
from .engine import Mpv
from .catalog import PosterGrid
from .preferences import Preferences,translate,movie_title
from .settings import SettingsDrawer
ASSET=Path(__file__).parent/'assets'/'drone.png'
STYLE=PREMIUM_STYLE

class Signals(QObject):
    done=Signal(object);failed=Signal(object)
class Job(QRunnable):
    def __init__(self,fn):super().__init__();self.fn=fn;self.signals=Signals()
    def run(self):
        try:self.signals.done.emit(self.fn())
        except Exception as error:self.signals.failed.emit(error)

def label(text,name='',wrap=False):
    x=QLabel(text);x.setObjectName(name);x.setWordWrap(wrap);x.setTextFormat(Qt.TextFormat.PlainText);return x

def button(text,fn,primary=False):
    b=QPushButton(text);b.setCursor(Qt.CursorShape.PointingHandCursor)
    if primary:b.setObjectName('primary')
    b.clicked.connect(fn);return b

class StatusLabel(QLabel):
    def __init__(self,window):
        super().__init__();self.window=window;self.raw='';self.setObjectName('message');self.setTextFormat(Qt.TextFormat.PlainText);self.setWordWrap(True);self.setFixedHeight(36)
    def setText(self,text):
        self.raw=text;super().setText(translate(text,self.window.language));self.setToolTip(translate(text,self.window.language))

class Window(QMainWindow):
    def __init__(self,api=None,engine=None,vault=None,restore=True,preferences=None):
        super().__init__();[QFontDatabase.addApplicationFont(str(font)) for font in (ASSET.parent/'fonts').glob('*.ttf')];self.api=api or Api();self.engine=engine or Mpv();self.vault=vault or SessionVault()
        self.preferences=preferences or Preferences();self.language=self.preferences.get("interface_language");self.title_language=self.preferences.get("title_language");self.bound=[];self.account={}
        self.pool=QThreadPool(self);self.pool.setMaxThreadCount(3);self.jobs=set();self.session='';self.playing_movie='';self.closed=False;self.epoch=0;self.play_generation=0;self.search_generation=0;self.search_running=False;self.search_queued=False;self.pending_stops=[]
        self.page=1;self.query='';self.total_pages=1;self.pair=None;self.pair_until=0;self.pending_poll=False;self.pending_beat=False;self.busy=False
        self.setWindowTitle('KINOSOTA Player');self.setWindowIcon(QIcon(str(ASSET)));self.resize(1240,840);self.setMinimumSize(760,600)
        root=CinemaBackdrop();self.backdrop=root;layout=QVBoxLayout(root);layout.setContentsMargins(24,16,24,12);layout.setSpacing(10);self.root_layout=layout
        head=QHBoxLayout();icon=label('');icon.setPixmap(QPixmap(str(ASSET)).scaled(40,40,Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation));head.addWidget(icon);head.addWidget(self.brand_label());head.addStretch();head.addWidget(label('DESKTOP · PRO','hint'));self.settings_button=button('',self.open_settings);head.addWidget(self.settings_button);layout.addLayout(head)
        self.pages=QStackedWidget();layout.addWidget(self.pages,1)
        self.make_login();self.make_catalog();self.message=StatusLabel(self);layout.addWidget(self.message)
        self.setCentralWidget(root);self.setStyleSheet(PREMIUM_STYLE)
        self.drawer=SettingsDrawer(root,self.preferences);self.drawer.languageChanged.connect(self.set_language);self.drawer.titlesChanged.connect(self.set_title_language);self.drawer.refreshRequested.connect(self.refresh_account);self.drawer.signOutRequested.connect(self.logout)
        self.retranslate();self.pages.currentChanged.connect(lambda _:self.adapt_layout())
        self.pair_timer=QTimer(self);self.pair_timer.setInterval(5000);self.pair_timer.timeout.connect(self.poll_pair)
        self.lease_timer=QTimer(self);self.lease_timer.timeout.connect(self.beat)
        self.process_timer=QTimer(self);self.process_timer.setInterval(1000);self.process_timer.timeout.connect(self.check_process);self.process_timer.start()
        if restore:
            self.api.token=self.vault.load()
            if self.api.token:self.work(self.api.access,self.signed_in)
    def brand_label(self):
        x=QLabel('KINO<span style="color:#ffd400">SOTA</span> <span style="color:#aeb5be;font-weight:400"> / PLAYER</span>')
        x.setObjectName('brand');return x
    def work(self,fn,done=None,fail=None):
        epoch=self.epoch
        job=Job(fn);self.jobs.add(job)
        def finish(value):
            self.jobs.discard(job)
            if not self.closed and epoch==self.epoch and done:done(value)
        def failure(error):
            self.jobs.discard(job)
            if not self.closed and epoch==self.epoch:(fail or self.show_error)(error)
        job.signals.done.connect(finish);job.signals.failed.connect(failure);self.pool.start(job)
    def text(self,text,name='',wrap=False):
        x=label(translate(text,self.language),name,wrap);self.bound.append((x,text));return x
    def make_login(self):
        page=QWidget();outer=QHBoxLayout(page);outer.setSpacing(28);outer.setContentsMargins(0,0,0,0)
        self.hero_copy=QWidget();copy=QVBoxLayout(self.hero_copy);copy.setContentsMargins(8,0,8,8);copy.addStretch(4);copy.addWidget(self.text('Ваш личный\nкинотеатр.','hero'));copy.addSpacing(8);copy.addWidget(self.text('Каталог KINOSOTA и просмотр через mpv.\nВойдите аккаунтом сайта и выбирайте кино.','muted',True));copy.addSpacing(10);copy.addWidget(label('Windows · macOS · Linux','hint'));copy.addStretch();outer.addWidget(self.hero_copy,1)
        self.login_card=card=QFrame();card.setObjectName('card');card.setMaximumWidth(480);card.setSizePolicy(QSizePolicy.Policy.Preferred,QSizePolicy.Policy.Maximum);v=QVBoxLayout(card);self.login_layout=v;v.setContentsMargins(24,22,24,22);v.setSpacing(8)
        v.addWidget(self.text('Вход в KINOSOTA','loginTitle'));v.addWidget(self.text('Приложение доступно с платной подпиской.','hint',True));v.addSpacing(4)
        self.identity=QLineEdit();self.password=QLineEdit();self.password.setEchoMode(QLineEdit.EchoMode.Password);self.otp=QLineEdit();self.otp.setMaxLength(32)
        for title,field in [('Логин или email',self.identity),('Пароль',self.password),('Код 2FA',self.otp)]:
            l=self.text(title,'fieldLabel');l.setBuddy(field);v.addWidget(l);v.addWidget(field)
        self.remember=QCheckBox();self.remember.setChecked(bool(self.vault.backend));v.addWidget(self.remember)
        self.login_button=button('',self.login,True);v.addWidget(self.login_button);self.password.returnPressed.connect(self.login);self.otp.returnPressed.connect(self.login)
        self.browser_button=button('',self.start_pair);v.addWidget(self.browser_button)
        self.pair_label=self.text('','hint',True);self.pair_label.hide();v.addWidget(self.pair_label);outer.addWidget(card,1,Qt.AlignmentFlag.AlignVCenter);self.pages.addWidget(page)
    def make_catalog(self):
        page=QWidget();v=QVBoxLayout(page);v.setContentsMargins(0,0,0,0);v.setSpacing(8)
        row=QHBoxLayout();self.search=QLineEdit();self.search.setMaximumWidth(480);self.search.setMaxLength(100);self.search.returnPressed.connect(self.new_search);row.addWidget(self.search,3);row.addStretch(1);self.account_label=label('','hint');row.addWidget(self.account_label);v.addLayout(row)
        self.search_button=button('Найти',self.new_search,True);self.search_button.hide();self.search.setClearButtonEnabled(True)
        self.search_timer=QTimer(self);self.search_timer.setSingleShot(True);self.search_timer.setInterval(250);self.search_timer.timeout.connect(self.new_search);self.search.textEdited.connect(self.schedule_search)
        self.results=PosterGrid(self.api.origin);self.results.title_language=self.title_language;self.results.itemClicked.connect(self.play);self.results.itemActivated.connect(self.play);v.addWidget(self.results,1)
        self.play_button=QPushButton(self);self.play_button.hide();self.play_button.setEnabled(False);self.selected_title=QLabel(self);self.selected_title.hide();self.results.currentItemChanged.connect(self.selection)
        pagination=QHBoxLayout();self.prev=button('',lambda:self.change_page(-1));self.next=button('',lambda:self.change_page(1));self.page_label=label('','hint');pagination.addWidget(self.prev);pagination.addStretch();pagination.addWidget(self.page_label);pagination.addStretch();pagination.addWidget(self.next);v.addLayout(pagination)
        self.pages.addWidget(page)
    def retranslate(self):
        for widget,text in self.bound:widget.setText(translate(text,self.language))
        for widget,text in [(self.settings_button,'Настройки'),(self.login_button,'Войти'),(self.browser_button,'Войти через аккаунт в браузере  →'),(self.remember,'Запомнить вход в защищённом хранилище ОС'),(self.prev,'← Назад'),(self.next,'Далее →')]:widget.setText(translate(text,self.language))
        for widget,text in [(self.identity,'Логин или email'),(self.password,'Пароль'),(self.otp,'Если включена двухфакторная защита'),(self.search,'Поиск фильмов — название или латиница…')]:widget.setPlaceholderText(translate(text,self.language));widget.setAccessibleName(translate(text,self.language))
        self.message.setText(self.message.raw);self.drawer.retranslate(self.language);self.refresh_titles();self.adapt_layout()
    def set_language(self,language):
        self.preferences.set('interface_language',language);self.language=language;self.drawer.ui_language.blockSignals(True);self.drawer.ui_language.setCurrentIndex(self.drawer.ui_language.findData(language));self.drawer.ui_language.blockSignals(False);self.retranslate()
    def set_title_language(self,language):
        self.preferences.set('title_language',language);self.title_language=language;self.drawer.title_language.blockSignals(True);self.drawer.title_language.setCurrentIndex(self.drawer.title_language.findData(language));self.drawer.title_language.blockSignals(False);self.refresh_titles()
    def refresh_titles(self):
        self.results.title_language=self.title_language
        for i in range(self.results.count()):
            item=self.results.item(i);title=movie_title(item.data(Qt.ItemDataRole.UserRole),self.title_language);item.setText(title);item.setToolTip(title);item.setData(Qt.ItemDataRole.AccessibleTextRole,title)
        self.selection(self.results.currentItem());self.results.viewport().update()
    def open_settings(self):
        self.drawer.signout.setVisible(self.pages.currentIndex()==1);self.drawer.refresh.setVisible(self.pages.currentIndex()==1)
        self.drawer.present()
        if self.pages.currentIndex()==1:self.refresh_account()
    def refresh_account(self):
        if self.drawer.state=='Загружаем аккаунт…':return
        self.drawer.update_account(state='Загружаем аккаунт…')
        def done(data):self.account=dict(data);self.drawer.update_account(data)
        def fail(error):
            if isinstance(error,ApiError) and error.status==401:self.show_error(error)
            else:self.drawer.update_account(state='Не удалось загрузить аккаунт. Повторите.')
        self.work(lambda:self.api.account(),done,fail)
    def adapt_layout(self):
        if not hasattr(self,'login_card'):return
        compact=self.height()<720;self.hero_copy.setVisible(self.width()>=940)
        self.login_layout.setSpacing(5 if compact else 9);self.login_layout.setContentsMargins(22,14 if compact else 24,22,14 if compact else 24)
        self.results.resize_tiles()
    def resizeEvent(self,event):
        super().resizeEvent(event);self.adapt_layout()
    def login(self):
        if self.busy:return
        identity=self.identity.text().strip();password=self.password.text();otp=self.otp.text().strip()
        if not identity or not password:self.message.setText('Введите логин и пароль.');return
        self.pair_timer.stop();self.pair=None
        self.busy=True;self.login_button.setEnabled(False);self.message.setText('Проверяем аккаунт…')
        def done(account):self.busy=False;self.login_button.setEnabled(True);self.password.clear();self.otp.clear();self.signed_in(account)
        def fail(e):self.busy=False;self.login_button.setEnabled(True);self.password.clear();self.otp.clear();self.show_error(e)
        self.work(lambda:self.api.login(identity,password,otp),done,fail)
    def signed_in(self,account):
        if not self.remember.isChecked():self.vault.clear()
        self.pair_timer.stop();self.pair=None;self.pair_label.clear();self.pages.setCurrentIndex(1);self.backdrop.set_catalog(True)
        self.account=dict(account);self.drawer.update_account(self.account);self.account_label.setText(account.get('username',''));self.account_label.setToolTip(account.get('username',''));self.message.setText('Вход выполнен. Выберите фильм.')
        if self.remember.isChecked() and not self.vault.save(self.api.token):self.message.setText('Вход выполнен. Защищённое хранилище недоступно: сессия останется только в памяти.')
        self.new_search()
    def schedule_search(self,*args):
        self.search_generation+=1;self.search_timer.start()
    def new_search(self):
        self.search_timer.stop();self.search_generation+=1;self.query=self.search.text().strip();self.page=1;self.load_results()
    def change_page(self,delta):
        self.search_generation+=1;self.page=max(1,min(self.total_pages,self.page+delta));self.load_results()
    def load_results(self):
        if self.search_running:self.search_queued=True;return
        self.search_running=True;self.search_queued=False
        self.prev.setEnabled(False);self.next.setEnabled(False);self.message.setText('Ищем фильмы…' if self.query else 'Загружаем каталог…')
        page,query,generation=self.page,self.query,self.search_generation
        def current():return generation==self.search_generation and (page,query)==(self.page,self.query)
        def finish():
            self.search_running=False
            if self.search_queued:self.search_queued=False;self.load_results()
        def done(data):
            if current():
                self.results.clear();self.total_pages=max(1,data.get('total_pages',1))
                for movie in data.get('items',[]):
                    title=movie_title(movie,self.title_language);item=QListWidgetItem(title);item.setData(Qt.ItemDataRole.UserRole,movie);item.setToolTip(title);item.setData(Qt.ItemDataRole.AccessibleTextRole,title);self.results.addItem(item)
                    self.results.posters.load(movie.get('poster') or movie.get('poster_url'))
                self.prev.setEnabled(page>1);self.next.setEnabled(page<self.total_pages);self.page_label.setText(f'{page} / {self.total_pages}');self.message.setText('Ничего не найдено. Попробуйте другое название.' if not self.results.count() else f'Найдено: {data.get("total",self.results.count())}')
            finish()
        def fail(e):
            if current():self.prev.setEnabled(page>1);self.next.setEnabled(page<self.total_pages);self.show_error(e)
            finish()
        self.work(lambda:self.api.search(query,page),done,fail)
    def selection(self,item,previous=None):
        self.play_button.setEnabled(bool(item) and not self.busy)
        self.selected_title.setText(movie_title(item.data(Qt.ItemDataRole.UserRole),self.title_language) if item else translate('Выберите фильм',self.language))
    def play(self,*args):
        item=args[0] if args and isinstance(args[0],QListWidgetItem) else self.results.currentItem()
        if not item or self.busy:return
        self.results.setCurrentItem(item)
        movie=item.data(Qt.ItemDataRole.UserRole);self.stop(release=False);self.busy=True;self.play_button.setEnabled(False);self.message.setText('Открываем фильм…')
        epoch=self.epoch;generation=self.play_generation
        def start():
            # Finish our previous lease before asking for another stream slot.
            self.release_pending()
            if self.closed or epoch!=self.epoch or generation!=self.play_generation:raise RuntimeError('Cancelled')
            session=self.api.start(movie['id'])
            try:
                if self.closed or epoch!=self.epoch or generation!=self.play_generation:raise RuntimeError('Cancelled')
                self.engine.start(session['media_url'])
                if self.closed or epoch!=self.epoch or generation!=self.play_generation:self.engine.stop();raise RuntimeError('Cancelled')
            except Exception:
                try:self.api.stop(session['session_id'])
                except Exception:pass
                raise
            return session
        def done(data):
            if generation!=self.play_generation:
                self.work(lambda:self.api.stop(data['session_id']),fail=lambda e:None);return
            self.busy=False;self.play_button.setEnabled(True);self.session=data['session_id'];self.playing_movie=movie['id'];self.lease_timer.start(max(5,data.get('heartbeat_interval_seconds',20))*1000);self.message.setText('Воспроизводится: '+movie_title(movie,self.title_language))
        def fail(e):
            if generation==self.play_generation:self.busy=False;self.play_button.setEnabled(True);self.show_error(e)
        self.work(start,done,fail)
    def pause(self):
        if self.engine.alive():self.work(lambda:self.engine.command(['cycle','pause']))
    def release_pending(self):
        # One API lock serializes stop/start with heartbeat; never end another user's lease.
        with self.api.lock if hasattr(self.api,'lock') else __import__('contextlib').nullcontext():
            for sid in list(self.pending_stops):
                self.api.stop(sid)
                if sid in self.pending_stops:self.pending_stops.remove(sid)
    def stop(self,release=True):
        self.play_generation+=1;self.busy=False;self.play_button.setEnabled(bool(self.results.currentItem()));self.pending_beat=False
        self.lease_timer.stop();sid=self.session;self.session='';self.playing_movie='';self.engine.stop()
        if sid:self.pending_stops.append(sid)
        if release and self.pending_stops:self.work(self.release_pending,fail=lambda e:None)
    def beat(self):
        if not self.session or self.pending_beat:return
        self.pending_beat=True;sid=self.session
        def done(result):
            self.pending_beat=False
            if self.session==sid and not result.get('ok'):self.stop();self.message.setText('Сессия завершена. Откройте фильм снова.')
        def fail(e):
            self.pending_beat=False
            if self.session==sid:self.stop();self.show_error(e)
        self.work(lambda:self.api.heartbeat(sid),done,fail)
    def check_process(self):
        if self.session and not self.engine.alive():
            code=self.engine.exit_code();movie=self.playing_movie
            self.stop()
            if code in (None,0):self.message.setText('Воспроизведение завершено.');return
            self.message.setText('Проверяем доступность фильма…')
            generation=self.play_generation
            def done(result):
                if generation!=self.play_generation:return
                self.message.setText('Фильм больше недоступен на сайте. Попробуйте позднее — возможно, он появится снова.' if result.get('state')=='unavailable' else 'Не удалось воспроизвести видео. Проверьте соединение и повторите позднее.')
            def fail(error):
                if generation==self.play_generation:self.show_error(error)
            self.work(lambda:self.api.request('POST','/playback/diagnose',{'movie_id':movie}),done,fail)
    def show_error(self,error):
        if isinstance(error,ApiError):
            self.message.setText(str(error))
            if error.status==401:
                self.epoch+=1;self.search_timer.stop();self.search_generation+=1;self.search_running=False;self.search_queued=False;self.pair_timer.stop();self.pair=None;self.pending_poll=False;self.login_button.setEnabled(True);self.drawer.dismiss();self.account={};self.drawer.update_account({});self.results.posters.clear();self.results.clear();self.password.clear();self.otp.clear();self.vault.clear();self.stop();self.pages.setCurrentIndex(0);self.backdrop.set_catalog(False);self.identity.setFocus()
        else:self.message.setText('Не удалось выполнить действие. Проверьте установку mpv и соединение.')
    def logout(self):
        self.drawer.dismiss();self.account={};self.drawer.update_account({})
        self.search_timer.stop();self.search_generation+=1;self.search_running=False;self.search_queued=False;self.results.posters.clear();self.epoch+=1;self.busy=False;self.pending_beat=False;self.pending_poll=False;self.login_button.setEnabled(True)
        self.stop();self.pair_timer.stop();self.vault.clear();self.pages.setCurrentIndex(0);self.backdrop.set_catalog(False);self.results.clear()
        self.work(self.api.logout,lambda _:self.message.setText('Вы вышли из аккаунта. Сайт также может запросить повторный вход.'))
    def start_pair(self):
        if self.busy:return
        self.epoch+=1
        self.pair_timer.stop();self.pair=None
        def done(data):
            self.pair=data['device_code'];self.pair_until=time.monotonic()+data['expires_in'];self.message.setText('Ожидаем подтверждение входа в браузере…');webbrowser.open(data['verification_uri']);self.pair_timer.start()
        self.work(lambda:self.api.request('POST','/desktop/pairing/start',{}),done)
    def poll_pair(self):
        if not self.pair:return
        if time.monotonic()>self.pair_until:self.pair_timer.stop();self.pair=None;self.message.setText('Время подтверждения истекло. Повторите вход через браузер.');return
        if self.pending_poll:return
        self.pending_poll=True;code=self.pair
        def done(data):
            self.pending_poll=False
            if code!=self.pair:return
            if data.get('status')=='authorized':
                self.pair_timer.stop();self.api.token=data['access_token'];self.work(self.api.access,self.signed_in)
        def fail(e):self.pending_poll=False;self.pair_timer.stop();self.show_error(e)
        self.work(lambda:self.api.request('POST','/desktop/pairing/exchange',{'device_code':code}),done,fail)
    def closeEvent(self,event):
        self.drawer.dismiss()
        self.search_timer.stop();self.results.posters.clear();self.closed=True;self.pair_timer.stop();self.process_timer.stop();self.stop();self.pool.waitForDone(25000);self.engine.stop();self.api.close();event.accept()

def main():
    if '--version' in sys.argv:
        print('KINOSOTA Player 0.1.5');return 0
    app=QApplication(sys.argv);app.setApplicationName('KINOSOTA Player');app.setOrganizationName('KINOSOTA');app.setDesktopFileName('kinosota-player')
    if '--uninstall' in sys.argv:
        from .installation import show_uninstall
        show_uninstall(language=Preferences().get('interface_language'));return 0
    smoke='--smoke-test' in sys.argv or '--playback-smoke-fixture' in sys.argv
    window=Window(restore=not smoke);window.show()
    if '--playback-smoke-fixture' in sys.argv:
        from .smoke import run_playback_smoke
        try:
            assert not window.windowIcon().isNull()
            assert window.pages.currentIndex()==0
            fixture=sys.argv[sys.argv.index('--playback-smoke-fixture')+1]
            report=sys.argv[sys.argv.index('--playback-smoke-report')+1]
            run_playback_smoke(window.engine,fixture,report)
            return 0
        except Exception as error:
            import json,traceback
            failure={'status':'FAIL','error_type':type(error).__name__,'detail':str(error),'traceback':traceback.format_exc()}
            if '--playback-smoke-report' in sys.argv:
                destination=Path(sys.argv[sys.argv.index('--playback-smoke-report')+1])
                destination.parent.mkdir(parents=True,exist_ok=True)
                destination.write_text(json.dumps(failure,indent=2),encoding='utf-8')
            if sys.stderr:traceback.print_exc()
            return 1
        finally:window.close()
    if smoke:
        try:
            assert not window.windowIcon().isNull(), 'Application icon is missing'
            assert window.pages.currentIndex()==0, 'Smoke test must not log in'
            assert window.password.echoMode()==QLineEdit.EchoMode.Password
            assert window.engine.executable, 'mpv is missing'
            with native_loader():
                subprocess.run([window.engine.executable,'--no-config','--version'],env=child_environment(),check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        except Exception:
            window.close();return 1
        QTimer.singleShot(300,window.close)
    return app.exec()
if __name__=='__main__':raise SystemExit(main())
