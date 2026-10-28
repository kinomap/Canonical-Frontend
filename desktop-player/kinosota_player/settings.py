"""Responsive in-window settings workspace; no decorative dead navigation."""
import platform,webbrowser
from pathlib import Path
from PySide6.QtCore import Qt,QRect,QPropertyAnimation,QEasingCurve,QEvent,Signal,QSize
from PySide6.QtGui import QPixmap,QIcon,QPainter
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import QWidget,QFrame,QVBoxLayout,QHBoxLayout,QLabel,QPushButton,QComboBox,QApplication,QScrollArea,QStackedWidget,QSizePolicy
from .preferences import translate
from . import __version__

def line_icon(name):
    paths={'settings':'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="5"/>','account':'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0116 0v2"/>','about':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>','help':'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 016 0c0 3-3 2-3 5m0 3v1"/>','copy':'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>'}
    svg=('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#ffda68" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths[name]+'</g></svg>').encode();pix=QPixmap(24,24);pix.fill(Qt.GlobalColor.transparent);q=QPainter(pix);QSvgRenderer(svg).render(q);q.end();return QIcon(pix)

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
        about=self.page();card=self.card(about,'Приложение','Версия и системная информация.');card.addWidget(QLabel('KINOSOTA Player · '+__version__));system=QLabel(platform.system()+' · '+platform.machine());card.addWidget(system)
        self.action(card,'Проверить доступные версии',lambda:webbrowser.open('https://watch.scenrix.com/player'))
        self.action(card,'Удалить приложение…',self.uninstall,'danger');card.addWidget(self.text('Удаление потребует подтверждения ОС. Данные аккаунта на сайте останутся.','hint',True));about.addStretch()
        help_page=self.page();card=self.card(help_page,'Помощь','Установка и безопасность.');card.addWidget(self.text('Windows: запуск после установки включён в мастере. macOS: перенесите приложение в Applications и откройте его. Linux: откройте пакет в менеджере приложений, затем нажмите «Открыть» или запустите KINOSOTA из меню.','hint',True));card.addWidget(self.text('Не отключайте защиту ОС. Подпись Windows и notarization macOS пока не подтверждены.','hint',True));self.action(card,'Открыть руководство на сайте',lambda:webbrowser.open('https://watch.scenrix.com/player'));help_page.addStretch()
        self.animation=QPropertyAnimation(self.panel,b'geometry',self);self.animation.setDuration(180);self.animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.ui_language.currentIndexChanged.connect(lambda:self.languageChanged.emit(self.ui_language.currentData()));self.title_language.currentIndexChanged.connect(lambda:self.titlesChanged.emit(self.title_language.currentData()));self.select_page(0);self.retranslate(self.language);self.hide()
    def text(self,text,name='',wrap=False):
        x=QLabel();x.setObjectName(name);x.setWordWrap(wrap);self.bound.append((x,text));return x
    def action(self,v,text,callback,name=''):
        b=QPushButton();b.setObjectName(name);self.bound.append((b,text));b.clicked.connect(callback);v.addWidget(b);return b
    def page(self):
        area=QScrollArea();area.setWidgetResizable(True);area.setFrameShape(QFrame.Shape.NoFrame);area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff);content=QWidget();v=QVBoxLayout(content);v.setContentsMargins(0,0,4,0);v.setSpacing(16);area.setWidget(content);self.stack.addWidget(area);return v
    def card(self,v,title,hint):
        frame=QFrame();frame.setObjectName('settingsCard');x=QVBoxLayout(frame);x.setContentsMargins(18,16,18,16);x.setSpacing(10);x.addWidget(self.text(title,'sectionTitle'));x.addWidget(self.text(hint,'hint',True));v.addWidget(frame);return x
    def selector(self,v,title,value):
        l=self.text(title,'fieldLabel');v.addWidget(l);c=QComboBox();c.addItem('Русский · RU','ru');c.addItem('English · EN','en');c.setCurrentIndex(c.findData(value));c.setMinimumHeight(42);l.setBuddy(c);v.addWidget(c);return c
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
    def render_account(self):
        statuses={'active_paid':'Активная платная','trial':'Пробная','free':'Бесплатная','expired':'Истекла'}
        for key,widget in self.fields.items():
            value=self.account.get(key)
            value=translate(statuses.get(value,'Нет данных'),self.language) if key=='subscription_status' else str(value or translate('Не указана',self.language))
            widget.setText(value[:160]);widget.setToolTip(value[:320]);widget.setAccessibleName(value[:320])
        user=str(self.account.get('username') or translate('Гость',self.language));self.summary.setText(self.summary.fontMetrics().elidedText(user[:160],Qt.TextElideMode.ElideRight,max(100,self.rail.width()-38)));self.summary.setToolTip(user[:160]);self.account_state.setText(translate(self.state,self.language));self.refresh.setEnabled(self.state!='Загружаем аккаунт…')
        for key,b in self.copy_buttons.items():b.setEnabled(bool(self.account.get(key)))
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
