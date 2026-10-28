"""Tests must not read or overwrite the workstation user's preferences."""
import pytest
@pytest.fixture(autouse=True)
def isolated_preferences(tmp_path,monkeypatch):
    from PySide6.QtCore import QSettings
    from kinosota_player import preferences
    original=preferences.Preferences.__init__
    def init(self,settings=None):
        original(self,settings if settings is not None else QSettings(str(tmp_path/'isolated.ini'),QSettings.Format.IniFormat))
    monkeypatch.setattr(preferences.Preferences,'__init__',init)
