"""Native catalogue shell; all network work runs outside the UI thread."""
import sys, time, webbrowser, subprocess
from html import escape
from .engine import child_environment, native_loader
from pathlib import Path
from PySide6.QtCore import Qt, QEvent, QObject, QRunnable, QThreadPool, Signal, QTimer, QSize
from PySide6.QtGui import QIcon, QPixmap, QFontDatabase, QKeySequence, QShortcut
from .theme import CinemaBackdrop, GlassFrame, PREMIUM_STYLE, icon
from PySide6.QtWidgets import (QApplication,QMainWindow,QWidget,QVBoxLayout,QHBoxLayout,QLabel,
 QLineEdit,QPushButton,QStackedWidget,QListWidget,QListWidgetItem,QCheckBox,QFormLayout,QFrame,QScrollArea,QSizePolicy,QButtonGroup)
from . import __version__
from .api import API_ORIGIN, Api, ApiError
from .credentials import SessionVault
from .engine import Mpv
from .catalog import PosterGrid, bookmarkable
from .browse import Genres, fetch_page, filtered, page_numbers, signature, load_genres as fetch_genres
from .filters import FilterBar
from .preferences import Preferences,translate,movie_title
from .settings import SettingsDrawer
from .updater import Updater
from .torrents import TorrentPage, audio_args, media_title_args
from .deeplink import parse_launch
from .suggest import SuggestPopup
ASSET=Path(__file__).parent/'assets'/'drone.png'
STYLE=PREMIUM_STYLE
# Header sections. «Кинотека» is the personal library; the others are one filtered catalogue.
NAV=(('home','Главная'),('library','Кинотека'),('movies','Фильмы'),('series','Сериалы'),('torrents','Торренты'))
SECTIONS={'home':('movie','all'),'movies':('movie','site'),'series':('tv','tmdb'),'torrents':('movie','tmdb')}
SOURCE_SECTION={'all':'home','site':'movies','tmdb':'torrents'}

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

class SearchField(QLineEdit):
    """Header search: leading magnifier and a «Ctrl + K» hint while the field is empty."""
    def __init__(self):
        super().__init__();self.setObjectName('headerSearch');self.hint_allowed=True
        self.addAction(icon('search','#8d98a3',16),QLineEdit.ActionPosition.LeadingPosition)
        self.kbd=QLabel('⌘ K' if sys.platform=='darwin' else 'Ctrl + K',self);self.kbd.setObjectName('kbd');self.kbd.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.textChanged.connect(lambda _:self.place_hint())
    def place_hint(self):
        show=self.hint_allowed and not self.text() and self.width()>=230
        self.kbd.adjustSize();self.kbd.setVisible(show)
        if show:self.kbd.move(self.width()-self.kbd.width()-9,(self.height()-self.kbd.height())//2)
        self.setTextMargins(0,0,self.kbd.width()+8 if show else 0,0)
    def resizeEvent(self,event):
        super().resizeEvent(event);self.place_hint()

class Window(QMainWindow):
    def __init__(self,api=None,engine=None,vault=None,restore=True,preferences=None):
        super().__init__();[QFontDatabase.addApplicationFont(str(font)) for font in (ASSET.parent/'fonts').glob('*.ttf')];self.api=api or Api();self.engine=engine or Mpv();self.vault=vault or SessionVault()
        self.preferences=preferences or Preferences();self.language=self.preferences.get("interface_language");self.title_language=self.preferences.get("title_language");self.bound=[];self.account={}
        self.pool=QThreadPool(self);self.pool.setMaxThreadCount(3);self.jobs=set();self.session='';self.playing_movie='';self.closed=False;self.epoch=0;self.play_generation=0;self.search_generation=0;self.search_running=False;self.search_queued=False;self.pending_stops=[]
        self.page=1;self.query='';self.total_pages=1;self.pair=None;self.pair_until=0;self.pending_poll=False;self.pending_beat=False;self.busy=False
        self.torrent_playing=False;self.pending_launch=''
        # 0.1.8: a torrent start is watched (slow-start hint) and a dropped cold stream is reopened twice.
        self.torrent_starting=False;self.torrent_choice=None;self.torrent_started=0.0;self.torrent_attempt=0
        # «Главная» catalogue: section, cached totals of one filter signature, genre lists, bookmarks in flight.
        self.section=self.catalog_section='home';self.totals={};self.found_total=None;self.genres=Genres();self.genres_loading=False;self.bookmark_pending=set();self.nav_compact=None;self.pager_width=7
        self.setWindowTitle('KINOSOTA Player');self.setWindowIcon(QIcon(str(ASSET)));self.resize(1240,840);self.setMinimumSize(760,600)
        root=CinemaBackdrop();self.backdrop=root;layout=QVBoxLayout(root);layout.setContentsMargins(16,10,16,6);layout.setSpacing(8);self.root_layout=layout
        # 0.1.9: the header is a frosted glass bar; its 6 px inset keeps the 8 px tabs concentric with its 14 px corners.
        self.header=GlassFrame('header',14);head=QHBoxLayout(self.header);head.setContentsMargins(12,6,10,6);head.setSpacing(4);self.logo=label('');self.logo.setPixmap(QPixmap(str(ASSET)).scaled(32,32,Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation));head.addWidget(self.logo);head.addSpacing(4)
        self.brand=self.brand_label();head.addWidget(self.brand);head.addSpacing(14)
        self.nav={}
        for name,_ in NAV:self.nav[name]=self.nav_button(lambda _=False,n=name:self.show_section(n));head.addWidget(self.nav[name])
        self.nav_catalog=self.nav['home'];self.nav_torrents=self.nav['torrents'];head.addSpacing(12)
        self.search=SearchField();self.search.setMaxLength(100);self.search.setClearButtonEnabled(True);self.search.setMinimumWidth(150);self.search.setMaximumWidth(430);self.search.setSizePolicy(QSizePolicy.Policy.Expanding,QSizePolicy.Policy.Fixed);head.addWidget(self.search,1);head.addStretch(0)
        # 0.1.8: the avatar opens settings (as on the website); there is no separate gear button.
        self.avatar=QPushButton('K');self.avatar.setObjectName('avatar');self.avatar.setCursor(Qt.CursorShape.PointingHandCursor);self.avatar.clicked.connect(self.open_settings);head.addSpacing(4);head.addWidget(self.avatar);layout.addWidget(self.header)
        self.shortcut=QShortcut(QKeySequence('Ctrl+K'),self);self.shortcut.activated.connect(self.focus_search)
        self.pages=QStackedWidget();layout.addWidget(self.pages,1)
        self.make_login();self.make_catalog();self.message=StatusLabel(self)
        # Status line and the catalogue pages share one row: the poster grid keeps the height.
        bottom=QHBoxLayout();bottom.setSpacing(8);bottom.addWidget(self.message,1);self.pager=QWidget();row=QHBoxLayout(self.pager);row.setContentsMargins(0,0,0,0);row.setSpacing(4)
        self.prev=button('',lambda:self.change_page(-1));self.next=button('',lambda:self.change_page(1))
        for x in (self.prev,self.next):x.setObjectName('pageNav')
        self.pager_numbers=QHBoxLayout();self.pager_numbers.setSpacing(4);row.addWidget(self.prev);row.addLayout(self.pager_numbers);row.addWidget(self.next);self.pager.hide();bottom.addWidget(self.pager,0,Qt.AlignmentFlag.AlignVCenter);layout.addLayout(bottom)
        self.page_label=label('','hint');self.page_label.hide()
        self.make_torrents();root.glass=[self.header,self.filters]
        self.setCentralWidget(root);self.setStyleSheet(PREMIUM_STYLE)
        self.drawer=SettingsDrawer(root,self.preferences);self.drawer.languageChanged.connect(self.set_language);self.drawer.titlesChanged.connect(self.set_title_language);self.drawer.refreshRequested.connect(self.refresh_account);self.drawer.signOutRequested.connect(self.logout)
        # 0.1.9: Settings → «О приложении» installs a newer published build over this one.
        self.updater=Updater(self.api,pool=self.pool,parent=self);self.updater.quitRequested.connect(self.close);self.updater.changed.connect(self.announce_update);self.announced='';self.drawer.set_updater(self.updater)
        self.suggest=SuggestPopup(root,getattr(self.api,'origin',API_ORIGIN));self.suggest.chosen.connect(self.choose_suggestion);self.search.installEventFilter(self)
        self.retranslate();self.pages.currentChanged.connect(self.page_changed);self.page_changed(self.pages.currentIndex())
        self.pair_timer=QTimer(self);self.pair_timer.setInterval(5000);self.pair_timer.timeout.connect(self.poll_pair)
        self.lease_timer=QTimer(self);self.lease_timer.timeout.connect(self.beat)
        self.process_timer=QTimer(self);self.process_timer.setInterval(1000);self.process_timer.timeout.connect(self.check_process);self.process_timer.start()
        self.start_timer=QTimer(self);self.start_timer.setSingleShot(True);self.start_timer.setInterval(3000);self.start_timer.timeout.connect(self.slow_start)
        if restore:
            self.api.token=self.vault.load()
            if self.api.token:self.work(self.api.access,self.signed_in)
    def brand_label(self):
        x=QLabel('KINO<span style="color:#ffd400">SOTA</span> <span style="color:#aeb5be;font-weight:500">Player</span>')
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
    def nav_button(self,fn):
        b=QPushButton();b.setObjectName('nav');b.setCheckable(True);b.setCursor(Qt.CursorShape.PointingHandCursor);b.clicked.connect(fn);return b
    def make_torrents(self):
        self.torrents=TorrentPage(self.api,self.work,self.show_error,lambda text:self.message.setText(text),self.language,self.title_language,embedded=True)
        self.torrents.playRequested.connect(self.play_torrent);self.torrents.listShown.connect(self.library_shown);self.pages.addWidget(self.torrents)
        self.torrents.backdropChanged.connect(self.show_title_art)  # 0.1.8: title backdrop behind the header.
    def page_changed(self,index):
        if index!=2:self.torrents.poll.stop()  # Detail progress polling only while it is on screen.
        if index==2:self.torrents.render_backdrop()
        else:self.backdrop.set_art(None)
        if hasattr(self,'suggest'):self.suggest.dismiss()
        self.update_nav();self.adapt_layout()
    def show_title_art(self,pixmap):
        self.backdrop.set_art(pixmap if self.pages.currentIndex()==2 else None)
    def update_nav(self):
        signed=self.pages.currentIndex()!=0
        for name,b in self.nav.items():b.setVisible(signed);b.setChecked(signed and name==self.section)
        self.search.setVisible(signed);self.avatar.setVisible(True)  # The avatar opens settings, also before sign-in.
        self.pager.setVisible(self.pages.currentIndex()==1 and self.total_pages>1)
    def show_section(self,name,reload=True):
        """Header tab: «Кинотека» is the personal list; the others preset kind and source of «Главная»."""
        if self.pages.currentIndex()==0:self.update_nav();return
        if name=='library':
            self.section='library';self.pages.setCurrentIndex(2);self.torrents.show_library();self.update_nav();return
        kind,source=SECTIONS.get(name,SECTIONS['home']);before=(self.filters.kind,self.filters.state()['source'])
        self.section=self.catalog_section=name;self.filters.set_kind(kind)
        if kind=='movie':self.filters.set_source(source)
        self.pages.setCurrentIndex(1);self.update_nav()
        if reload and (before!=(kind,'tmdb' if kind=='tv' else source) or (not self.results.count() and not self.search_running)):
            self.search_generation+=1;self.page=1;self.load_results()
    def show_catalog(self):
        self.show_section(self.catalog_section)
    def library_shown(self):
        self.section='library';self.update_nav()
    def show_torrents(self,section='torrents'):
        """Torrent title page opened by a website launch; the header keeps its section lit."""
        if self.pages.currentIndex()==0:self.update_nav();return
        self.section=section;self.pages.setCurrentIndex(2);self.update_nav()
    def focus_search(self):
        if self.pages.currentIndex()!=0:self.search.setFocus(Qt.FocusReason.ShortcutFocusReason);self.search.selectAll()
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
        page=QWidget();v=QVBoxLayout(page);v.setContentsMargins(0,0,0,0);v.setSpacing(6)
        self.filters=FilterBar(self.language);self.filters.changed.connect(self.filters_changed);self.filters.genresWanted.connect(self.load_genres);v.addWidget(self.filters)
        info=QHBoxLayout();info.setContentsMargins(0,0,0,0);info.setSpacing(4);self.found=QLabel();self.found.setObjectName('found');self.found.setTextFormat(Qt.TextFormat.RichText);info.addWidget(self.found);info.addStretch()
        self.view_group=QButtonGroup(self);self.view_buttons={}
        for mode in ('grid','list'):
            b=QPushButton();b.setObjectName('viewToggle');b.setCheckable(True);b.setIcon(icon(mode,'#aab4be',16,'#11120e'));b.setIconSize(QSize(16,16));b.setCursor(Qt.CursorShape.PointingHandCursor)
            b.clicked.connect(lambda _=False,m=mode:self.set_view(m));self.view_group.addButton(b);self.view_buttons[mode]=b;info.addWidget(b)
        self.view_buttons['grid'].setChecked(True);v.addLayout(info)
        self.search_button=button('Найти',self.new_search,True);self.search_button.hide();self.search.returnPressed.connect(self.new_search)
        self.search_timer=QTimer(self);self.search_timer.setSingleShot(True);self.search_timer.setInterval(250);self.search_timer.timeout.connect(self.new_search);self.search.textEdited.connect(self.schedule_search)
        self.results=PosterGrid(self.api.origin);self.results.title_language=self.title_language;self.results.language=self.language;self.results.itemClicked.connect(self.open_result);self.results.itemActivated.connect(self.open_result);self.results.bookmarkToggled.connect(self.toggle_bookmark);v.addWidget(self.results,1)
        self.play_button=QPushButton(self);self.play_button.hide();self.play_button.setEnabled(False);self.selected_title=QLabel(self);self.selected_title.hide();self.results.currentItemChanged.connect(self.selection)
        self.pages.addWidget(page)
    def set_view(self,mode):
        self.view_buttons[mode].setChecked(True);self.results.set_list_mode(mode=='list')
    def show_found(self,total=None):
        if total is not None:self.found_total=max(0,int(total))
        if self.found_total is None:self.found.setText('');return
        number=f'{self.found_total:,}'.replace(',',',' if self.language=='en' else '\u00a0')
        self.found.setText(f'{escape(translate("Найдено:",self.language))} <span style="color:#ffd400;font-weight:700">{number}</span>')
    def render_pager(self):
        while self.pager_numbers.count():
            widget=self.pager_numbers.takeAt(0).widget()
            if widget is not None:widget.deleteLater()
        for number in page_numbers(self.page,self.total_pages,self.pager_width):
            if number is None:gap=QLabel('…');gap.setObjectName('gap');self.pager_numbers.addWidget(gap);continue
            b=QPushButton(str(number));b.setObjectName('pageButton');b.setCheckable(True);b.setChecked(number==self.page);b.setCursor(Qt.CursorShape.PointingHandCursor)
            b.setAccessibleName(f'{translate("Страница",self.language)} {number}');b.clicked.connect(lambda _=False,n=number:self.go_page(n));self.pager_numbers.addWidget(b)
        loading=self.search_running
        self.prev.setEnabled(not loading and self.page>1);self.next.setEnabled(not loading and self.page<self.total_pages)
        self.pager.setVisible(self.pages.currentIndex()==1 and self.total_pages>1)
    def retranslate(self):
        for widget,text in self.bound:widget.setText(translate(text,self.language))
        for widget,text in [(self.login_button,'Войти'),(self.browser_button,'Войти через аккаунт в браузере  →'),(self.remember,'Запомнить вход в защищённом хранилище ОС'),(self.prev,'← Назад'),(self.next,'Вперёд →')]+[(self.nav[name],text) for name,text in NAV]:widget.setText(translate(text,self.language))
        for widget,text in [(self.identity,'Логин или email'),(self.password,'Пароль'),(self.otp,'Если включена двухфакторная защита'),(self.search,'Поиск фильмов и сериалов...')]:widget.setPlaceholderText(translate(text,self.language));widget.setAccessibleName(translate(text,self.language))
        for widget,text in [(self.avatar,'Мой аккаунт' if self.account.get('username') else 'Настройки'),(self.view_buttons['grid'],'Сетка'),(self.view_buttons['list'],'Список')]:widget.setToolTip(translate(text,self.language));widget.setAccessibleName(translate(text,self.language))
        if self.account.get('username'):self.avatar.setToolTip(self.account['username'])
        self.filters.retranslate(self.language);self.results.language=self.language;self.show_found();self.render_pager()
        self.message.setText(self.message.raw);self.drawer.retranslate(self.language);self.torrents.retranslate(self.language);self.refresh_titles();self.adapt_layout()
    def set_language(self,language):
        self.preferences.set('interface_language',language);self.language=language;self.drawer.ui_language.blockSignals(True);self.drawer.ui_language.setCurrentIndex(self.drawer.ui_language.findData(language));self.drawer.ui_language.blockSignals(False);self.retranslate()
    def set_title_language(self,language):
        self.preferences.set('title_language',language);self.title_language=language;self.drawer.title_language.blockSignals(True);self.drawer.title_language.setCurrentIndex(self.drawer.title_language.findData(language));self.drawer.title_language.blockSignals(False);self.refresh_titles()
    def refresh_titles(self):
        self.results.title_language=self.title_language
        for i in range(self.results.count()):
            item=self.results.item(i);title=movie_title(item.data(Qt.ItemDataRole.UserRole),self.title_language);item.setText(title);item.setToolTip(title);item.setData(Qt.ItemDataRole.AccessibleTextRole,title)
        self.selection(self.results.currentItem());self.results.viewport().update();self.torrents.set_title_language(self.title_language)
    def open_settings(self):
        signed=self.pages.currentIndex()!=0
        self.drawer.signout.setVisible(signed);self.drawer.refresh.setVisible(signed)
        self.drawer.present()
        if signed:self.refresh_account()
    def refresh_account(self):
        if self.drawer.state=='Загружаем аккаунт…':return
        self.drawer.update_account(state='Загружаем аккаунт…')
        def done(data):self.account=dict(data);self.drawer.update_account(data)
        def fail(error):
            if isinstance(error,ApiError) and error.status==401:self.show_error(error)
            else:self.drawer.update_account(state='Не удалось загрузить аккаунт. Повторите.')
        self.work(lambda:self.api.account(),done,fail)
    def adapt_layout(self):
        if not hasattr(self,'torrents'):return
        compact=self.height()<720;self.hero_copy.setVisible(self.width()>=940)
        self.login_layout.setSpacing(5 if compact else 9);self.login_layout.setContentsMargins(22,14 if compact else 24,22,14 if compact else 24)
        signed=self.pages.currentIndex()!=0;width=self.width()
        self.brand.setVisible(not signed or width>=1180)
        narrow=width<1000
        if self.nav_compact!=narrow:
            self.nav_compact=narrow
            for b in self.nav.values():b.setProperty('compact',narrow);b.style().unpolish(b);b.style().polish(b)
        self.search.hint_allowed=width>=1000;self.search.place_hint()
        # Short windows: filters fold into one summary line unless the viewer chose otherwise.
        if not self.filters.user_toggled and self.filters.collapsed!=(self.height()<700):self.filters.set_collapsed(self.height()<700)
        if self.filters.compact!=(self.height()<800):self.filters.set_compact(self.height()<800)
        pager_width=7 if width>=1000 else 5
        if pager_width!=self.pager_width:self.pager_width=pager_width;self.render_pager()
        self.results.resize_tiles()
        if hasattr(self,'suggest') and not self.suggest.isHidden():self.suggest.place(self.search)
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
        self.pair_timer.stop();self.pair=None;self.pair_label.clear();self.section=self.catalog_section;self.pages.setCurrentIndex(1);self.backdrop.set_catalog(True)
        self.account=dict(account);self.drawer.update_account(self.account);self.set_avatar(account.get('username',''));self.message.setText('Вход выполнен. Выберите фильм.')
        if self.remember.isChecked() and not self.vault.save(self.api.token):self.message.setText('Вход выполнен. Защищённое хранилище недоступно: сессия останется только в памяти.')
        self.update_nav();self.new_search()
        if not self.genres:self.load_genres()
        if self.pending_launch:self.redeem_launch()
        self.updater.signed_in=True;QTimer.singleShot(1500,lambda:self.updater.check(quiet=True))  # Quiet: errors stay unspoken.
    def announce_update(self):
        """Once per version: a newer build is ready to install from the settings."""
        u=self.updater
        if u.state=='available' and not u.note and u.version and u.version!=self.announced and self.pages.currentIndex()!=0:
            self.announced=u.version;self.message.setText('Доступно обновление KINOSOTA Player — откройте настройки, раздел «О приложении».')
    def set_avatar(self,name):
        name=str(name or '').strip();self.avatar.setText((name[:1] or 'K').upper());self.avatar.setToolTip(name or translate('Мой аккаунт',self.language))
    def load_genres(self):
        """Genre lists for the filter checklist; failure only empties the checklist."""
        if self.genres_loading or self.pages.currentIndex()==0:return
        self.genres_loading=True;self.filters.set_catalog(self.genres,'loading')
        def done(catalog):
            self.genres_loading=False;self.genres=catalog if isinstance(catalog,Genres) else Genres()
            self.filters.set_catalog(self.genres,'ready' if self.genres else 'failed')
        def fail(error):
            self.genres_loading=False;self.filters.set_catalog(self.genres,'failed')
            if isinstance(error,ApiError) and error.status==401:self.show_error(error)
        self.work(lambda:fetch_genres(self.api),done,fail)
    def schedule_search(self,*args):
        self.search_generation+=1;self.search_timer.start()
        if not self.search.text().strip():self.suggest.dismiss()
    def new_search(self):
        self.search_timer.stop();self.search_generation+=1;self.query=self.search.text().strip();self.page=1
        if self.pages.currentIndex()==2:self.show_section(self.catalog_section,reload=False)  # Header search always searches the catalogue.
        self.load_results()
    def change_page(self,delta):
        self.go_page(self.page+delta)
    def go_page(self,number):
        self.search_generation+=1;self.page=max(1,min(self.total_pages,int(number)));self.load_results()
    def filters_changed(self):
        if self.filters.kind=='movie':self.section=self.catalog_section=SOURCE_SECTION.get(self.filters.state()['source'],'home')
        self.update_nav();self.search_generation+=1;self.page=1;self.load_results()
    def catalog_state(self):
        f=self.filters.state()
        return {'kind':self.filters.kind,'source':f['source'],'query':self.query,'genres':f['genres'],'rating':f['rating'],
                'year_from':f['year_from'],'year_to':f['year_to'],'sort':f['sort'],'page':self.page}
    def load_results(self):
        if self.search_running:self.search_queued=True;return
        self.search_running=True;self.search_queued=False
        self.prev.setEnabled(False);self.next.setEnabled(False);self.message.setText('Ищем фильмы…' if self.query else 'Загружаем каталог…')
        state=self.catalog_state();page,query,generation=self.page,self.query,self.search_generation
        sig=signature(state);known=self.totals.get(sig);genres=self.genres
        def current():return generation==self.search_generation and (page,query)==(self.page,self.query)
        def finish():
            self.search_running=False
            if self.search_queued:self.search_queued=False;self.load_results()
            elif current():self.render_pager()
        def done(data):
            if current():
                data=data if isinstance(data,dict) else {}
                if isinstance(data.get('totals'),dict):self.totals={sig:data['totals']}
                self.fill_results(data,state)
            finish()
        def fail(e):
            if current():self.show_error(e)
            finish()
        self.work(lambda:fetch_page(self.api,genres,state,known),done,fail)
    def fill_results(self,data,state):
        self.results.clear();self.total_pages=max(1,int(data.get('total_pages') or 1))
        shown=[]
        for movie in data.get('items') or []:
            if not isinstance(movie,dict):continue
            title=movie_title(movie,self.title_language);item=QListWidgetItem(title);item.setData(Qt.ItemDataRole.UserRole,movie);item.setToolTip(title);item.setData(Qt.ItemDataRole.AccessibleTextRole,title);self.results.addItem(item);shown.append(movie)
            self.results.posters.load(movie.get('poster') or movie.get('poster_url'))
        self.results.scrollToTop();self.show_found(data.get('total',self.results.count()) or 0)
        if self.results.count():self.message.setText('')
        else:self.message.setText('Ничего не найдено. Измените или сбросьте фильтры.' if filtered(state) else 'Ничего не найдено. Попробуйте другое название.')
        # 0.1.8: up to five results under the header search while the viewer is still typing there.
        query=state.get('query') or ''
        if query and state.get('page',1)==1 and self.pages.currentIndex()==1 and self.search.hasFocus() and self.search.text().strip()==query:
            self.suggest.present(self.search,shown[:5],query,data.get('interpreted_as') or '',self.language,self.title_language)
        else:self.suggest.dismiss()
    def open_result(self,*args):
        """Website film → playback; torrent title → its page with quality and voice choice."""
        self.suggest.dismiss()
        item=args[0] if args and isinstance(args[0],QListWidgetItem) else self.results.currentItem()
        movie=item.data(Qt.ItemDataRole.UserRole) if item else None
        if not isinstance(movie,dict):return
        if movie.get('_source')=='tmdb':
            if self.pages.currentIndex()!=1:return
            section=self.section;self.torrents.return_to=lambda:self.show_section(section,reload=False);self.torrents.back_caption=dict(NAV).get(section)
            self.pages.setCurrentIndex(2);self.torrents.open_title(movie);return
        self.play(item)
    def choose_suggestion(self,index):
        self.suggest.dismiss()
        item=self.results.item(index) if 0<=index<self.results.count() else None
        if item is not None:self.results.setCurrentItem(item);self.open_result(item)
    def eventFilter(self,watched,event):
        # 0.1.8: arrows, Enter and Esc drive the search suggestions; leaving the field closes them.
        if watched is getattr(self,'search',None) and hasattr(self,'suggest'):
            kind=event.type()
            if kind==QEvent.Type.KeyPress and not self.suggest.isHidden():
                key=event.key()
                if key in (Qt.Key.Key_Down,Qt.Key.Key_Up):self.suggest.move_active(1 if key==Qt.Key.Key_Down else -1);return True
                if key in (Qt.Key.Key_Return,Qt.Key.Key_Enter) and self.suggest.active>=0:self.choose_suggestion(self.suggest.active);return True
                if key==Qt.Key.Key_Escape:self.suggest.dismiss();return True
            elif kind==QEvent.Type.FocusOut:self.suggest.dismiss()
        return super().eventFilter(watched,event)
    def toggle_bookmark(self,item):
        """Ribbon on a card: add to / remove from «Кинотека» without opening the title."""
        movie=item.data(Qt.ItemDataRole.UserRole) if item is not None else None
        if not isinstance(movie,dict) or not bookmarkable(movie):return
        key=(movie.get('kind') or 'movie',movie['tmdb_id'])
        if key in self.bookmark_pending:return
        saved=not movie.get('_saved');self.bookmark_pending.add(key);self.set_saved(key,saved)
        def done(_):self.bookmark_pending.discard(key);self.message.setText('Добавлено в кинотеку' if saved else 'Удалено из кинотеки')
        def fail(error):
            self.bookmark_pending.discard(key);self.set_saved(key,not saved);self.show_error(error)
        self.work((lambda:self.api.add_to_library(*key)) if saved else (lambda:self.api.remove_from_library(*key)),done,fail)
    def set_saved(self,key,saved):
        for i in range(self.results.count()):
            item=self.results.item(i);movie=item.data(Qt.ItemDataRole.UserRole)
            if isinstance(movie,dict) and (movie.get('kind') or 'movie',movie.get('tmdb_id'))==key:item.setData(Qt.ItemDataRole.UserRole,{**movie,'_saved':saved})
        self.results.viewport().update()
    def selection(self,item,previous=None):
        self.play_button.setEnabled(bool(item) and not self.busy)
        self.selected_title.setText(movie_title(item.data(Qt.ItemDataRole.UserRole),self.title_language) if item else translate('Выберите фильм',self.language))
    def play(self,*args):
        item=args[0] if args and isinstance(args[0],QListWidgetItem) else self.results.currentItem()
        if not item or self.busy:return
        self.results.setCurrentItem(item);self.start_movie(item.data(Qt.ItemDataRole.UserRole))
    def start_movie(self,movie,force=False):
        """KINOSOTA film (catalogue card or website launch): lease → mpv → heartbeat."""
        if self.busy and not force:return
        self.stop(release=False);self.busy=True;self.play_button.setEnabled(False);self.message.setText('Открываем фильм…')
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
        self.play_generation+=1;self.busy=False;self.torrent_playing=False;self.torrent_starting=False;self.start_timer.stop();self.play_button.setEnabled(bool(self.results.currentItem()));self.pending_beat=False
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
        if self.torrent_playing and not self.session and not self.engine.alive():
            code=self.engine.exit_code();choice,attempt,started=self.torrent_choice,self.torrent_attempt,self.torrent_started;self.stop()
            # 0.1.8: a cold torrent stream can drop mpv's first connection: reopen it twice within two minutes.
            if code not in (None,0,4) and choice and attempt<2 and time.monotonic()-started<120:self.play_torrent(choice,force=True,attempt=attempt+1);return
            self.message.setText('Воспроизведение завершено.' if code in (None,0) else 'Не удалось воспроизвести видео. Проверьте соединение и повторите позднее.');return
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
                self.epoch+=1;self.search_timer.stop();self.search_generation+=1;self.search_running=False;self.search_queued=False;self.pair_timer.stop();self.pair=None;self.pending_poll=False;self.login_button.setEnabled(True);self.drawer.dismiss();self.account={};self.drawer.update_account({});self.results.posters.clear();self.results.clear();self.password.clear();self.otp.clear();self.vault.clear();self.stop();self.torrents.reset();self.clear_catalog();self.pages.setCurrentIndex(0);self.backdrop.set_catalog(False);self.identity.setFocus()
        else:self.message.setText('Не удалось выполнить действие. Проверьте установку mpv и соединение.')
    def logout(self):
        self.drawer.dismiss();self.account={};self.drawer.update_account({});self.updater.signed_in=False;self.updater.cancel()
        self.search_timer.stop();self.search_generation+=1;self.search_running=False;self.search_queued=False;self.results.posters.clear();self.epoch+=1;self.busy=False;self.pending_beat=False;self.pending_poll=False;self.login_button.setEnabled(True)
        self.stop();self.pair_timer.stop();self.vault.clear();self.pending_launch='';self.torrents.reset();self.clear_catalog();self.pages.setCurrentIndex(0);self.backdrop.set_catalog(False);self.results.clear()
        self.work(self.api.logout,lambda _:self.message.setText('Вы вышли из аккаунта. Сайт также может запросить повторный вход.'))
    def clear_catalog(self):
        """Signed out: forget this account's pages, totals and bookmarks; keep the viewer's filters."""
        self.filters.genre_timer.stop();self.totals={};self.genres_loading=False;self.bookmark_pending.clear();self.found_total=None;self.show_found()
        self.page=1;self.total_pages=1;self.query='';self.search.clear();self.avatar.setText('K');self.avatar.setToolTip(translate('Настройки',self.language));self.render_pager()
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
    def play_torrent(self,choice,force=False,attempt=0):
        """Torrent title from the «Торренты» page or a website launch: ticket → mpv (--alang)."""
        if self.busy and not force:return
        self.stop(release=False);self.busy=True;self.play_button.setEnabled(False)
        title=str(choice.get('title') or 'KINOSOTA');self.message.setText('Переподключаемся…' if attempt else 'Открываем фильм…')
        self.torrent_starting=True;self.start_timer.start()
        epoch=self.epoch;generation=self.play_generation
        def cancelled():return self.closed or epoch!=self.epoch or generation!=self.play_generation
        def start():
            self.release_pending()
            if cancelled():raise RuntimeError('Cancelled')
            ticket=self.api.torrent_ticket(choice['kind'],choice['tmdb_id'],choice.get('source_id'),choice.get('season'),choice.get('episode'))
            if cancelled():raise RuntimeError('Cancelled')
            # 0.1.8: wake the stream first: a cold torrent may need up to a minute for its first bytes.
            if hasattr(self.api,'warm_stream'):self.api.warm_stream(ticket['stream_url'],cancelled)
            if cancelled():raise RuntimeError('Cancelled')
            self.engine.start(ticket['stream_url'],extra_args=[*audio_args(choice.get('audio_lang')),*media_title_args(title)])
            if cancelled():self.engine.stop();raise RuntimeError('Cancelled')
            return ticket
        def done(ticket):
            if generation!=self.play_generation:return
            self.busy=False;self.torrent_starting=False;self.start_timer.stop();self.play_button.setEnabled(bool(self.results.currentItem()));self.torrent_playing=True
            self.torrent_choice=dict(choice);self.torrent_started=time.monotonic();self.torrent_attempt=attempt
            episode=f" · S{choice['season']:02d}E{choice['episode']:02d}" if type(choice.get('season')) is int and type(choice.get('episode')) is int else ''
            self.message.setText('Воспроизводится: '+title+episode)
        def fail(error):
            if generation==self.play_generation:self.busy=False;self.torrent_starting=False;self.start_timer.stop();self.play_button.setEnabled(bool(self.results.currentItem()));self.show_error(error)
        self.work(start,done,fail)
    def slow_start(self):
        if self.torrent_starting:self.message.setText('Подготавливаем поток… Первый запуск может занять до минуты.')
    def open_link(self,link):
        """kinosota://watch?launch=<uuid> from the website «▶ Смотреть» button."""
        if self.closed:return
        if self.isMinimized():self.showNormal()
        self.raise_();self.activateWindow()
        launch=parse_launch(link)
        if not launch:self.message.setText('Ссылка из браузера не распознана. Нажмите «Смотреть» на сайте ещё раз.');return
        self.pending_launch=launch
        if self.pages.currentIndex()==0:
            self.message.setText('Войдите в аккаунт — фильм с сайта откроется сразу после входа.');return
        self.redeem_launch()
    def redeem_launch(self):
        launch=self.pending_launch;self.pending_launch=''
        if not launch:return
        self.message.setText('Открываем фильм с сайта…')
        def done(meta):
            movie_id=meta.get('movie_id') if isinstance(meta,dict) else None
            if isinstance(movie_id,str) and movie_id.strip() and meta.get('kind')=='movie':
                # A KINOSOTA film the browser could not decode: same lease as a catalogue card.
                self.start_movie({'id':movie_id.strip(),**{key:meta.get(key) for key in ('title','original_title','title_en','year','poster')}},force=True);return
            if not isinstance(meta,dict) or meta.get('kind') not in ('movie','tv') or type(meta.get('tmdb_id')) is not int:
                self.message.setText('Не удалось открыть фильм с сайта. Нажмите «Смотреть» ещё раз.');return
            prefs={key:meta.get(key) for key in ('source_id','season','episode','audio_lang')}
            section='series' if meta['kind']=='tv' else 'torrents'
            self.show_torrents(section);self.torrents.back_caption=dict(NAV).get(section);self.torrents.open_title(meta,prefs);self.torrents.return_to=lambda:self.show_section(section)
            self.play_torrent({'kind':meta['kind'],'tmdb_id':meta['tmdb_id'],**prefs,'title':movie_title(meta,self.title_language)},force=True)
        def fail(error):
            if isinstance(error,ApiError) and error.status==401:self.pending_launch=launch;self.show_error(error)
            elif isinstance(error,ApiError) and error.status==404 and 'недоступен' in str(error):self.message.setText(str(error))
            elif isinstance(error,ApiError) and error.status==404:self.message.setText('Этот запуск создан другим аккаунтом. Войдите в приложение тем же аккаунтом, что и на сайте.')
            elif isinstance(error,ApiError) and error.status==410:self.message.setText('Ссылка устарела. Нажмите «Смотреть» на сайте ещё раз.')
            else:self.show_error(error)
        self.work(lambda:self.api.open_launch(launch),done,fail)
    def closeEvent(self,event):
        self.updater.shutdown();self.search.removeEventFilter(self);self.suggest.dismiss();self.drawer.dismiss();self.torrents.shutdown();self.filters.genre_timer.stop()
        self.search_timer.stop();self.results.posters.clear();self.closed=True;self.pair_timer.stop();self.process_timer.stop();self.stop();self.pool.waitForDone(25000);self.engine.stop();self.api.close();event.accept()

def main():
    if '--version' in sys.argv:
        print(f'KINOSOTA Player {__version__}');return 0
    app=QApplication(sys.argv);app.setApplicationName('KINOSOTA Player');app.setOrganizationName('KINOSOTA');app.setDesktopFileName('kinosota-player')
    if '--uninstall' in sys.argv:
        from .installation import show_uninstall
        show_uninstall(language=Preferences().get('interface_language'));return 0
    smoke='--smoke-test' in sys.argv or '--playback-smoke-fixture' in sys.argv
    instance=None;link=None
    if not smoke:
        from .deeplink import Instance, LinkEvents, find_link, forward
        link=find_link(sys.argv)
        # A second process started by the browser hands the link to the open window.
        if link and forward(link):return 0
        instance=Instance(app);instance.listen()
    window=Window(restore=not smoke);window.show()
    if instance is not None:
        instance.linkReceived.connect(window.open_link)
        app.installEventFilter(LinkEvents(window.open_link,app))
        if link:QTimer.singleShot(0,lambda:window.open_link(link))
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
