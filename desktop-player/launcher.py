import sys

from kinosota_player.hidpi import configure_high_dpi

# 0.2.3: strictly before any QApplication: the exact fractional scale factor keeps lines and posters crisp.
configure_high_dpi()


def _fast_direct_launch():
    """Fast-Path for kinosota://watch?... links without importing heavy catalogue modules."""
    flags = {'--version', '--uninstall', '--smoke-test', '--playback-smoke-fixture', '--cinema-smoke-test'}
    if any(arg in flags for arg in sys.argv[1:]):
        return None
    if not any(isinstance(arg, str) and arg.lower().startswith('kinosota://') for arg in sys.argv[1:]):
        return None

    from PySide6.QtWidgets import QApplication
    from kinosota_player.deeplink import Instance, LinkEvents, find_link, forward, parse_launch
    from kinosota_player.direct import DirectPlayer

    link = find_link(sys.argv)
    if not link or not parse_launch(link):
        return None
    app = QApplication(sys.argv)
    app.setApplicationName('KINOSOTA Player')
    app.setOrganizationName('KINOSOTA')
    app.setDesktopFileName('kinosota-player')
    if forward(link):
        return 0
    instance = Instance(app)
    instance.listen()
    app.aboutToQuit.connect(instance.close)  # 0.2.4: free the single-instance socket at quit, not at reaping.
    app.setQuitOnLastWindowClosed(False)
    direct = DirectPlayer()

    def open_fallback(meta):
        from kinosota_player.app import Window
        direct.retire()
        app.setQuitOnLastWindowClosed(True)
        window = Window(restore=True)
        window.updater.quitRequested.connect(instance.close)  # 0.2.4: the post-update restart needs the socket.
        window.show()
        window.launch_opened(meta)

    direct.fallback.connect(open_fallback)
    direct.finished.connect(app.exit)
    app.aboutToQuit.connect(direct.shutdown)
    instance.linkReceived.connect(direct.open_link)
    app.installEventFilter(LinkEvents(direct.open_link, app))
    direct.open_link(link)
    return app.exec()


fast_code = _fast_direct_launch()
if fast_code is not None:
    raise SystemExit(fast_code)

from kinosota_player.app import main
raise SystemExit(main())

