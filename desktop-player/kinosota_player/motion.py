"""Smooth scrolling: a mouse-wheel notch glides instead of jumping a whole row.

Touchpads and high-resolution wheels already send pixel deltas and scroll 1:1. A scroller
consumes the wheel only while it can still move, so a horizontal strip at its end hands the
wheel back to the page around it.
"""
from PySide6.QtCore import QAbstractAnimation, QEasingCurve, QEvent, QObject, QPropertyAnimation, Qt

STEP = 112        # Logical pixels per wheel notch (about three text lines).
DURATION = 240    # Glide length in milliseconds.


class SmoothScroll(QObject):
    """Event filter on a scroll area's viewport that animates its scroll bar."""

    def __init__(self, area, horizontal=False, step=STEP, duration=DURATION):
        super().__init__(area)
        self.area, self.horizontal, self.step = area, horizontal, step
        self.bar = area.horizontalScrollBar() if horizontal else area.verticalScrollBar()
        self.target = None
        self.animation = QPropertyAnimation(self.bar, b'value', self)
        self.animation.setDuration(duration)
        self.animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.animation.finished.connect(self.stop)
        self.bar.sliderPressed.connect(self.stop)
        self.bar.rangeChanged.connect(lambda *_: self.stop())
        area.viewport().installEventFilter(self)

    def stop(self):
        if self.animation.state() != QAbstractAnimation.State.Stopped:
            self.animation.stop()
        self.target = None

    def scroll_to(self, value, animated=True):
        value = max(self.bar.minimum(), min(self.bar.maximum(), int(round(value))))
        if not animated:
            self.stop()
            self.bar.setValue(value)
            return
        self.target = value
        self.animation.stop()
        self.animation.setStartValue(self.bar.value())
        self.animation.setEndValue(value)
        self.animation.start()

    def eventFilter(self, watched, event):
        if event.type() != QEvent.Type.Wheel or event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            return False
        angle, pixel = event.angleDelta(), event.pixelDelta()
        # A horizontal strip also turns the ordinary (vertical) wheel into sideways motion.
        notch = angle.y() if not self.horizontal or angle.y() else angle.x()
        pixels = pixel.y() if not self.horizontal or pixel.y() else pixel.x()
        if self.horizontal and not angle.y() and not angle.x():
            return False
        if not self.horizontal and not angle.y() and not pixel.y():
            return False  # Sideways tilt over a vertical page: leave it to Qt.
        base = self.target if self.target is not None else self.bar.value()
        precise = not pixel.isNull() and event.phase() != Qt.ScrollPhase.NoScrollPhase
        delta = -pixels if precise else -notch / 120 * self.step
        wanted = max(self.bar.minimum(), min(self.bar.maximum(), base + delta))
        if round(wanted) == self.bar.value() and self.target is None:
            return False  # Nothing to move here: let the event reach the page around us.
        if precise:
            self.stop()
            self.bar.setValue(int(round(wanted)))
        else:
            self.scroll_to(wanted)
        event.accept()
        return True


def smooth(area, horizontal=False, **options):
    """Attach (once) and return the smooth scroller of ``area``."""
    attached = getattr(area, '_smooth_scroll', None)
    if attached is None or attached.horizontal != horizontal:
        attached = SmoothScroll(area, horizontal, **options)
        area._smooth_scroll = attached
    return attached
