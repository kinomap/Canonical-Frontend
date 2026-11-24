"""Crisp rendering on fractional display scaling (125 %, 150 %, 175 %), 0.2.3.

Qt may round the scale factor to a whole number and resample the whole window, which blurs vector
lines and turns rounded corners into steps. PassThrough keeps the exact factor, so text, lines and
``devicePixelRatioF()``-sized posters land on physical pixels. Must run before the QApplication
exists; later calls are ignored (Qt only reads it at start-up).
"""
from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication

POLICY = Qt.HighDpiScaleFactorRoundingPolicy.PassThrough


def configure_high_dpi():
    """Return True when the policy was applied (no application object existed yet)."""
    if QGuiApplication.instance() is not None:
        return False
    QGuiApplication.setHighDpiScaleFactorRoundingPolicy(POLICY)
    return True
