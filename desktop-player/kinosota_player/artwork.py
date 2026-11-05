"""Rounded artwork for the title page and search suggestions (posters, cast photos)."""
from PySide6.QtCore import QObject, QRectF, Qt
from PySide6.QtGui import QColor, QLinearGradient, QPainter, QPainterPath, QPixmap


class Sink(QObject):
    """Stands in for a list view: ``Posters`` repaints ``view.viewport()`` after each download."""

    def __init__(self, parent, callback):
        super().__init__(parent)
        self.callback = callback

    def viewport(self):
        return self

    def update(self):
        self.callback()


def rounded(source, width, height, radius, ratio=2.0):
    """Cover-fit ``source`` into a rounded rectangle; a dark gradient while it is missing."""
    target = QPixmap(max(1, int(width * ratio)), max(1, int(height * ratio)))
    target.fill(Qt.GlobalColor.transparent)
    painter = QPainter(target)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
    path = QPainterPath()
    path.addRoundedRect(QRectF(0, 0, target.width(), target.height()), radius * ratio, radius * ratio)
    painter.setClipPath(path)
    if source is not None and not source.isNull():
        scaled = source.scaled(target.size(), Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                               Qt.TransformationMode.SmoothTransformation)
        painter.drawPixmap((target.width() - scaled.width()) // 2, (target.height() - scaled.height()) // 2, scaled)
    else:
        shade = QLinearGradient(0, 0, 0, target.height())
        shade.setColorAt(0, QColor('#1b2229'))
        shade.setColorAt(1, QColor('#0f1418'))
        painter.fillPath(path, shade)
    painter.end()
    target.setDevicePixelRatio(ratio)
    return target
