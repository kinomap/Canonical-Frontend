"""Cinematic surfaces painted at device resolution; images contain no controls."""
import math
from pathlib import Path
from PySide6.QtCore import Qt, QRectF, QPointF
from PySide6.QtGui import QPainter,QPixmap,QColor,QLinearGradient,QRadialGradient,QPen,QIcon
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

# Torrents section: header tabs, quality / voice pills, white «▶ Смотреть» button.
PREMIUM_STYLE += """
QPushButton#nav{padding:8px 14px;border:1px solid transparent;background:transparent;min-height:20px;border-radius:8px;}
QPushButton#nav:hover{border-color:#5e542c;} QPushButton#nav:checked{background:#332e1a;border-color:#a88a24;color:#ffe28b;}
QPushButton#pill{padding:6px 14px;border:1px solid #4a535c;border-radius:16px;background:transparent;min-height:20px;font-weight:600;}
QPushButton#pill:hover{border-color:#ffd400;} QPushButton#pill:checked{background:#ffd400;color:#11120e;border-color:#ffe04a;}
QPushButton#pill:disabled{color:#5f6870;border-color:#262e35;background:transparent;}
QPushButton#watch{background:#ffffff;color:#0b0f12;font-size:16px;font-weight:800;border:1px solid #ffffff;border-radius:10px;padding:12px 28px;}
QPushButton#watch:hover{background:#eceff1;} QPushButton#watch:disabled{color:#8a929b;background:#1b2228;border-color:#323c44;}
QLabel#torrentTitle{font-size:26px;font-weight:800;} QLabel#caption{color:#9ce8d7;font-size:12px;font-weight:600;letter-spacing:1px;}
QLabel#selected{font-size:15px;font-weight:600;} QLabel#progress{font-size:14px;}
QComboBox{background:#0b1217;border:1px solid #3c464e;border-radius:10px;padding:8px 12px;min-height:22px;}
QComboBox:focus{border:2px solid #ffd400;} QComboBox QAbstractItemView{background:#0b1217;border:1px solid #3c464e;selection-background-color:#ffd400;selection-color:#101010;}
"""

def glyph(name,color='#d5dbe0',size=18):
    """Header and toolbar pictograms drawn in code: no icon font is required on any OS."""
    ratio=2;pm=QPixmap(size*ratio,size*ratio);pm.fill(Qt.GlobalColor.transparent)
    p=QPainter(pm);p.setRenderHint(QPainter.RenderHint.Antialiasing);p.scale(ratio,ratio);c=QColor(color);s=float(size)
    if name=='search':
        p.setPen(QPen(c,s*.11));p.setBrush(Qt.BrushStyle.NoBrush);p.drawEllipse(QRectF(s*.14,s*.14,s*.5,s*.5))
        pen=QPen(c,s*.13);pen.setCapStyle(Qt.PenCapStyle.RoundCap);p.setPen(pen);p.drawLine(QPointF(s*.6,s*.6),QPointF(s*.86,s*.86))
    elif name=='gear':
        centre=QPointF(s/2,s/2);pen=QPen(c,s*.15);pen.setCapStyle(Qt.PenCapStyle.FlatCap);p.setPen(pen)
        for i in range(8):
            a=math.radians(i*45+22.5);d=QPointF(math.cos(a),math.sin(a));p.drawLine(centre+d*(s*.29),centre+d*(s*.47))
        p.setPen(QPen(c,s*.12));p.setBrush(Qt.BrushStyle.NoBrush);p.drawEllipse(centre,s*.24,s*.24)
    elif name=='grid':
        p.setPen(Qt.PenStyle.NoPen);p.setBrush(c)
        for x in (.1,.56):
            for y in (.1,.56):p.drawRoundedRect(QRectF(s*x,s*y,s*.34,s*.34),s*.07,s*.07)
    elif name in ('chevron-down','chevron-up'):
        pen=QPen(c,s*.13);pen.setCapStyle(Qt.PenCapStyle.RoundCap);pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin);p.setPen(pen)
        y0,y1=(.38,.62) if name=='chevron-down' else (.62,.38)
        p.drawPolyline([QPointF(s*.25,s*y0),QPointF(s*.5,s*y1),QPointF(s*.75,s*y0)])
    elif name=='reset':
        pen=QPen(c,s*.11);pen.setCapStyle(Qt.PenCapStyle.RoundCap);p.setPen(pen);p.setBrush(Qt.BrushStyle.NoBrush)
        box=QRectF(s*.18,s*.18,s*.64,s*.64);p.drawArc(box,int(70*16),int(290*16))
        p.setPen(Qt.PenStyle.NoPen);p.setBrush(c);tip=QPointF(s*.5+s*.32*math.cos(math.radians(70)),s*.5-s*.32*math.sin(math.radians(70)))
        p.drawPolygon([tip+QPointF(s*.17,-s*.02),tip+QPointF(-s*.05,-s*.17),tip+QPointF(-s*.03,s*.15)])
    elif name=='list':
        p.setPen(Qt.PenStyle.NoPen);p.setBrush(c)
        for y in (.13,.43,.73):
            p.drawRoundedRect(QRectF(s*.08,s*y,s*.16,s*.16),s*.04,s*.04);p.drawRoundedRect(QRectF(s*.34,s*y+s*.025,s*.58,s*.11),s*.05,s*.05)
    p.end();pm.setDevicePixelRatio(ratio);return pm

def icon(name,color='#d5dbe0',size=18,checked=None):
    result=QIcon();result.addPixmap(glyph(name,color,size),QIcon.Mode.Normal,QIcon.State.Off)
    if checked:result.addPixmap(glyph(name,checked,size),QIcon.Mode.Normal,QIcon.State.On)
    return result

# 0.1.7: header search, filter panel (screen «Фильтры»), found counter, pagination.
PREMIUM_STYLE += """
QLabel#brand{font-size:20px;font-weight:800;}
QPushButton#nav{padding:6px 12px;min-height:20px;font-weight:600;}
QPushButton#nav[compact="true"]{padding:6px 7px;}
QLineEdit#headerSearch{padding:5px 10px;min-height:20px;border-radius:10px;background:#0b1217;border:1px solid #323d46;}
QLineEdit#headerSearch:focus{border:2px solid #ffd400;}
QLabel#kbd{color:#8d98a3;font-size:11px;border:1px solid #3a444d;border-radius:5px;padding:1px 6px;background:#121a20;}
QPushButton#iconButton{padding:5px;min-width:22px;min-height:22px;border:1px solid transparent;background:transparent;border-radius:9px;}
QPushButton#iconButton:hover{border-color:#5e542c;background:#141c22;} QPushButton#iconButton:focus{border:2px solid #ffdc65;}
QPushButton#avatar{min-width:32px;max-width:32px;min-height:32px;max-height:32px;padding:0;border-radius:16px;background:#ffd400;color:#11120e;font-weight:800;font-size:14px;border:1px solid #ffe04a;}
QPushButton#avatar:hover{background:#ffe650;} QPushButton#avatar:focus{border:2px solid #ffffff;}
QFrame#filters{background:rgba(12,19,25,232);border:1px solid #25313a;border-radius:14px;}
QLabel#filterCaption{color:#8f9ba6;font-size:11px;font-weight:600;padding-left:2px;}
QPushButton#filterToggle{padding:6px 8px;border:1px solid transparent;background:transparent;font-weight:700;min-height:20px;}
QPushButton#filterToggle:hover{border-color:#5e542c;}
QComboBox#filterCombo{padding:5px 26px 5px 10px;border-radius:8px;min-height:20px;background:#0b1217;border:1px solid #33404a;}
QComboBox#filterCombo::drop-down{width:0;border:0;} QComboBox#filterCombo::down-arrow{image:none;width:0;height:0;}
QComboBox#filterCombo:focus{border:2px solid #ffd400;} QComboBox#filterCombo:disabled{color:#8a929b;}
QPushButton#chip{padding:4px 10px;border-radius:13px;background:#2a2512;border:1px solid #8c7322;color:#ffe28b;min-height:20px;font-size:13px;}
QPushButton#chip:hover{border-color:#ffd400;}
QPushButton#chipAdd{padding:5px 10px;border-radius:8px;background:#0b1217;border:1px solid #33404a;min-height:20px;}
QPushButton#chipAdd:hover{border-color:#ffd400;}
QPushButton#filterReset{padding:5px 12px;background:transparent;border:1px solid #3a444d;min-height:20px;}
QPushButton#filterReset:hover{border-color:#ffd400;}
QLabel#filterSummary{color:#c2cad2;font-size:12px;}
QLabel#found{color:#c2cad2;font-size:13px;padding-left:2px;}
QPushButton#viewToggle{padding:3px;min-width:24px;min-height:22px;border:1px solid #323c44;background:transparent;border-radius:7px;}
QPushButton#viewToggle:checked{background:#ffd400;border-color:#ffe04a;}
QPushButton#pageButton{padding:4px 8px;min-width:14px;min-height:20px;border:1px solid #323c44;background:transparent;border-radius:7px;font-size:13px;}
QPushButton#pageButton:checked{background:#ffd400;color:#11120e;border-color:#ffe04a;font-weight:800;}
QPushButton#pageNav{padding:4px 10px;min-height:20px;border:1px solid #323c44;background:transparent;border-radius:7px;font-size:13px;}
QPushButton#pageNav:hover,QPushButton#pageButton:hover{border-color:#ffd400;}
QLabel#gap{color:#8f9ba6;padding:0 2px;}
"""
