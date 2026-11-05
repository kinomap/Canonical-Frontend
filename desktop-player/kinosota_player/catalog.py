"""Poster grid: native keyboard navigation, bounded anonymous artwork requests."""
from collections import OrderedDict
import math
from .preferences import movie_title, translate
from urllib.parse import urljoin, urlsplit
from PySide6.QtCore import Qt, QSize, QRectF, QPointF, QUrl, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPainterPath, QPen, QPixmap, QLinearGradient, QPolygonF
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest, QNetworkReply
from PySide6.QtWidgets import QListWidget, QListView, QStyledItemDelegate, QStyle

class Posters:
    def __init__(self, view, origin, size=(440,660)):
        self.view=view;self.origin=origin;self.size=size;self.cache=OrderedDict();self.pending={}
        self.network=QNetworkAccessManager(view)
    def url(self, source):
        if not isinstance(source,str) or not source:return ''
        u=urljoin(self.origin+'/',source);p=urlsplit(u)
        # Never send bearer/cookies to artwork providers, nor allow local file access.
        hosts={urlsplit(self.origin).hostname,'image.tmdb.org','images.fanart.tv','m.media-amazon.com','st.kp.yandex.net','avatars.mds.yandex.net','kinopoiskapiunofficial.tech'}
        return u if p.scheme=='https' and p.hostname in hosts and not p.username and not p.password else ''
    def get(self, source):
        u=self.url(source)
        return self.cache.get(u)
    def load(self, source):
        u=self.url(source)
        if not u or u in self.cache or u in self.pending:return
        req=QNetworkRequest(QUrl(u));req.setTransferTimeout(12000)
        req.setAttribute(QNetworkRequest.Attribute.RedirectPolicyAttribute,QNetworkRequest.RedirectPolicy.SameOriginRedirectPolicy)
        req.setAttribute(QNetworkRequest.Attribute.CookieLoadControlAttribute,QNetworkRequest.LoadControl.Manual)
        req.setAttribute(QNetworkRequest.Attribute.CookieSaveControlAttribute,QNetworkRequest.LoadControl.Manual)
        reply=self.network.get(req);self.pending[u]=reply
        reply.readyRead.connect(lambda:reply.abort() if reply.bytesAvailable()>8*1024*1024 else None)
        def finish():
            self.pending.pop(u,None);image=QPixmap()
            if reply.error()==QNetworkReply.NetworkError.NoError and reply.bytesAvailable()<=8*1024*1024:
                image.loadFromData(reply.readAll())
            if not image.isNull():image=image.scaled(self.size[0],self.size[1],Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation)
            self.cache[u]=image
            while len(self.cache)>128:self.cache.popitem(last=False)
            reply.deleteLater();self.view.viewport().update()
        reply.finished.connect(finish)
    def clear(self):
        for r in list(self.pending.values()):r.abort()
        self.cache.clear()

def bookmarkable(movie):
    """Library entries are keyed by TMDB identity; site films without one cannot be saved.
    The ribbon appears only once the card's library state (``_saved``) is known."""
    tmdb_id=movie.get('tmdb_id') if isinstance(movie,dict) else None
    return type(tmdb_id) is int and 0<tmdb_id<=2147483647 and (movie.get('kind') or 'movie') in ('movie','tv') and '_saved' in movie

def bookmark_rect(cell,list_mode=False):
    """Ribbon on the poster's top-left corner, shared by painting and hit testing."""
    cell=QRectF(cell)
    if list_mode:
        r=cell.adjusted(8,5,-8,-5);return QRectF(r.left()+4,r.top(),18,25)
    r=cell.adjusted(9,8,-9,-8)
    if r.width()<120:return QRectF(r.left()+5,r.top(),16,22)  # Small tiles keep the rating visible.
    return QRectF(r.left()+8,r.top(),22,30)

def meta_text(movie,language='ru'):
    parts=[str(movie.get('year'))] if movie.get('year') else []
    if movie.get('_source')=='tmdb':parts.append(translate('Сериал' if movie.get('kind')=='tv' else 'Торрент',language))
    elif movie.get('quality'):parts.append(str(movie.get('quality')))
    return ' · '.join(parts)

class TileDelegate(QStyledItemDelegate):
    def sizeHint(self,option,index):
        # Text-based native hints vary by Qt/OS and collapse short-title posters.
        return self.parent().gridSize()
    def artwork(self,p,poster,movie,title_size=15):
        image=self.parent().posters.get(movie.get('poster') or movie.get('poster_url'))
        if image and not image.isNull():
            scaled=image.scaled(int(poster.width()),int(poster.height()),Qt.AspectRatioMode.KeepAspectRatioByExpanding,Qt.TransformationMode.SmoothTransformation)
            x=(scaled.width()-poster.width())/2;y=(scaled.height()-poster.height())/2
            p.drawPixmap(poster,scaled,QRectF(x,y,poster.width(),poster.height()))
        else:
            gradient=QLinearGradient(poster.topLeft(),poster.bottomRight());gradient.setColorAt(0,QColor('#262344'));gradient.setColorAt(.55,QColor('#101c2a'));gradient.setColorAt(1,QColor('#080e12'));p.fillRect(poster,gradient)
            if title_size:
                p.setPen(QColor('#aab4c7'));p.setFont(QFont('Manrope',10));p.drawText(poster.adjusted(16,24,-16,-24),Qt.AlignmentFlag.AlignTop|Qt.AlignmentFlag.AlignHCenter,'K I N O S O T A')
                p.setPen(QColor('#f4f5f7'));p.setFont(QFont('Manrope',title_size,QFont.Weight.Bold));p.drawText(poster.adjusted(18,62,-18,-32),Qt.AlignmentFlag.AlignCenter|Qt.TextFlag.TextWordWrap,movie_title(movie,getattr(self.parent(),'title_language','ru')))
    @staticmethod
    def ribbon(p,rect,saved):
        path=QPainterPath();path.moveTo(rect.left(),rect.top());path.lineTo(rect.right(),rect.top());path.lineTo(rect.right(),rect.bottom())
        path.lineTo(rect.center().x(),rect.bottom()-rect.width()*.32);path.lineTo(rect.left(),rect.bottom());path.closeSubpath()
        p.setPen(QPen(QColor('#3d3209') if saved else QColor('#dfe4e8'),1.2));p.setBrush(QColor('#ffd400') if saved else QColor(9,14,18,185));p.drawPath(path)
    @staticmethod
    def badge(p,rect,rating,size=10):
        p.setPen(QPen(QColor('#806624'),1));p.setBrush(QColor('#10151e'));p.drawRoundedRect(rect,6,6);p.setPen(QColor('#ffdc6c'));p.setFont(QFont('Manrope',size,QFont.Weight.Bold));p.drawText(rect,Qt.AlignmentFlag.AlignCenter,f'{float(rating):.1f}')
    def paint(self,p,option,index):
        movie=index.data(Qt.ItemDataRole.UserRole) or {}
        if getattr(self.parent(),'list_mode',False):return self.paint_row(p,option,movie)
        r=QRectF(option.rect).adjusted(9,8,-9,-8)
        width=r.width();poster=QRectF(r.left(),r.top(),width,width*1.5)
        selected=bool(option.state & (QStyle.StateFlag.State_Selected|QStyle.StateFlag.State_MouseOver|QStyle.StateFlag.State_HasFocus))
        p.save();p.setRenderHint(QPainter.RenderHint.Antialiasing)
        clip=QPainterPath();clip.addRoundedRect(poster,10,10);p.setClipPath(clip)
        self.artwork(p,poster,movie)
        if selected:
            p.fillRect(poster,QColor(0,0,0,75));c=poster.center();p.setPen(QPen(QColor('#ffcc32'),1));p.setBrush(QColor('#090e12'));p.drawEllipse(c,27,27)
            p.setPen(Qt.PenStyle.NoPen);p.setBrush(QColor('#ffffff'));p.drawPolygon(QPolygonF([QPointF(c.x()-6,c.y()-10),QPointF(c.x()-6,c.y()+10),QPointF(c.x()+12,c.y())]))
        rating=movie.get('rating')
        if rating:
            small=width<120  # Smallest windows: the badge must not hide the artwork.
            self.badge(p,QRectF(poster.right()-(36 if small else 46),poster.top()+(6 if small else 8),30 if small else 38,20 if small else 26),rating,8 if small else 10)
        if bookmarkable(movie):self.ribbon(p,bookmark_rect(option.rect),bool(movie.get('_saved')))
        p.setClipping(False);p.setPen(QPen(QColor('#ffd34d' if selected else '#303943'),2 if selected else 1));p.setBrush(Qt.BrushStyle.NoBrush);p.drawRoundedRect(poster,10,10)
        p.setPen(QColor('#f3f5f7'));font=QFont('Manrope',9,QFont.Weight.DemiBold);p.setFont(font)
        title=movie_title(movie,getattr(self.parent(),'title_language','ru'));metrics=p.fontMetrics();maxw=int(width);words=title.split();lines=[];line=''
        for word in words:
            trial=(line+' '+word).strip()
            if line and metrics.horizontalAdvance(trial)>maxw:lines.append(line);line=word
            else:line=trial
        if line:lines.append(line)
        for i,text in enumerate(lines[:2]):
            if i==1 and len(lines)>2:text+='…'
            p.drawText(QRectF(r.left(),poster.bottom()+6+i*17,width,18),Qt.AlignmentFlag.AlignLeft|Qt.AlignmentFlag.AlignVCenter,metrics.elidedText(text,Qt.TextElideMode.ElideRight,maxw))
        p.setPen(QColor('#9faebe'));p.setFont(QFont('Manrope',8));p.drawText(QRectF(r.left(),poster.bottom()+41,width,17),Qt.AlignmentFlag.AlignLeft|Qt.AlignmentFlag.AlignVCenter,meta_text(movie,getattr(self.parent(),'language','ru')));p.restore()
    def paint_row(self,p,option,movie):
        """List view: thumbnail, title, year · quality, rating on the right."""
        r=QRectF(option.rect).adjusted(8,5,-8,-5);thumb=QRectF(r.left(),r.top(),r.height()/1.5,r.height())
        selected=bool(option.state & (QStyle.StateFlag.State_Selected|QStyle.StateFlag.State_MouseOver|QStyle.StateFlag.State_HasFocus))
        p.save();p.setRenderHint(QPainter.RenderHint.Antialiasing)
        row=QRectF(option.rect).adjusted(2,2,-2,-2);p.setPen(QPen(QColor('#ffd34d') if selected else QColor('#1d262e'),1.5 if selected else 1));p.setBrush(QColor('#0d151b') if selected else QColor('#0a1116'));p.drawRoundedRect(row,10,10)
        clip=QPainterPath();clip.addRoundedRect(thumb,6,6);p.setClipPath(clip);self.artwork(p,thumb,movie,0);p.setClipping(False)
        if bookmarkable(movie):self.ribbon(p,bookmark_rect(option.rect,True),bool(movie.get('_saved')))
        text_left=thumb.right()+16;right=r.right()-(64 if movie.get('rating') else 8)
        p.setPen(QColor('#f3f5f7'));p.setFont(QFont('Manrope',11,QFont.Weight.DemiBold));metrics=p.fontMetrics()
        title=movie_title(movie,getattr(self.parent(),'title_language','ru'))
        p.drawText(QRectF(text_left,r.top()+r.height()/2-24,right-text_left,24),Qt.AlignmentFlag.AlignLeft|Qt.AlignmentFlag.AlignVCenter,metrics.elidedText(title,Qt.TextElideMode.ElideRight,int(right-text_left)))
        p.setPen(QColor('#9faebe'));p.setFont(QFont('Manrope',9));p.drawText(QRectF(text_left,r.top()+r.height()/2+2,right-text_left,20),Qt.AlignmentFlag.AlignLeft|Qt.AlignmentFlag.AlignVCenter,meta_text(movie,getattr(self.parent(),'language','ru')))
        if movie.get('rating'):self.badge(p,QRectF(r.right()-46,r.center().y()-13,38,26),movie['rating'])
        p.restore()

class PosterGrid(QListWidget):
    bookmarkToggled=Signal(object)
    def __init__(self,origin,parent=None):
        super().__init__(parent);self.list_mode=False;self.language='ru';self._bookmark_press=None;self.posters=Posters(self,origin);self.setViewMode(QListView.ViewMode.IconMode);self.setResizeMode(QListView.ResizeMode.Adjust);self.setMovement(QListView.Movement.Static);self.setWrapping(True);self.setUniformItemSizes(True);self.setWordWrap(True);self.setMouseTracking(True);self.setSpacing(0);self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff);self.setItemDelegate(TileDelegate(self));self.setAccessibleName('Фильмы. Нажмите на постер для просмотра.');self.resize_tiles()
    def set_list_mode(self,on):
        on=bool(on)
        if on==self.list_mode:return
        self.list_mode=on
        if on:self.setViewMode(QListView.ViewMode.ListMode);self.setFlow(QListView.Flow.TopToBottom);self.setWrapping(False)
        else:self.setViewMode(QListView.ViewMode.IconMode);self.setFlow(QListView.Flow.LeftToRight);self.setWrapping(True)
        self.setMovement(QListView.Movement.Static);self.setResizeMode(QListView.ResizeMode.Adjust);self.resize_tiles();self.scrollToTop();self.viewport().update()
    def resize_tiles(self):
        w=max(1,self.viewport().width());h=max(1,self.viewport().height())
        if self.list_mode:
            self.setGridSize(QSize(max(1,w-1),96));return
        # Budget the entire cell (artwork + two title lines + metadata), not just width.
        # At least two *complete* rows at every supported window size.
        max_cell=max(80,min(226,int((h/2-78)/1.5)+18))
        cols=max(2,math.ceil(w/max_cell));cell=max(1,w//cols-1)
        self.setGridSize(QSize(cell,int((cell-18)*1.5)+78))
    def resizeEvent(self,event):
        super().resizeEvent(event);self.resize_tiles()
    def bookmark_hit(self,pos):
        item=self.itemAt(pos)
        if item is None or not bookmarkable(item.data(Qt.ItemDataRole.UserRole)):return None
        return item if bookmark_rect(self.visualItemRect(item),self.list_mode).adjusted(-3,-3,3,3).contains(QPointF(pos)) else None
    def mousePressEvent(self,event):
        # The ribbon toggles «Кинотека» and must not start playback of the card.
        item=self.bookmark_hit(event.position().toPoint()) if event.button()==Qt.MouseButton.LeftButton else None
        self._bookmark_press=item
        if item is not None:event.accept();return
        super().mousePressEvent(event)
    def mouseReleaseEvent(self,event):
        pressed,self._bookmark_press=self._bookmark_press,None
        if pressed is not None:
            if self.bookmark_hit(event.position().toPoint()) is pressed:self.bookmarkToggled.emit(pressed)
            event.accept();return
        super().mouseReleaseEvent(event)
    def mouseDoubleClickEvent(self,event):
        if self.bookmark_hit(event.position().toPoint()) is not None:event.accept();return
        super().mouseDoubleClickEvent(event)
