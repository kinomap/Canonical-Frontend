"""Poster grid: native keyboard navigation, bounded anonymous artwork requests."""
from collections import OrderedDict
import math
from .preferences import movie_title
from urllib.parse import urljoin, urlsplit
from PySide6.QtCore import Qt, QSize, QRectF, QPointF, QUrl
from PySide6.QtGui import QColor, QFont, QPainter, QPainterPath, QPen, QPixmap, QLinearGradient, QPolygonF
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest, QNetworkReply
from PySide6.QtWidgets import QListWidget, QListView, QStyledItemDelegate, QStyle

class Posters:
    def __init__(self, view, origin):
        self.view=view;self.origin=origin;self.cache=OrderedDict();self.pending={}
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
            if not image.isNull():image=image.scaled(440,660,Qt.AspectRatioMode.KeepAspectRatio,Qt.TransformationMode.SmoothTransformation)
            self.cache[u]=image
            while len(self.cache)>128:self.cache.popitem(last=False)
            reply.deleteLater();self.view.viewport().update()
        reply.finished.connect(finish)
    def clear(self):
        for r in list(self.pending.values()):r.abort()
        self.cache.clear()

class TileDelegate(QStyledItemDelegate):
    def sizeHint(self,option,index):
        # Text-based native hints vary by Qt/OS and collapse short-title posters.
        return self.parent().gridSize()
    def paint(self,p,option,index):
        movie=index.data(Qt.ItemDataRole.UserRole) or {};r=QRectF(option.rect).adjusted(9,8,-9,-8)
        width=r.width();poster=QRectF(r.left(),r.top(),width,width*1.5)
        selected=bool(option.state & (QStyle.StateFlag.State_Selected|QStyle.StateFlag.State_MouseOver|QStyle.StateFlag.State_HasFocus))
        p.save();p.setRenderHint(QPainter.RenderHint.Antialiasing)
        clip=QPainterPath();clip.addRoundedRect(poster,10,10);p.setClipPath(clip)
        image=self.parent().posters.get(movie.get('poster') or movie.get('poster_url'))
        if image and not image.isNull():
            scaled=image.scaled(int(poster.width()),int(poster.height()),Qt.AspectRatioMode.KeepAspectRatioByExpanding,Qt.TransformationMode.SmoothTransformation)
            x=(scaled.width()-poster.width())/2;y=(scaled.height()-poster.height())/2
            p.drawPixmap(poster,scaled,QRectF(x,y,poster.width(),poster.height()))
        else:
            gradient=QLinearGradient(poster.topLeft(),poster.bottomRight());gradient.setColorAt(0,QColor('#262344'));gradient.setColorAt(.55,QColor('#101c2a'));gradient.setColorAt(1,QColor('#080e12'));p.fillRect(poster,gradient)
            p.setPen(QColor('#aab4c7'));p.setFont(QFont('Manrope',10));p.drawText(poster.adjusted(16,24,-16,-24),Qt.AlignmentFlag.AlignTop|Qt.AlignmentFlag.AlignHCenter,'K I N O S O T A')
            p.setPen(QColor('#f4f5f7'));p.setFont(QFont('Manrope',15,QFont.Weight.Bold));p.drawText(poster.adjusted(18,62,-18,-32),Qt.AlignmentFlag.AlignCenter|Qt.TextFlag.TextWordWrap,movie_title(movie,getattr(self.parent(),'title_language','ru')))
        if selected:
            p.fillRect(poster,QColor(0,0,0,75));c=poster.center();p.setPen(QPen(QColor('#ffcc32'),1));p.setBrush(QColor('#090e12'));p.drawEllipse(c,27,27)
            p.setPen(Qt.PenStyle.NoPen);p.setBrush(QColor('#ffffff'));p.drawPolygon(QPolygonF([QPointF(c.x()-6,c.y()-10),QPointF(c.x()-6,c.y()+10),QPointF(c.x()+12,c.y())]))
        rating=movie.get('rating')
        if rating:
            badge=QRectF(poster.right()-46,poster.top()+8,38,26);p.setPen(QPen(QColor('#806624'),1));p.setBrush(QColor('#10151e'));p.drawRoundedRect(badge,6,6);p.setPen(QColor('#ffdc6c'));p.setFont(QFont('Manrope',10,QFont.Weight.Bold));p.drawText(badge,Qt.AlignmentFlag.AlignCenter,f'{float(rating):.1f}')
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
        p.setPen(QColor('#9faebe'));p.setFont(QFont('Manrope',8));meta=' · '.join(str(movie.get(k)) for k in ('year','quality') if movie.get(k));p.drawText(QRectF(r.left(),poster.bottom()+41,width,17),Qt.AlignmentFlag.AlignLeft|Qt.AlignmentFlag.AlignVCenter,meta);p.restore()

class PosterGrid(QListWidget):
    def __init__(self,origin,parent=None):
        super().__init__(parent);self.posters=Posters(self,origin);self.setViewMode(QListView.ViewMode.IconMode);self.setResizeMode(QListView.ResizeMode.Adjust);self.setMovement(QListView.Movement.Static);self.setWrapping(True);self.setUniformItemSizes(True);self.setWordWrap(True);self.setMouseTracking(True);self.setSpacing(0);self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff);self.setItemDelegate(TileDelegate(self));self.setAccessibleName('Фильмы. Нажмите на постер для просмотра.');self.resize_tiles()
    def resize_tiles(self):
        w=max(1,self.viewport().width());h=max(1,self.viewport().height())
        # Budget the entire cell (artwork + two title lines + metadata), not just width.
        # At least two *complete* rows at every supported window size.
        max_cell=max(80,min(226,int((h/2-78)/1.5)+18))
        cols=max(2,math.ceil(w/max_cell));cell=max(1,w//cols-1)
        self.setGridSize(QSize(cell,int((cell-18)*1.5)+78))
    def resizeEvent(self,event):
        super().resizeEvent(event);self.resize_tiles()
