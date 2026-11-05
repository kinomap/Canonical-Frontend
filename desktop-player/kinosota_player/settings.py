"""Responsive in-window settings workspace; no decorative dead navigation."""
import platform,webbrowser
from pathlib import Path
from PySide6.QtCore import Qt,QRect,QPropertyAnimation,QEasingCurve,QEvent,Signal,QSize
from PySide6.QtGui import QPixmap,QIcon,QPainter
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QWidget,QFrame,QVBoxLayout,QHBoxLayout,QLabel,QPushButton,QComboBox,QApplication,QScrollArea,QStackedWidget,QSizePolicy,QStyledItemDelegate,QProgressBar
from .preferences import translate
from .filters import FilterCombo
from . import __version__
from .icons import icon as lucide
from .motion import smooth

LINE_ICONS={'settings':'settings','account':'user','about':'info','help':'circle-help','copy':'copy'}
def line_icon(name):
    """Lucide line icons (ISC), honey on the dark rail as on the website."""
    return lucide(LINE_ICONS[name],'#ffda68',24)

class SettingsDrawer(QWidget):
    languageChanged=Signal(str);titlesChanged=Signal(str);refreshRequested=Signal();signOutRequested=Signal()
    def __init__(self,parent,prefs):
        super().__init__(parent);self.prefs=prefs;self.language=prefs.get('interface_language');self.account={};self.state='';self.bound=[]
        self.setObjectName('scrim');self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground);self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.panel=QFrame(self);self.panel.setObjectName('settingsPanel');outer=QHBoxLayout(self.panel);outer.setContentsMargins(0,0,0,0);outer.setSpacing(0)
        self.rail=QFrame();self.rail.setObjectName('settingsRail');self.rail.setFixedWidth(200);rail=QVBoxLayout(self.rail);rail.setContentsMargins(18,22,18,18);rail.setSpacing(10)
        logo=QLabel();logo.setPixmap(QPixmap(str(Path(__file__).parent/'assets/drone.png')).scaled(56,56,Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation));rail.addWidget(logo)
        brand=QLabel('KINOSOTA');brand.setObjectName('railBrand');rail.addWidget(brand);rail.addWidget(self.text('ВАШ КИНОТЕАТР','eyebrow'))
        self.summary=QLabel();self.summary.setTextFormat(Qt.TextFormat.PlainText);self.summary.setWordWrap(True);self.summary.setObjectName('railAccount');rail.addWidget(self.summary);rail.addSpacing(8)
        self.nav=[]
        for i,(title,icon) in enumerate([('Настройки','settings'),('Мой аккаунт','account'),('О приложении','about'),('Помощь','help')]):
            b=QPushButton();b.setIcon(line_icon(icon));b.setIconSize(QSize(22,22));b.setObjectName('settingsNav');b.setCheckable(True);b.clicked.connect(lambda checked=False,index=i:self.select_page(index));self.bound.append((b,title));rail.addWidget(b);self.nav.append(b)
        rail.addStretch();rail.addWidget(QLabel('KINOSOTA Player\n'+__version__));outer.addWidget(self.rail)
        body=QWidget();v=QVBoxLayout(body);v.setContentsMargins(24,20,24,20);v.setSpacing(12)
        h=QHBoxLayout();self.heading=self.text('Настройки','drawerTitle');h.addWidget(self.heading,1);self.close_button=QPushButton('×');self.close_button.setFixedSize(40,40);self.close_button.clicked.connect(self.dismiss);h.addWidget(self.close_button);v.addLayout(h)
        self.stack=QStackedWidget();v.addWidget(self.stack,1);outer.addWidget(body,1)
        pref=self.page();pref.addWidget(self.text('Персонализируйте приложение под себя.','hint',True))
        card=self.card(pref,'Интерфейс','Язык управления приложением.');self.ui_language=self.selector(card,'Язык интерфейса',prefs.get('interface_language'))
        card=self.card(pref,'Названия фильмов','На каком языке показывать названия.');self.title_language=self.selector(card,'Язык названий',prefs.get('title_language'));card.addWidget(self.text('EN: английское название, если доступно; иначе — оригинальное или название каталога.','hint',True));pref.addStretch()
        account=self.page();card=self.card(account,'Аккаунт','Информация о текущем аккаунте.');self.fields={};self.copy_buttons={}
        for key,title in [('username','Логин'),('email','Почта'),('subscription_status','Подписка')]:
            card.addWidget(self.text(title,'fieldLabel'));row=QHBoxLayout();x=QLabel('—');x.setTextFormat(Qt.TextFormat.PlainText);x.setObjectName('accountValue');x.setWordWrap(True);x.setMinimumWidth(0);x.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse|Qt.TextInteractionFlag.TextSelectableByKeyboard);x.setFocusPolicy(Qt.FocusPolicy.StrongFocus);row.addWidget(x,1);self.fields[key]=x
            if key!='subscription_status':
                b=QPushButton();b.setIcon(line_icon('copy'));b.setFixedSize(36,36);b.clicked.connect(lambda checked=False,k=key:QApplication.clipboard().setText(str(self.account.get(k) or '')[:320]));row.addWidget(b);self.copy_buttons[key]=b
            card.addLayout(row)
        self.account_state=QLabel();self.account_state.setWordWrap(True);self.account_state.setObjectName('hint');card.addWidget(self.account_state)
        self.refresh=self.action(card,'Обновить данные аккаунта',self.refreshRequested.emit)
        self.action(card,'Управлять подпиской на сайте',lambda:webbrowser.open('https://watch.scenrix.com/profile?tab=billing'))
        self.signout=self.action(card,'Выйти из аккаунта',self.signOutRequested.emit,'danger');account.addStretch()
        about=self.page();self.updater=None
        # 0.1.9: updates are installed over this copy from here, without removing the app first.
        card=self.card(about,'Обновления','Новая версия устанавливается поверх текущей: вход и настройки сохраняются.')
        self.update_status=QLabel();self.update_status.setObjectName('updateStatus');self.update_status.setTextFormat(Qt.TextFormat.PlainText);self.update_status.setWordWrap(True);card.addWidget(self.update_status)
        self.update_bar=QProgressBar();self.update_bar.setObjectName('prepBar');self.update_bar.setRange(0,100);self.update_bar.setTextVisible(False);self.update_bar.setFixedHeight(4);self.update_bar.hide();card.addWidget(self.update_bar)
        row=QHBoxLayout();row.setSpacing(8);self.update_now=QPushButton();self.update_now.setObjectName('primary');self.update_now.setIcon(lucide('download','#11120e',18));self.update_now.setIconSize(QSize(18,18))
        self.update_check=QPushButton();self.update_check.setIcon(lucide('refresh-cw','#d5dbe0',16));self.update_cancel=QPushButton();self.update_site=QPushButton()
        for b,text in ((self.update_now,''),(self.update_check,'Проверить обновления'),(self.update_cancel,'Отмена'),(self.update_site,'Открыть страницу загрузки')):
            b.setCursor(Qt.CursorShape.PointingHandCursor);row.addWidget(b)
            if text:self.bound.append((b,text))
        row.addStretch(1);card.addLayout(row);self.update_site.clicked.connect(lambda:webbrowser.open('https://watch.scenrix.com/player'))
        card=self.card(about,'Приложение','Версия и системная информация.');card.addWidget(QLabel('KINOSOTA Player · '+__version__));system=QLabel(platform.system()+' · '+platform.machine());card.addWidget(system)
        self.action(card,'Удалить приложение…',self.uninstall,'danger');card.addWidget(self.text('Удаление потребует подтверждения ОС. Данные аккаунта на сайте останутся.','hint',True));about.addStretch()
        help_page=self.page();card=self.card(help_page,'Помощь','Установка и безопасность.');card.addWidget(self.text('Windows: запуск после установки включён в мастере. macOS: перенесите приложение в Applications и откройте его. Linux: откройте пакет в менеджере приложений, затем нажмите «Открыть» или запустите KINOSOTA из меню.','hint',True));card.addWidget(self.text('Не отключайте защиту ОС. Подпись Windows и notarization macOS пока не подтверждены.','hint',True));self.action(card,'Открыть руководство на сайте',lambda:webbrowser.open('https://watch.scenrix.com/player'));help_page.addStretch()
        self.animation=QPropertyAnimation(self.panel,b'geometry',self);self.animation.setDuration(180);self.animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.ui_language.currentIndexChanged.connect(lambda:self.languageChanged.emit(self.ui_language.currentData()));self.title_language.currentIndexChanged.connect(lambda:self.titlesChanged.emit(self.title_language.currentData()));self.select_page(0);self.retranslate(self.language);self.hide()
    def text(self,text,name='',wrap=False):
        x=QLabel();x.setObjectName(name);x.setWordWrap(wrap);self.bound.append((x,text));return x
    def action(self,v,text,callback,name=''):
        b=QPushButton();b.setObjectName(name);self.bound.append((b,text));b.clicked.connect(callback);v.addWidget(b);return b
    def page(self):
        area=QScrollArea();area.setWidgetResizable(True);area.setFrameShape(QFrame.Shape.NoFrame);area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff);smooth(area);content=QWidget();v=QVBoxLayout(content);v.setContentsMargins(0,0,4,0);v.setSpacing(16);area.setWidget(content);self.stack.addWidget(area);return v
    def card(self,v,title,hint):
        frame=QFrame();frame.setObjectName('settingsCard');x=QVBoxLayout(frame);x.setContentsMargins(18,16,18,16);x.setSpacing(10);x.addWidget(self.text(title,'sectionTitle'));x.addWidget(self.text(hint,'hint',True));v.addWidget(frame);return x
    def selector(self,v,title,value):
        l=self.text(title,'fieldLabel');v.addWidget(l);c=FilterCombo();c.setItemDelegate(QStyledItemDelegate(c));c.addItem('Русский · RU','ru');c.addItem('English · EN','en');c.setCurrentIndex(c.findData(value));c.setMinimumHeight(42);l.setBuddy(c);v.addWidget(c);return c
    def select_page(self,index):
        self.stack.setCurrentIndex(index)
        for i,b in enumerate(self.nav):b.setChecked(i==index)
        self.heading.setText(translate(['Настройки','Мой аккаунт','О приложении','Помощь'][index],self.language))
    def retranslate(self,language):
        self.language=language
        for widget,text in self.bound:widget.setText(translate(text,language))
        self.select_page(self.stack.currentIndex());self.close_button.setAccessibleName(translate('Закрыть настройки',language))
        for key,b in self.copy_buttons.items():b.setAccessibleName(translate('Копировать',language)+' '+key)
        self.render_account()
        self.render_update()
    def render_account(self):
        statuses={'active_paid':'Активная платная','trial':'Пробная','free':'Бесплатная','expired':'Истекла'}
        for key,widget in self.fields.items():
            value=self.account.get(key)
            value=translate(statuses.get(value,'Нет данных'),self.language) if key=='subscription_status' else str(value or translate('Не указана',self.language))
            widget.setText(value[:160]);widget.setToolTip(value[:320]);widget.setAccessibleName(value[:320])
        user=str(self.account.get('username') or translate('Гость',self.language));self.summary.setText(self.summary.fontMetrics().elidedText(user[:160],Qt.TextElideMode.ElideRight,max(100,self.rail.width()-38)));self.summary.setToolTip(user[:160]);self.account_state.setText(translate(self.state,self.language));self.refresh.setEnabled(self.state!='Загружаем аккаунт…')
        for key,b in self.copy_buttons.items():b.setEnabled(bool(self.account.get(key)))
    def set_updater(self,updater):
        """Connect the «Обновления» card to the window's updater (check, update, cancel)."""
        self.updater=updater;updater.changed.connect(self.render_update)
        self.update_check.clicked.connect(lambda:updater.check());self.update_now.clicked.connect(updater.start);self.update_cancel.clicked.connect(updater.cancel)
        self.render_update()
    def render_update(self):
        u=self.updater
        if u is None:
            self.update_status.setText(translate('Текущая версия',self.language)+': '+__version__)
            for b in (self.update_now,self.update_cancel,self.update_site,self.update_check):b.hide()
            return
        actions=u.actions();self.update_status.setText(u.text(self.language))
        self.update_now.setText(translate('Обновить до',self.language)+' '+u.version);self.update_now.setVisible(actions['update'])
        self.update_check.setVisible(actions['check']);self.update_check.setEnabled(not u.busy)
        self.update_cancel.setVisible(actions['cancel']);self.update_site.setVisible(actions['website'])
        downloading=u.state=='downloading';self.update_bar.setVisible(downloading)
        if downloading:
            self.update_bar.setRange(0,100 if u.total else 0);self.update_bar.setValue(u.percent())
    def update_account(self,data=None,state=''):
        if data is not None:self.account=dict(data)
        self.state=state;self.render_account()
    def uninstall(self):
        from .installation import show_uninstall
        show_uninstall(self,self.language)
    def target(self):
        width=min(920,self.width()-32);return QRect(self.width()-width-16,16,width,self.height()-32)
    def present(self):
        self.return_focus=QApplication.focusWidget();self.setGeometry(self.parentWidget().rect());self.show();self.raise_();self.parentWidget().installEventFilter(self);QApplication.instance().installEventFilter(self);target=self.target();self.animation.stop();self.animation.setStartValue(QRect(self.width(),16,target.width(),target.height()));self.animation.setEndValue(target);self.animation.start();self.close_button.setFocus()
    def dismiss(self):
        if not self.isVisible():return
        self.animation.stop();self.hide();QApplication.instance().removeEventFilter(self);self.parentWidget().removeEventFilter(self)
        if getattr(self,'return_focus',None):self.return_focus.setFocus()
    def resizeEvent(self,event):
        self.animation.stop();self.panel.setGeometry(self.target());self.rail.setFixedWidth(176 if self.width()<900 else 210);super().resizeEvent(event)
    def mousePressEvent(self,event):
        if not self.panel.geometry().contains(event.position().toPoint()):self.dismiss()
        else:super().mousePressEvent(event)
    def eventFilter(self,obj,event):
        if self.isVisible() and obj==self.parentWidget() and event.type()==QEvent.Type.Resize:self.setGeometry(self.parentWidget().rect())
        if self.isVisible() and event.type()==QEvent.Type.KeyPress:
            # A native confirmation dialog owns its own Escape/Tab keys.
            if QApplication.activeModalWidget():return False
            if event.key()==Qt.Key.Key_Escape:self.dismiss();return True
            if event.key() in (Qt.Key.Key_Tab,Qt.Key.Key_Backtab):
                backward=event.key()==Qt.Key.Key_Backtab or bool(event.modifiers()&Qt.KeyboardModifier.ShiftModifier);candidate=QApplication.focusWidget() or self.close_button
                for _ in range(200):
                    candidate=candidate.previousInFocusChain() if backward else candidate.nextInFocusChain()
                    if self.panel.isAncestorOf(candidate) and candidate.isVisible() and candidate.isEnabled() and candidate.focusPolicy()&Qt.FocusPolicy.TabFocus:candidate.setFocus();return True
                return True
        return super().eventFilter(obj,event)
