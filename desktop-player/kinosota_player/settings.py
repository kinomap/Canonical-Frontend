"""In-window, keyboard-contained preferences drawer (no OS dialog)."""
from PySide6.QtCore import Qt,QRect,QPropertyAnimation,QEasingCurve,QEvent,Signal
from PySide6.QtWidgets import QWidget,QFrame,QVBoxLayout,QHBoxLayout,QLabel,QPushButton,QComboBox,QApplication
from .preferences import translate

class SettingsDrawer(QWidget):
    languageChanged=Signal(str)
    titlesChanged=Signal(str)
    refreshRequested=Signal()
    signOutRequested=Signal()
    def __init__(self,parent,prefs):
        super().__init__(parent);self.prefs=prefs;self.language=prefs.get('interface_language');self.account={};self.state='';self.bound=[]
        self.setObjectName('scrim');self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground);self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.panel=QFrame(self);self.panel.setObjectName('settingsPanel');v=QVBoxLayout(self.panel);v.setContentsMargins(22,16,22,16);v.setSpacing(8)
        h=QHBoxLayout();self.heading=self.text('Настройки','drawerTitle');h.addWidget(self.heading);h.addStretch();self.close_button=QPushButton('×');self.close_button.setFixedSize(36,36);self.close_button.clicked.connect(self.dismiss);h.addWidget(self.close_button);v.addLayout(h)
        v.addWidget(self.text('ПРЕДПОЧТЕНИЯ','eyebrow'))
        self.ui_language=self.selector(v,'Язык интерфейса',prefs.get('interface_language'))
        self.title_language=self.selector(v,'Названия фильмов',prefs.get('title_language'))
        v.addWidget(self.text('EN: английское название, если доступно; иначе — оригинальное или название каталога.','hint',True))
        
        line=QFrame();line.setObjectName('divider');line.setFixedHeight(1);v.addWidget(line)
        v.addWidget(self.text('АККАУНТ','eyebrow'));self.fields={}
        for key,title in [('username','Логин'),('email','Почта'),('subscription_status','Подписка')]:
            row=QHBoxLayout();row.addWidget(self.text(title,'hint'));x=QLabel('—');x.setTextFormat(Qt.TextFormat.PlainText);x.setObjectName('accountValue');x.setWordWrap(False);x.setMinimumWidth(0);x.setMaximumWidth(256);x.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse|Qt.TextInteractionFlag.TextSelectableByKeyboard);x.setFocusPolicy(Qt.FocusPolicy.StrongFocus);row.addWidget(x,1);v.addLayout(row);self.fields[key]=x
        self.account_state=QLabel();self.account_state.setWordWrap(True);self.account_state.setObjectName('hint');v.addWidget(self.account_state)
        self.refresh=QPushButton();self.bound.append((self.refresh,'Обновить аккаунт'));self.refresh.clicked.connect(self.refreshRequested);v.addWidget(self.refresh)
        v.addStretch();bottom=QHBoxLayout();bottom.addWidget(QLabel('KINOSOTA Player · 0.1.4'));bottom.addStretch();self.signout=QPushButton();self.bound.append((self.signout,'Выйти'));self.signout.clicked.connect(self.signOutRequested);bottom.addWidget(self.signout);v.addLayout(bottom)
        self.animation=QPropertyAnimation(self.panel,b'geometry',self);self.animation.setDuration(180);self.animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.ui_language.currentIndexChanged.connect(lambda:self.languageChanged.emit(self.ui_language.currentData()))
        self.title_language.currentIndexChanged.connect(lambda:self.titlesChanged.emit(self.title_language.currentData()))
        self.retranslate(self.language);self.hide()
    def text(self,text,name='',wrap=False):
        x=QLabel();x.setObjectName(name);x.setWordWrap(wrap);self.bound.append((x,text));return x
    def selector(self,v,title,value):
        row=QHBoxLayout();l=self.text(title,'fieldLabel');row.addWidget(l);c=QComboBox();c.addItem('Русский · RU','ru');c.addItem('English · EN','en');c.setCurrentIndex(c.findData(value));l.setBuddy(c);row.addWidget(c,1);v.addLayout(row);return c
    def retranslate(self,language):
        self.language=language
        for widget,text in self.bound:widget.setText(translate(text,language))
        self.close_button.setAccessibleName(translate('Закрыть настройки',language));self.close_button.setToolTip(translate('Закрыть настройки',language));self.render_account()
    def render_account(self):
        statuses={'active_paid':'Активная платная','trial':'Пробная','free':'Бесплатная','expired':'Истекла'}
        for key,widget in self.fields.items():
            value=self.account.get(key)
            if key=='subscription_status':value=translate(statuses.get(value,'Нет данных'),self.language)
            else:value=str(value or translate('Не указана',self.language))
            # Bound hostile/accidentally long account data without exposing markup.
            widget.setText(widget.fontMetrics().elidedText(value[:160],Qt.TextElideMode.ElideRight,246));widget.setToolTip(value[:160]);widget.setAccessibleName(value[:160])
        self.account_state.setText(translate(self.state,self.language));self.refresh.setEnabled(self.state!='Загружаем аккаунт…')
    def update_account(self,data=None,state=''):
        if data is not None:self.account=dict(data)
        self.state=state;self.render_account()
    def target(self):
        width=min(408,self.width()-24);return QRect(self.width()-width,0,width,self.height())
    def present(self):
        self.return_focus=QApplication.focusWidget();self.setGeometry(self.parentWidget().rect());self.show();self.raise_();self.parentWidget().installEventFilter(self);QApplication.instance().installEventFilter(self)
        target=self.target();self.animation.stop();self.animation.setStartValue(QRect(self.width(),0,target.width(),target.height()));self.animation.setEndValue(target);self.animation.start();self.close_button.setFocus()
    def dismiss(self):
        if not self.isVisible():return
        self.animation.stop();self.hide();QApplication.instance().removeEventFilter(self);self.parentWidget().removeEventFilter(self)
        if getattr(self,'return_focus',None):self.return_focus.setFocus()
    def resizeEvent(self,event):
        self.animation.stop();self.panel.setGeometry(self.target());super().resizeEvent(event)
    def mousePressEvent(self,event):
        if not self.panel.geometry().contains(event.position().toPoint()):self.dismiss()
        else:super().mousePressEvent(event)
    def eventFilter(self,obj,event):
        if self.isVisible() and obj==self.parentWidget() and event.type()==QEvent.Type.Resize:self.setGeometry(self.parentWidget().rect())
        if self.isVisible() and event.type()==QEvent.Type.KeyPress:
            if event.key()==Qt.Key.Key_Escape:self.dismiss();return True
            if event.key() in (Qt.Key.Key_Tab,Qt.Key.Key_Backtab):
                backward=event.key()==Qt.Key.Key_Backtab or bool(event.modifiers()&Qt.KeyboardModifier.ShiftModifier)
                focus=QApplication.focusWidget();candidate=focus
                for _ in range(100):
                    candidate=candidate.previousInFocusChain() if backward else candidate.nextInFocusChain()
                    if self.panel.isAncestorOf(candidate) and candidate.isVisible() and candidate.isEnabled() and candidate.focusPolicy()&Qt.FocusPolicy.TabFocus:candidate.setFocus();return True
                return True
        return super().eventFilter(obj,event)
