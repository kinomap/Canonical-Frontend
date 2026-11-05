"""0.1.9: smooth wheel scrolling and the sticky poster column of the title page."""
import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
from PySide6.QtCore import QPoint, QPointF, QSize, Qt
from PySide6.QtGui import QWheelEvent
from PySide6.QtWidgets import QApplication, QScrollArea, QWidget
from kinosota_player.motion import STEP, smooth
from kinosota_player.title_widgets import StickyColumn


def app():
    return QApplication.instance() or QApplication([])


def area(width, height, content):
    app()
    scroll = QScrollArea()
    scroll.setWidgetResizable(False)
    inner = QWidget()
    inner.resize(*content)
    scroll.setWidget(inner)
    scroll.resize(width, height)
    scroll.show()
    app().processEvents()
    return scroll


def wheel(angle=(0, 0), pixel=(0, 0), phase=Qt.ScrollPhase.NoScrollPhase, modifiers=Qt.KeyboardModifier.NoModifier):
    return QWheelEvent(QPointF(10, 10), QPointF(10, 10), QPoint(*pixel), QPoint(*angle), Qt.MouseButton.NoButton,
                       modifiers, phase, False)


def test_a_wheel_notch_glides_instead_of_jumping_and_the_end_hands_the_wheel_on():
    scroll = area(300, 200, (280, 2000))
    glide = smooth(scroll)
    assert smooth(scroll) is glide  # One scroller per area.
    bar = scroll.verticalScrollBar()
    assert glide.eventFilter(scroll.viewport(), wheel(angle=(0, -120)))
    assert glide.target == STEP == 112 and bar.value() < STEP  # Still gliding.
    assert glide.eventFilter(scroll.viewport(), wheel(angle=(0, -120)))
    assert glide.target == 2 * STEP  # A second notch extends the glide from its target.
    glide.animation.setCurrentTime(glide.animation.duration())
    assert bar.value() == 2 * STEP and glide.target is None
    # Touchpads send pixels: they move 1:1 at once.
    assert glide.eventFilter(scroll.viewport(), wheel(angle=(0, -24), pixel=(0, -30), phase=Qt.ScrollPhase.ScrollUpdate))
    assert bar.value() == 2 * STEP + 30
    # Ctrl + wheel and the end of the range are left to Qt and the page around.
    assert not glide.eventFilter(scroll.viewport(), wheel(angle=(0, -120), modifiers=Qt.KeyboardModifier.ControlModifier))
    glide.scroll_to(bar.maximum(), animated=False)
    assert bar.value() == bar.maximum() and not glide.eventFilter(scroll.viewport(), wheel(angle=(0, -120)))
    glide.scroll_to(-50, animated=False)
    assert bar.value() == 0 and not glide.eventFilter(scroll.viewport(), wheel(angle=(0, 120)))
    scroll.close()


def test_a_horizontal_strip_turns_the_wheel_sideways_until_its_end():
    strip = area(300, 120, (1200, 100))
    glide = smooth(strip, horizontal=True)
    bar = strip.horizontalScrollBar()
    assert glide.eventFilter(strip.viewport(), wheel(angle=(0, -120))) and glide.target == STEP
    glide.scroll_to(bar.maximum(), animated=False)
    assert not glide.eventFilter(strip.viewport(), wheel(angle=(0, -120)))  # The page scrolls on.
    assert glide.eventFilter(strip.viewport(), wheel(angle=(120, 0)))  # A tilt wheel moves it back.
    assert glide.target == bar.maximum() - STEP
    strip.close()


class Box(QWidget):
    def sizeHint(self):
        return QSize(100, 120)


def test_sticky_column_follows_the_viewport_inside_its_row():
    app()
    page = QWidget()
    page.resize(200, 600)
    column = StickyColumn(Box(), page)
    column.setGeometry(0, 50, 100, 400)
    assert column.sizeHint() == QSize(100, 120)
    column.stick(0, 40)  # The row starts below the top bar: nothing to do.
    assert column.offset == 0 and column.content.geometry().y() == 0
    column.stick(200, 40)  # Scrolled into the row: the poster stays 40 px under the viewport top.
    assert column.offset == 190 and column.content.geometry().y() == 190
    column.stick(900, 40)  # Past the row: it stops at the bottom of its cell.
    assert column.offset == 280 and column.content.geometry().getRect() == (0, 280, 100, 120)
