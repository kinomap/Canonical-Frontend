"""Cinematic surfaces painted at device resolution; images contain no controls.

0.1.9: the scene is composed once per size into a cached pixmap: the title backdrop as on the
website (fixed, masked, blurred behind the text column), and a frosted copy of it for the glass
header and filter bar.
"""
from collections import OrderedDict
from pathlib import Path
from PySide6.QtCore import Qt, QPoint, QRectF
from PySide6.QtGui import QPainter, QPixmap, QColor, QImage, QLinearGradient, QRadialGradient, QPainterPath, QPen
from PySide6.QtWidgets import QFrame, QGraphicsBlurEffect, QGraphicsPixmapItem, QGraphicsScene, QWidget
from . import icons as _icons
ASSETS=Path(__file__).parent/'assets'
BACKGROUND='#070b0e'
# Glass: translucent surface over the frosted scene, a low-contrast hairline, a soft shadow.
GLASS_TINT=QColor(14,18,24,115)
GLASS_LINE=QColor(255,255,255,22)


def blurred(image,radius,clamp=True):
    """Soft blur of a QImage by Qt's own blur effect. ``clamp``: the picture continues past its edges
    (photos, no dark rim); without it the outside stays transparent (shadows)."""
    w,h=image.width(),image.height();pad=int(radius*2)+2
    canvas=QImage(w+2*pad,h+2*pad,QImage.Format.Format_ARGB32_Premultiplied);canvas.fill(Qt.GlobalColor.transparent)
    p=QPainter(canvas);p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
    if clamp:p.drawImage(QRectF(0,0,canvas.width(),canvas.height()),image)
    p.drawImage(pad,pad,image);p.end()
    scene=QGraphicsScene();item=QGraphicsPixmapItem(QPixmap.fromImage(canvas));effect=QGraphicsBlurEffect()
    effect.setBlurRadius(radius);effect.setBlurHints(QGraphicsBlurEffect.BlurHint.QualityHint);item.setGraphicsEffect(effect);scene.addItem(item)
    out=QImage(w,h,QImage.Format.Format_ARGB32_Premultiplied);out.fill(Qt.GlobalColor.transparent)
    p=QPainter(out);scene.render(p,QRectF(0,0,w,h),QRectF(pad,pad,w,h));p.end()
    return out


def _mask(image,stops,vertical):
    """Multiply the image alpha by a linear gradient (CSS mask-image, mask-composite: intersect)."""
    p=QPainter(image);p.setCompositionMode(QPainter.CompositionMode.CompositionMode_DestinationIn)
    g=QLinearGradient(0,0,0,image.height()) if vertical else QLinearGradient(0,0,image.width(),0)
    for at,alpha in stops:g.setColorAt(at,QColor(0,0,0,int(255*alpha)))
    p.fillRect(image.rect(),g);p.end()


_shadows=OrderedDict()
def shadow_pixmap(width,height,radius,alpha=.62,blur=26):
    """(pixmap, pad): a soft dark shadow of a rounded rect, cached per size."""
    key=(int(width),int(height),radius,alpha,blur);pad=blur*2
    if key not in _shadows:
        image=QImage(int(width)+2*pad,int(height)+2*pad,QImage.Format.Format_ARGB32_Premultiplied);image.fill(Qt.GlobalColor.transparent)
        p=QPainter(image);p.setRenderHint(QPainter.RenderHint.Antialiasing);p.setPen(Qt.PenStyle.NoPen);p.setBrush(QColor(0,0,0,int(255*alpha)))
        p.drawRoundedRect(QRectF(pad,pad,width,height),radius,radius);p.end()
        _shadows[key]=QPixmap.fromImage(blurred(image,blur,clamp=False))
        while len(_shadows)>12:_shadows.popitem(last=False)
    return _shadows[key],pad


def backdrop_of(widget):
    parent=widget.parentWidget()
    while parent is not None and not isinstance(parent,CinemaBackdrop):parent=parent.parentWidget()
    return parent


def paint_glass(widget,p,radius,tint=GLASS_TINT,line=GLASS_LINE):
    """Frosted glass: the blurred scene behind ``widget``, a translucent tint and a hairline."""
    p.setRenderHint(QPainter.RenderHint.Antialiasing);rect=QRectF(widget.rect()).adjusted(.5,.5,-.5,-.5)
    path=QPainterPath();path.addRoundedRect(rect,radius,radius)
    backdrop=backdrop_of(widget)
    if backdrop is not None:
        frost=backdrop.frost();origin=widget.mapTo(backdrop,QPoint(0,0))
        if not frost.isNull() and backdrop.width()>0:
            sx=frost.width()/backdrop.width();sy=frost.height()/max(1,backdrop.height())
            p.save();p.setClipPath(path)
            p.drawPixmap(QRectF(widget.rect()),frost,QRectF(origin.x()*sx,origin.y()*sy,widget.width()*sx,widget.height()*sy));p.restore()
    p.fillPath(path,tint)
    p.setPen(QPen(line,1));p.setBrush(Qt.BrushStyle.NoBrush);p.drawPath(path)


class GlassFrame(QFrame):
    """A frame painted as frosted glass over the window scene (header, filter bar)."""
    def __init__(self,name,radius=16,parent=None):
        super().__init__(parent);self.setObjectName(name);self.radius=radius
    def paintEvent(self,event):
        p=QPainter(self);paint_glass(self,p,self.radius);p.end()


class CinemaBackdrop(QWidget):
    def __init__(self):
        super().__init__();self.catalog=False;self.art=QPixmap();self.glass=[]
        self.scene=QPixmap(str(ASSETS/'cinema-login.jpg'));self.header=QPixmap(str(ASSETS/'cinema-header.jpg'))
        self._scene=(None,QPixmap());self._frost=(None,QPixmap())
    def set_catalog(self,value):
        if self.catalog!=value:self.catalog=value;self.update_scene()
    def set_art(self,pixmap):
        # 0.1.8: the open title's backdrop replaces the header art, as the website hero.
        art=pixmap if isinstance(pixmap,QPixmap) and not pixmap.isNull() else QPixmap()
        if art.cacheKey()!=self.art.cacheKey():self.art=art;self.update_scene()
    def update_scene(self):
        self.update()
        for widget in self.glass:widget.update()
    def ratio(self):
        return max(1.0,min(3.0,float(self.devicePixelRatioF())))
    def key(self):
        return (self.catalog,self.art.cacheKey() if self.catalog and not self.art.isNull() else 0,self.width(),self.height(),self.ratio())
    def composed(self):
        """The whole background at device resolution, cached until the size or the art changes."""
        key=self.key()
        if self._scene[0]!=key:
            w,h,ratio=self.width(),self.height(),self.ratio();W,H=max(1,int(w*ratio)),max(1,int(h*ratio))
            image=QImage(W,H,QImage.Format.Format_ARGB32_Premultiplied);image.fill(QColor(BACKGROUND))
            p=QPainter(image);p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform);p.setRenderHint(QPainter.RenderHint.Antialiasing)
            if self.catalog and not self.art.isNull():p.end();self.paint_title(image)
            else:p.scale(ratio,ratio);self.paint_scene(p,w,h);p.end()
            pixmap=QPixmap.fromImage(image);pixmap.setDevicePixelRatio(ratio);self._scene=(key,pixmap);self._frost=(None,QPixmap())
        return self._scene[1]
    def frost(self):
        """Blurred copy of the scene (half resolution) for the glass surfaces."""
        scene=self.composed()
        if self._frost[0]!=self._scene[0]:
            small=scene.toImage().scaled(max(1,scene.width()//2),max(1,scene.height()//2),Qt.AspectRatioMode.IgnoreAspectRatio,Qt.TransformationMode.SmoothTransformation)
            self._frost=(self._scene[0],QPixmap.fromImage(blurred(small,9*self.ratio())))
        return self._frost[1]
    def paint_title(self,image):
        """The title page backdrop of the website: fixed, cover, centre 20 %, opacity .7, masked to the
        left and the bottom; the text column sits on a blurred band of the same picture."""
        W,H=image.width(),image.height()
        art=self.art.toImage().scaled(W,H,Qt.AspectRatioMode.KeepAspectRatioByExpanding,Qt.TransformationMode.SmoothTransformation)
        layer=QImage(W,H,QImage.Format.Format_ARGB32_Premultiplied);layer.fill(Qt.GlobalColor.transparent)
        p=QPainter(layer);p.drawImage(0,0,art,int((art.width()-W)/2),int((art.height()-H)*.2),W,H);p.end()
        _mask(layer,((0,.9),(.55,.4),(1,1)),True);_mask(layer,((0,1),(.4,.85),(.7,.5),(1,.2)),False)
        p=QPainter(image);p.setOpacity(.7);p.drawImage(0,0,layer);p.end()
        small=image.scaled(max(1,W//2),max(1,H//2),Qt.AspectRatioMode.IgnoreAspectRatio,Qt.TransformationMode.SmoothTransformation)
        band=blurred(small,8*self.ratio()).scaled(W,H,Qt.AspectRatioMode.IgnoreAspectRatio,Qt.TransformationMode.SmoothTransformation)
        band=band.convertToFormat(QImage.Format.Format_ARGB32_Premultiplied)
        _mask(band,((0,0),(.22,0),(.30,.3),(.40,.75),(.88,.75),(1,0)),False);_mask(band,((0,0),(.07,.9),(.80,.9),(1,0)),True)
        p=QPainter(image);p.drawImage(0,0,band);p.end()
    def paint_scene(self,p,w,h):
        image=self.header if self.catalog else self.scene
        target=QRectF(0,0,w,200) if self.catalog else QRectF(0,80,w*.64,h-80)
        if not image.isNull():
            scaled=image.scaled(int(target.width()),int(target.height()),Qt.AspectRatioMode.KeepAspectRatioByExpanding,Qt.TransformationMode.SmoothTransformation)
            p.drawPixmap(target,scaled,QRectF((scaled.width()-target.width())/2,0,target.width(),target.height()))
        if self.catalog:
            fade=QLinearGradient(0,55,0,215);fade.setColorAt(0,QColor(7,11,14,40));fade.setColorAt(1,QColor(BACKGROUND));p.fillRect(QRectF(0,0,w,h),fade)
        else:
            shade=QLinearGradient(0,0,w,0);shade.setColorAt(0,QColor(7,11,14,12));shade.setColorAt(.38,QColor(7,11,14,40));shade.setColorAt(.65,QColor(BACKGROUND));p.fillRect(QRectF(0,0,w,h),shade)
            fade=QLinearGradient(0,h*.55,0,h);fade.setColorAt(0,QColor(7,11,14,0));fade.setColorAt(.7,QColor(7,11,14,225));fade.setColorAt(1,QColor(BACKGROUND));p.fillRect(QRectF(0,0,w,h),fade)
        glow=QRadialGradient(w*.95,120,w*.38);glow.setColorAt(0,QColor(255,170,18,27));glow.setColorAt(1,QColor(255,170,18,0));p.fillRect(QRectF(0,0,w,h),glow)
    def paintEvent(self,event):
        p=QPainter(self);p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        p.drawPixmap(0,0,self.composed())
        for widget in self.glass:
            if widget.isVisible() and widget.width()>0:
                origin=widget.mapTo(self,QPoint(0,0));shadow,pad=shadow_pixmap(widget.width(),widget.height(),getattr(widget,'radius',16),.32,14)
                p.drawPixmap(origin.x()-pad,origin.y()-pad+6,shadow)

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

ICON_NAMES={'grid':'layout-grid','reset':'rotate-ccw','gear':'settings'}
def glyph(name,color='#d5dbe0',size=18):
    """Header and toolbar pictograms: the Lucide set of the website (see icons.py)."""
    return _icons.glyph(ICON_NAMES.get(name,name),color,size)

def icon(name,color='#d5dbe0',size=18,checked=None):
    return _icons.icon(ICON_NAMES.get(name,name),color,size,checked)

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

# 0.1.8: softer controls without yellow hover frames, the honey gradient of the website,
# the title page (poster, facts, options card, cast) and the search suggestions.
PREMIUM_STYLE += """
QPushButton{background:rgba(255,255,255,10);border:1px solid rgba(255,255,255,26);border-radius:10px;}
QPushButton:hover{background:rgba(255,255,255,20);border-color:rgba(255,255,255,41);}
QPushButton:pressed{background:rgba(255,255,255,28);} QPushButton:focus{border:1px solid rgba(255,194,26,140);}
QPushButton:disabled{color:#7d858d;background:rgba(255,255,255,6);border-color:rgba(255,255,255,15);}
QPushButton#primary,QPushButton#watch{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffe36e,stop:.46 #ffc21a,stop:1 #ff9e1b);color:#11120e;font-weight:800;border:1px solid rgba(255,227,110,180);}
QPushButton#primary:hover,QPushButton#watch:hover{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffea8a,stop:.46 #ffcd3f,stop:1 #ffab3a);}
QPushButton#primary:focus,QPushButton#watch:focus{border:2px solid #fff1b8;}
QPushButton#primary:disabled,QPushButton#watch:disabled{color:#8a929b;background:rgba(255,255,255,8);border-color:rgba(255,255,255,20);}
QPushButton#watch{font-size:16px;border-radius:12px;padding:12px 28px;}
QPushButton#avatar{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffe36e,stop:.46 #ffc21a,stop:1 #ff9e1b);color:#11120e;border:1px solid rgba(255,227,110,180);}
QPushButton#avatar:hover{background:#ffd24d;} QPushButton#avatar:focus{border:2px solid #ffffff;}
QPushButton#nav{border:0;background:transparent;color:#c9d1d9;}
QPushButton#nav:hover{background:rgba(255,255,255,15);border:0;color:#f5f6f7;}
QPushButton#nav:checked{background:rgba(255,194,26,31);border:0;color:#ffd24d;}
QPushButton#nav:focus{border:1px solid rgba(255,194,26,140);}
QLineEdit#headerSearch{background:rgba(255,255,255,13);border:1px solid rgba(255,255,255,26);border-radius:12px;}
QLineEdit#headerSearch:focus{background:rgba(255,255,255,18);border:1px solid rgba(255,194,26,160);}
QComboBox{background:rgba(255,255,255,10);border:1px solid rgba(255,255,255,26);border-radius:10px;padding:7px 30px 7px 12px;min-height:20px;}
QComboBox:hover{background:rgba(255,255,255,18);border-color:rgba(255,255,255,41);}
QComboBox:focus{border:1px solid rgba(255,194,26,160);}
QComboBox::drop-down{width:0;border:0;} QComboBox::down-arrow{image:none;width:0;height:0;}
QComboBox QAbstractItemView{background:#151a20;color:#f5f6f7;border:1px solid rgba(255,255,255,26);padding:4px;outline:0;selection-background-color:rgba(255,194,26,46);selection-color:#ffd24d;}
QComboBox QAbstractItemView::item{min-height:30px;padding:0 10px;border-radius:6px;}
QComboBox QAbstractItemView::item:hover{background:rgba(255,255,255,15);}
QComboBox QAbstractItemView::item:selected{background:rgba(255,194,26,46);color:#ffd24d;}
QComboBox#filterCombo{padding:5px 26px 5px 10px;border-radius:8px;}
QComboBox#filterCombo:focus{border:1px solid rgba(255,194,26,160);}
QPushButton#filterToggle:hover{border-color:transparent;background:rgba(255,255,255,15);}
QPushButton#chip{background:rgba(255,194,26,31);border:1px solid rgba(255,194,26,77);color:#ffd24d;}
QPushButton#chip:hover{border-color:rgba(255,194,26,128);}
QPushButton#chipAdd{background:rgba(255,255,255,10);border:1px solid rgba(255,255,255,26);}
QPushButton#chipAdd:hover{background:rgba(255,255,255,20);border-color:rgba(255,255,255,41);}
QPushButton#filterReset{background:transparent;border:1px solid rgba(255,255,255,26);}
QPushButton#filterReset:hover{background:rgba(255,255,255,15);border-color:rgba(255,255,255,41);}
QPushButton#pageNav,QPushButton#pageButton{background:rgba(255,255,255,8);border:1px solid rgba(255,255,255,26);border-radius:8px;}
QPushButton#pageNav:hover,QPushButton#pageButton:hover{background:rgba(255,255,255,18);border-color:rgba(255,255,255,41);}
QPushButton#pageButton:checked{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffe36e,stop:.46 #ffc21a,stop:1 #ff9e1b);color:#11120e;border-color:rgba(255,227,110,180);}
QPushButton#viewToggle{background:transparent;border:1px solid rgba(255,255,255,26);}
QPushButton#viewToggle:hover{background:rgba(255,255,255,15);}
QPushButton#viewToggle:checked{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffe36e,stop:.46 #ffc21a,stop:1 #ff9e1b);border-color:rgba(255,227,110,180);}
QPushButton#iconButton:hover{border-color:transparent;background:rgba(255,255,255,15);}
QPushButton#pill{background:rgba(255,255,255,8);border:1px solid rgba(255,255,255,26);border-radius:16px;padding:6px 14px;}
QPushButton#pill:hover{background:rgba(255,255,255,18);border-color:rgba(255,255,255,46);}
QPushButton#pill:checked{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffe36e,stop:.46 #ffc21a,stop:1 #ff9e1b);color:#11120e;border:1px solid rgba(255,227,110,180);}
QPushButton#pill:disabled{color:#5f6870;background:transparent;border-color:rgba(255,255,255,13);}
QPushButton#voice{padding:5px 12px;min-height:18px;border-radius:14px;background:rgba(255,255,255,8);border:1px solid rgba(255,255,255,26);font-size:13px;font-weight:600;}
QPushButton#voice:hover{background:rgba(255,255,255,18);border-color:rgba(255,255,255,46);}
QPushButton#voice:checked{background:rgba(255,194,26,36);border-color:rgba(255,194,26,150);color:#ffd24d;}
QScrollArea#detailScroll,QWidget#detailBody{background:transparent;}
QPushButton#backChip{padding:6px 12px 6px 10px;border-radius:8px;font-size:13px;font-weight:600;color:rgba(245,246,248,173);background:rgba(255,255,255,13);border:none;}
QPushButton#backChip:hover{color:#f5f6f8;background:rgba(255,255,255,23);}
QLabel#detailEyebrow{color:rgba(245,246,248,112);font-size:12px;font-weight:700;letter-spacing:2px;}
QLabel#torrentTitle{font-size:40px;font-weight:800;color:#ffffff;}
QLabel#subtitle{color:#aab5bf;font-size:15px;}
QLabel#fact{padding:6px 12px;border-radius:8px;background:rgba(255,255,255,13);border:none;color:rgba(245,246,248,173);font-size:13px;}
QLabel#factRating{padding:6px 12px;border-radius:8px;background:rgba(255,194,26,36);border:none;color:#ffd24d;font-size:13px;font-weight:700;}
QLabel#progress{font-size:14px;font-weight:700;} QLabel#progress[tone="ready"]{color:#3ddc84;}
QLabel#progress[tone="active"]{color:#ffd24d;} QLabel#progress[tone="muted"]{color:#aab5bf;font-weight:600;}
QLabel#selected{font-size:14px;font-weight:500;color:#c2cad2;}
QProgressBar#prepBar{background:rgba(255,255,255,15);border:0;border-radius:3px;}
QProgressBar#prepBar::chunk{background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 #ffe36e,stop:.46 #ffc21a,stop:1 #ff9e1b);border-radius:3px;}
QFrame#optionsCard{background:rgba(255,255,255,8);border:1px solid rgba(255,255,255,20);border-radius:16px;}
QLabel#caption{color:#8f9ba6;font-size:11px;font-weight:700;letter-spacing:1px;padding-top:7px;}
QLabel#sectionCaption{color:#8f9ba6;font-size:12px;font-weight:700;letter-spacing:2px;}
QLabel#overview{color:#d5dbe0;font-size:15px;}
QLabel#factKey{color:#8f9ba6;font-size:13px;} QLabel#factValue{color:#f5f6f7;font-size:13px;font-weight:600;}
QFrame#castCard{background:rgba(255,255,255,8);border:1px solid rgba(255,255,255,18);border-radius:14px;}
QLabel#castPhoto{background:rgba(255,255,255,15);border-radius:10px;color:#ffd24d;font-size:15px;font-weight:800;}
QLabel#castName{color:#f5f6f7;font-size:14px;font-weight:700;} QLabel#castRole{color:#8f9ba6;font-size:12px;}
QFrame#suggest{background:rgba(23,26,33,245);border:1px solid rgba(255,255,255,20);border-radius:16px;}
QFrame#suggestRow{background:transparent;border-radius:10px;} QFrame#suggestRow[active="true"]{background:rgba(255,255,255,18);}
QLabel#suggestTitle{color:#f5f6f7;font-size:14px;font-weight:600;} QLabel#suggestMeta{color:#8f9ba6;font-size:12px;}
QLabel#suggestHint{color:#aab5bf;font-size:12px;padding:4px 8px 2px 8px;}
"""

# 0.1.9: glass header and filter bar (painted, see GlassFrame / paint_glass), the website title page
# (top bar, sticky poster, info column, options, people cards) with the KINOSOTA honey accents.
PREMIUM_STYLE += """
QFrame#header,QFrame#filters{background:transparent;border:0;}
QListWidget{background:transparent;}
QWidget#detailPage,QScrollArea#detailScroll,QWidget#detailBody,QWidget#detailHero,QWidget#detailInfo,QWidget#detailDetails,QWidget#posterColumn,QWidget#detailTopbar{background:transparent;}
QPushButton#backBtn{background:transparent;border:1px solid rgba(255,255,255,31);border-radius:6px;padding:6px 14px;min-height:18px;color:rgba(255,255,255,166);font-size:13px;font-weight:500;}
QPushButton#backBtn:hover{background:transparent;border-color:rgba(255,255,255,77);color:#ffffff;}
QPushButton#backBtn:focus{border:1px solid rgba(255,194,26,140);}
QLabel#detailMeta{font-size:13px;font-weight:600;color:rgba(255,255,255,140);letter-spacing:1px;margin-bottom:10px;}
QLabel#detailName{font-weight:800;color:#ffffff;}
QLabel#tagline{font-size:17px;font-style:italic;color:rgba(255,255,255,166);margin-top:12px;}
QLabel#ratingValue{font-size:22px;font-weight:700;color:#ffffff;}
QLabel#sourceTag{font-size:10px;font-weight:500;color:#7a8499;border:1px solid rgba(255,255,255,38);border-radius:3px;padding:1px 5px;}
QLabel#statusBadge{font-size:11px;color:#9aa3b8;border:1px solid rgba(255,255,255,64);border-radius:4px;padding:2px 7px;}
QLabel#durationGenres{font-size:14px;color:rgba(255,255,255,166);margin-top:12px;}
QPushButton#watch[hero="true"],QPushButton#primary[hero="true"]{font-size:17px;font-weight:700;border-radius:10px;padding:0 36px;min-height:54px;max-height:54px;}
QPushButton#iconBtn{background:rgba(255,255,255,18);border:1px solid rgba(255,255,255,31);border-radius:10px;padding:0;min-width:54px;max-width:54px;min-height:54px;max-height:54px;}
QPushButton#iconBtn:hover{background:rgba(255,255,255,36);border-color:rgba(255,255,255,64);}
QPushButton#iconBtn:checked{background:rgba(255,194,26,31);border-color:rgba(255,194,26,102);}
QPushButton#iconBtn:checked:hover{background:rgba(255,194,26,46);border-color:rgba(255,194,26,140);}
QPushButton#iconBtn:focus{border:1px solid rgba(255,194,26,160);}
QLabel#selectedInfo{font-size:13px;color:#ffd24d;margin-top:8px;}
QLabel#pickerLabel{font-size:11px;font-weight:700;color:rgba(255,255,255,77);letter-spacing:1px;}
QPushButton#opt{background:rgba(255,255,255,15);border:1px solid rgba(255,255,255,31);border-radius:8px;padding:7px 18px;min-height:18px;color:rgba(255,255,255,191);font-size:13px;font-weight:600;}
QPushButton#opt:hover{background:rgba(255,255,255,26);border-color:rgba(255,255,255,56);color:#f5f5f5;}
QPushButton#opt:checked{background:rgba(245,245,245,31);border-color:rgba(245,245,245,89);color:#f5f5f5;}
QPushButton#opt:disabled{background:rgba(255,255,255,8);border-color:rgba(255,255,255,15);color:rgba(255,255,255,64);}
QPushButton#opt:focus{border:1px solid rgba(255,194,26,160);}
QComboBox#detailCombo{border-radius:8px;padding:6px 30px 6px 12px;font-size:13px;font-weight:600;}
QLabel#detailHint{font-size:12px;color:#aab5bf;margin-top:12px;}
QLabel#posterStatus{font-size:12px;color:#677084;padding:0 2px;}
QLabel#posterStatus[tone="ready"]{color:#3ddc84;}
QLabel#progressMeta{font-size:11px;color:#9aa3b8;}
QProgressBar#prepBar{background:rgba(255,255,255,20);border:0;border-radius:1px;}
QProgressBar#prepBar::chunk{background:qlineargradient(x1:0,y1:0,x2:1,y2:0,stop:0 #3ddc84,stop:1 #ffc21a);border-radius:1px;}
QLabel#sectionCaption{font-size:11px;font-weight:700;color:rgba(255,255,255,89);letter-spacing:1.5px;margin-bottom:16px;}
QLabel#overview{font-size:16px;color:rgba(255,255,255,179);}
QLabel#detailChip{background:rgba(255,255,255,10);border:1px solid rgba(255,255,255,20);border-radius:5px;padding:4px 10px;font-size:12px;color:#7a8499;}
QScrollArea#peopleStrip,QWidget#peopleBody{background:transparent;}
QScrollBar:vertical{background:transparent;width:10px;margin:2px 2px 2px 0;border:0;}
QScrollBar::handle:vertical{background:rgba(255,255,255,46);border-radius:3px;min-height:40px;}
QScrollBar::handle:vertical:hover{background:rgba(255,255,255,82);}
QScrollBar::add-line:vertical,QScrollBar::sub-line:vertical{height:0;border:0;background:transparent;}
QScrollBar::add-page:vertical,QScrollBar::sub-page:vertical{background:transparent;}
QFrame#personCard{background:transparent;border:0;border-radius:20px;}
QFrame#personCard[hover="true"]{background:#ffffff;}
QLabel#personPhoto{background:#1a2236;border-radius:18px;color:#ffd24d;font-size:22px;font-weight:800;}
QLabel#personName{font-size:20px;font-weight:500;color:#ffffff;}
QLabel#personName[compact="true"]{font-size:17px;}
QLabel#personName[hover="true"]{color:#000000;}
QLabel#personRole{font-size:15px;color:rgba(255,255,255,166);}
QLabel#personRole[compact="true"]{font-size:13px;}
QLabel#personRole[hover="true"]{color:#333333;}
"""
# 0.1.9: the «Обновления» card in Settings → «О приложении».
PREMIUM_STYLE += '\nQLabel#updateStatus{font-size:15px;font-weight:600;color:#f3f5f7;}\n'
