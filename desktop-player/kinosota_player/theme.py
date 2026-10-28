"""Cinematic surfaces painted at device resolution; images contain no controls."""
from pathlib import Path
from PySide6.QtCore import Qt, QRectF
from PySide6.QtGui import QPainter,QPixmap,QColor,QLinearGradient,QRadialGradient
from PySide6.QtWidgets import QWidget
ASSETS=Path(__file__).parent/'assets'
class CinemaBackdrop(QWidget):
    def __init__(self):
        super().__init__();self.catalog=False
        self.scene=QPixmap(str(ASSETS/'cinema-login.jpg'));self.header=QPixmap(str(ASSETS/'cinema-header.jpg'))
    def set_catalog(self,value):self.catalog=value;self.update()
    def paintEvent(self,event):
        p=QPainter(self);p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        p.fillRect(self.rect(),QColor('#070b0e'));w,h=self.width(),self.height()
        image=self.header if self.catalog else self.scene
        target=QRectF(0,0,w,200) if self.catalog else QRectF(0,80,w*.64,h-80)
        if not image.isNull():
            scaled=image.scaled(int(target.width()),int(target.height()),Qt.AspectRatioMode.KeepAspectRatioByExpanding,Qt.TransformationMode.SmoothTransformation)
            p.drawPixmap(target,scaled,QRectF((scaled.width()-target.width())/2,0,target.width(),target.height()))
        if self.catalog:
            fade=QLinearGradient(0,55,0,215);fade.setColorAt(0,QColor(7,11,14,40));fade.setColorAt(1,QColor('#070b0e'));p.fillRect(self.rect(),fade)
        else:
            shade=QLinearGradient(0,0,w,0);shade.setColorAt(0,QColor(7,11,14,12));shade.setColorAt(.38,QColor(7,11,14,40));shade.setColorAt(.65,QColor('#070b0e'));p.fillRect(self.rect(),shade)
            fade=QLinearGradient(0,h*.55,0,h);fade.setColorAt(0,QColor(7,11,14,0));fade.setColorAt(.7,QColor(7,11,14,225));fade.setColorAt(1,QColor('#070b0e'));p.fillRect(self.rect(),fade)
        glow=QRadialGradient(w*.95,120,w*.38);glow.setColorAt(0,QColor(255,170,18,27));glow.setColorAt(1,QColor(255,170,18,0));p.fillRect(self.rect(),glow)
PREMIUM_STYLE='''
QWidget{color:#f5f6f7;font:16px "Manrope";background:transparent;}
QLabel{background:transparent;} QLabel#brand{font-size:30px;font-weight:700;} QLabel#hero{font-size:36px;font-weight:700;} QLabel#muted{color:#b4bac1;} QLabel#message{color:#ffdc65;padding:8px;font-size:14px;}
QFrame#card{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #191c1c,stop:.45 #101619,stop:1 #090e12);border:1px solid #65502a;border-radius:24px;}
QLineEdit{background:#0b1217;border:1px solid #3c464e;border-radius:12px;padding:12px;min-height:24px;selection-background-color:#ffd000;selection-color:#101010;}
QLineEdit:focus{border:2px solid #ffd400;} QPushButton{background:#10181d;padding:12px 16px;border:1px solid #5e542c;border-radius:8px;min-height:22px;}
QPushButton:hover{background:#222a2d;border-color:#ffd400;} QPushButton:pressed{background:#31312a;} QPushButton:focus{border:2px solid #ffdc65;}
QPushButton#primary{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffe94a,stop:.45 #ffd400,stop:1 #ffb800);color:#11120e;font-weight:700;border:1px solid #ffe04a;}
QPushButton#primary:hover{background:#ffe650;} QPushButton:disabled{color:#8a929b;background:#1b2228;border-color:#323c44;}
QListWidget{border:0;padding:0;background:#070b0e;outline:0;} QListWidget::item{padding:0;border:0;background:transparent;} QListWidget::item:selected{background:transparent;}
QScrollBar:vertical{background:#10171d;width:10px;border:0;} QScrollBar::handle:vertical{background:#46505b;border-radius:4px;min-height:32px;}
QCheckBox{padding:4px;font-size:14px;} QCheckBox::indicator{width:20px;height:20px;border:1px solid #778391;border-radius:4px;background:#11191f;} QCheckBox::indicator:checked{background:#ffd400;border-color:#ffd400;image:url(none);}
'''

PREMIUM_STYLE += '/* Native density: logical pixels, no hidden/clipped login controls. */\nQWidget{font-size:14px;}\nQLabel#brand{font-size:24px;} QLabel#hero{font-size:32px;}\nQLabel#loginTitle{font-size:27px;font-weight:700;padding-bottom:4px;}\nQLabel#hint{font-size:12px;color:#aab5bf;} QLabel#fieldLabel{font-size:13px;color:#d0d6dc;}\nQLabel#message{font-size:12px;padding:0 4px;}\nQLineEdit{padding:8px 11px;min-height:20px;border-radius:10px;}\nQPushButton{padding:7px 13px;min-height:20px;border-radius:8px;}\nQCheckBox{font-size:12px;padding:4px 0;} QCheckBox::indicator{width:16px;height:16px;}\nQFrame#card{border-radius:20px;}\nQWidget#scrim{background:rgba(0,0,0,165);}\nQFrame#settingsPanel{background:#10171d;border:1px solid #5f522f;border-radius:16px;}\nQLabel#drawerTitle{font-size:24px;font-weight:700;}\nQLabel#eyebrow{color:#dcc16d;font-size:11px;font-weight:700;padding-top:8px;padding-bottom:4px;}\nQLabel#accountValue{font-size:13px;padding:5px;color:#f5f6f7;}\nQFrame#divider{background:#2c363e;}\nQComboBox{background:#0b1217;border:1px solid #46525c;border-radius:8px;padding:8px;min-height:20px;}\nQComboBox:focus{border:2px solid #ffd400;} QComboBox QAbstractItemView{background:#17212a;color:#f5f6f7;selection-background-color:#463e22;}\n'

PREMIUM_STYLE += """
QFrame#settingsPanel{background:#0c1319;border:1px solid #766335;border-radius:18px;}
QFrame#settingsRail{background:qlineargradient(x1:0,y1:0,x2:0,y2:1,stop:0 #191c18,stop:1 #090e12);border-right:1px solid #343b3e;border-top-left-radius:18px;border-bottom-left-radius:18px;}
QFrame#settingsCard{background:#101b23;border:1px solid #2d414e;border-radius:14px;}
QLabel#sectionTitle{font-size:19px;font-weight:700;} QLabel#railBrand{font-size:20px;font-weight:800;}
QLabel#railAccount{color:#dde4e9;padding:10px 0;} QLabel#hint{color:#b5c1cb;}
QPushButton#settingsNav{text-align:left;padding:12px 10px;border:1px solid transparent;min-height:24px;}
QPushButton#settingsNav:checked{background:#332e1a;border-color:#a88a24;color:#ffe28b;}
QPushButton#settingsNav:focus{border-color:#ffe28b;}
QPushButton#danger{color:#ffb0ab;border-color:#a64640;background:#25181b;} QPushButton#danger:hover{background:#432124;}
QScrollArea{border:0;background:transparent;}
"""
