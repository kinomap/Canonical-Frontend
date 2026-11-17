"""Minimal ctypes binding for libmpv's client and OpenGL render API.

Only what the in-window cinema surface needs: options, commands, properties,
events and an OpenGL render context that draws into a caller-owned FBO.
The library is loaded lazily; ``load()`` raises ``LibmpvUnavailable`` when no
usable libmpv is installed so callers can fall back to the external mpv window.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import locale
import os
import sys
import threading
from ctypes import (POINTER, CFUNCTYPE, Structure, Union, byref, c_char_p, c_double, c_int, c_int64, c_uint64,
                    c_void_p, cast, pointer)
from pathlib import Path

# mpv_format
FORMAT_NONE, FORMAT_STRING, FORMAT_OSD_STRING, FORMAT_FLAG, FORMAT_INT64, FORMAT_DOUBLE = 0, 1, 2, 3, 4, 5
FORMAT_NODE, FORMAT_NODE_ARRAY, FORMAT_NODE_MAP, FORMAT_BYTE_ARRAY = 6, 7, 8, 9
# mpv_event_id
EVENT_NONE, EVENT_SHUTDOWN, EVENT_LOG_MESSAGE = 0, 1, 2
EVENT_START_FILE, EVENT_END_FILE, EVENT_FILE_LOADED = 6, 7, 8
EVENT_CLIENT_MESSAGE = 16  # script-message from a Lua script (the OSC's right-click track menus).
EVENT_VIDEO_RECONFIG, EVENT_AUDIO_RECONFIG = 17, 18
EVENT_PLAYBACK_RESTART, EVENT_PROPERTY_CHANGE = 21, 22
# mpv_end_file_reason
END_EOF, END_STOP, END_QUIT, END_ERROR, END_REDIRECT = 0, 2, 3, 4, 5
# mpv_render_param_type
RENDER_INVALID, RENDER_API_TYPE, RENDER_OPENGL_INIT_PARAMS, RENDER_OPENGL_FBO, RENDER_FLIP_Y = 0, 1, 2, 3, 4
RENDER_BLOCK_FOR_TARGET_TIME = 12
RENDER_UPDATE_FRAME = 1
# Render API (mpv_render_context_*) exists since client API 1.28 (mpv 0.28).
MIN_CLIENT_API = (1 << 16) | 28


class LibmpvUnavailable(RuntimeError):
    """No loadable libmpv with the render API was found."""


class MpvError(RuntimeError):
    def __init__(self, what, code):
        super().__init__(f'{what}: {error_string(code)}')
        self.code = code


class mpv_byte_array(Structure):
    _fields_ = [('data', c_void_p), ('size', ctypes.c_size_t)]


class mpv_node(Structure):
    pass


class mpv_node_list(Structure):
    _fields_ = [('num', c_int), ('values', POINTER(mpv_node)), ('keys', POINTER(c_char_p))]


class _node_union(Union):
    _fields_ = [('string', c_char_p), ('flag', c_int), ('int64', c_int64), ('double_', c_double),
                ('list', POINTER(mpv_node_list)), ('ba', POINTER(mpv_byte_array))]


mpv_node._fields_ = [('u', _node_union), ('format', c_int)]


class mpv_event(Structure):
    _fields_ = [('event_id', c_int), ('error', c_int), ('reply_userdata', c_uint64), ('data', c_void_p)]


class mpv_event_property(Structure):
    _fields_ = [('name', c_char_p), ('format', c_int), ('data', c_void_p)]


class mpv_event_end_file(Structure):
    _fields_ = [('reason', c_int), ('error', c_int)]  # Later fields are not needed and vary by API version.


class mpv_event_client_message(Structure):
    _fields_ = [('num_args', c_int), ('args', POINTER(c_char_p))]


class mpv_render_param(Structure):
    _fields_ = [('type', c_int), ('data', c_void_p)]


GET_PROC_ADDRESS = CFUNCTYPE(c_void_p, c_void_p, c_char_p)


class mpv_opengl_init_params(Structure):
    _fields_ = [('get_proc_address', GET_PROC_ADDRESS), ('get_proc_address_ctx', c_void_p), ('extra_exts', c_char_p)]


class mpv_opengl_fbo(Structure):
    _fields_ = [('fbo', c_int), ('w', c_int), ('h', c_int), ('internal_format', c_int)]


CALLBACK = CFUNCTYPE(None, c_void_p)

_lock = threading.Lock()
_lib = None
_load_error: str | None = None


def _library_names():
    if sys.platform.startswith('win'):
        return ['libmpv-2.dll', 'mpv-2.dll', 'mpv-1.dll']
    if sys.platform == 'darwin':
        return ['libmpv.2.dylib', 'libmpv.dylib']
    return ['libmpv.so.2', 'libmpv.so.1']


def candidates():
    """KINOSOTA_LIBMPV override -> bundled copy -> the system loader -> find_library."""
    override = os.environ.get('KINOSOTA_LIBMPV')
    if override:
        yield override
    root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
    for name in _library_names():
        for folder in (root / 'mpv', root / 'mpv' / 'lib'):  # Windows DLL inventory / macOS dylibbundler layout.
            bundled = folder / name
            if bundled.is_file():
                yield str(bundled)
    yield from _library_names()
    found = ctypes.util.find_library('mpv')
    if found:
        yield found


def _declare(lib):
    lib.mpv_client_api_version.restype = ctypes.c_ulong
    lib.mpv_error_string.argtypes = [c_int]
    lib.mpv_error_string.restype = c_char_p
    lib.mpv_create.restype = c_void_p
    lib.mpv_initialize.argtypes = [c_void_p]
    lib.mpv_terminate_destroy.argtypes = [c_void_p]
    lib.mpv_set_option_string.argtypes = [c_void_p, c_char_p, c_char_p]
    lib.mpv_command.argtypes = [c_void_p, POINTER(c_char_p)]
    lib.mpv_set_property_string.argtypes = [c_void_p, c_char_p, c_char_p]
    lib.mpv_get_property_string.argtypes = [c_void_p, c_char_p]
    lib.mpv_get_property_string.restype = c_void_p
    lib.mpv_get_property.argtypes = [c_void_p, c_char_p, c_int, c_void_p]
    lib.mpv_observe_property.argtypes = [c_void_p, c_uint64, c_char_p, c_int]
    lib.mpv_free.argtypes = [c_void_p]
    lib.mpv_free_node_contents.argtypes = [POINTER(mpv_node)]
    lib.mpv_wait_event.argtypes = [c_void_p, c_double]
    lib.mpv_wait_event.restype = POINTER(mpv_event)
    lib.mpv_set_wakeup_callback.argtypes = [c_void_p, CALLBACK, c_void_p]
    lib.mpv_render_context_create.argtypes = [POINTER(c_void_p), c_void_p, POINTER(mpv_render_param)]
    lib.mpv_render_context_render.argtypes = [c_void_p, POINTER(mpv_render_param)]
    lib.mpv_render_context_set_update_callback.argtypes = [c_void_p, CALLBACK, c_void_p]
    lib.mpv_render_context_update.argtypes = [c_void_p]
    lib.mpv_render_context_update.restype = c_uint64
    lib.mpv_render_context_report_swap.argtypes = [c_void_p]
    lib.mpv_render_context_free.argtypes = [c_void_p]


def load():
    """Load libmpv once; raise LibmpvUnavailable with every attempted path when none works."""
    global _lib, _load_error
    with _lock:
        if _lib is not None:
            return _lib
        errors = []
        for name in candidates():
            try:
                lib = ctypes.CDLL(name)
                _declare(lib)
            except (OSError, AttributeError) as error:
                errors.append(f'{name}: {error}')
                continue
            version = lib.mpv_client_api_version()
            if version < MIN_CLIENT_API:
                errors.append(f'{name}: client API {version >> 16}.{version & 0xffff} has no render API')
                continue
            _lib, _load_error = lib, None
            return lib
        _load_error = '; '.join(errors) or 'libmpv not found'
        raise LibmpvUnavailable(_load_error)


def load_error():
    """None when libmpv loads, otherwise the reason (also tries to load)."""
    try:
        load()
    except LibmpvUnavailable as error:
        return str(error)
    return None


def error_string(code):
    try:
        return (load().mpv_error_string(int(code)) or b'').decode('utf-8', 'replace') or str(code)
    except LibmpvUnavailable:
        return str(code)


def _text(value):
    if isinstance(value, bool):
        return 'yes' if value else 'no'
    return str(value)


def node_value(node):
    """mpv_node -> Python (str, bool, int, float, list, dict, bytes or None)."""
    fmt = node.format
    if fmt == FORMAT_STRING or fmt == FORMAT_OSD_STRING:
        return (node.u.string or b'').decode('utf-8', 'replace')
    if fmt == FORMAT_FLAG:
        return bool(node.u.flag)
    if fmt == FORMAT_INT64:
        return int(node.u.int64)
    if fmt == FORMAT_DOUBLE:
        return float(node.u.double_)
    if fmt == FORMAT_NODE_ARRAY:
        items = node.u.list.contents
        return [node_value(items.values[i]) for i in range(items.num)]
    if fmt == FORMAT_NODE_MAP:
        items = node.u.list.contents
        return {items.keys[i].decode('utf-8', 'replace'): node_value(items.values[i]) for i in range(items.num)}
    if fmt == FORMAT_BYTE_ARRAY:
        array = node.u.ba.contents
        return ctypes.string_at(array.data, array.size)
    return None


class Event:
    __slots__ = ('id', 'error', 'name', 'value', 'reason', 'args')

    def __init__(self, event_id, error=0, name=None, value=None, reason=None, args=None):
        self.id, self.error, self.name, self.value, self.reason = event_id, error, name, value, reason
        self.args = list(args) if args else []

    def __repr__(self):
        return (f'Event(id={self.id}, name={self.name!r}, value={self.value!r}, reason={self.reason}, '
                f'args={self.args!r})')


def client_message_args(data):
    """mpv_event_client_message* -> its string arguments (``script-message a b`` -> ['a', 'b'])."""
    if not data:
        return []
    message = cast(data, POINTER(mpv_event_client_message)).contents
    if message.num_args <= 0 or not message.args:
        return []
    return [(message.args[i] or b'').decode('utf-8', 'replace') for i in range(message.num_args)]


class Mpv:
    """One mpv core. Thread-safe like the C API; render calls need the owning GL context to be current."""

    def __init__(self, options=()):
        self.lib = load()
        # mpv refuses to start under a non-C LC_NUMERIC (QApplication applies the user locale).
        locale.setlocale(locale.LC_NUMERIC, 'C')
        self.handle = self.lib.mpv_create()
        if not self.handle:
            raise MpvError('mpv_create', -1)
        self.rejected = []
        for name, value in options:
            code = self.lib.mpv_set_option_string(self.handle, name.encode(), _text(value).encode())
            if code < 0:
                self.rejected.append(name)  # Options differ between mpv releases; an unknown one is not fatal.
        code = self.lib.mpv_initialize(self.handle)
        if code < 0:
            self.lib.mpv_terminate_destroy(self.handle)
            self.handle = None
            raise MpvError('mpv_initialize', code)
        self.render_context = c_void_p()
        self._callbacks = []
        self._update_callback = None
        self._wakeup_callback = None

    @property
    def alive(self):
        return bool(self.handle)

    # Commands and properties --------------------------------------------------------------------------------
    def command(self, *args):
        if not self.handle:
            raise MpvError('command', -12)
        values = [_text(a).encode() for a in args]
        array = (c_char_p * (len(values) + 1))(*values, None)
        code = self.lib.mpv_command(self.handle, array)
        if code < 0:
            raise MpvError(str(args[0]) if args else 'command', code)
        return code

    def set(self, name, value):
        if not self.handle:
            raise MpvError(name, -12)
        code = self.lib.mpv_set_property_string(self.handle, name.encode(), _text(value).encode())
        if code < 0:
            raise MpvError(name, code)

    def try_set(self, name, value):
        try:
            self.set(name, value)
            return True
        except MpvError:
            return False

    def get_string(self, name):
        if not self.handle:
            return None
        raw = self.lib.mpv_get_property_string(self.handle, name.encode())
        if not raw:
            return None
        try:
            return ctypes.string_at(raw).decode('utf-8', 'replace')
        finally:
            self.lib.mpv_free(raw)

    def get(self, name):
        """Typed property value, or None while it is unavailable."""
        if not self.handle:
            return None
        node = mpv_node()
        if self.lib.mpv_get_property(self.handle, name.encode(), FORMAT_NODE, byref(node)) < 0:
            return None
        try:
            return node_value(node)
        finally:
            self.lib.mpv_free_node_contents(byref(node))

    def observe(self, name, reply=0):
        if self.handle:
            self.lib.mpv_observe_property(self.handle, reply, name.encode(), FORMAT_NODE)

    # Events -------------------------------------------------------------------------------------------------
    def set_wakeup_callback(self, fn):
        """fn() runs on an mpv thread: only post to the UI thread from it."""
        self._wakeup_callback = CALLBACK(lambda _data: fn())
        self.lib.mpv_set_wakeup_callback(self.handle, self._wakeup_callback, None)

    def wait_event(self, timeout=0.0):
        if not self.handle:
            return None
        event = self.lib.mpv_wait_event(self.handle, timeout).contents
        if event.event_id == EVENT_NONE:
            return None
        if event.event_id == EVENT_PROPERTY_CHANGE and event.data:
            prop = cast(event.data, POINTER(mpv_event_property)).contents
            value = None
            if prop.format == FORMAT_NODE and prop.data:
                value = node_value(cast(prop.data, POINTER(mpv_node)).contents)
            return Event(event.event_id, event.error, (prop.name or b'').decode(), value)
        if event.event_id == EVENT_END_FILE and event.data:
            end = cast(event.data, POINTER(mpv_event_end_file)).contents
            return Event(event.event_id, end.error, reason=end.reason)
        if event.event_id == EVENT_CLIENT_MESSAGE:
            return Event(event.event_id, event.error, args=client_message_args(event.data))
        return Event(event.event_id, event.error)

    # Render API ---------------------------------------------------------------------------------------------
    def create_render_context(self, get_proc_address):
        """get_proc_address(name: bytes) -> int | None, called while the GL context is current."""
        if self.render_context:
            return

        def resolve(_ctx, name):
            try:
                return get_proc_address(name) or None
            except Exception:
                return None

        proc = GET_PROC_ADDRESS(resolve)
        init = mpv_opengl_init_params(proc, None, None)
        api = c_char_p(b'opengl')
        params = (mpv_render_param * 3)(mpv_render_param(RENDER_API_TYPE, cast(api, c_void_p)),
                                        mpv_render_param(RENDER_OPENGL_INIT_PARAMS, cast(pointer(init), c_void_p)),
                                        mpv_render_param(RENDER_INVALID, None))
        context = c_void_p()
        code = self.lib.mpv_render_context_create(byref(context), self.handle, params)
        if code < 0:
            raise MpvError('mpv_render_context_create', code)
        self.render_context = context
        self._callbacks = [proc, init, api]
        if self._update_callback is not None:
            self.lib.mpv_render_context_set_update_callback(self.render_context, self._update_callback, None)

    def set_update_callback(self, fn):
        """fn() runs on an mpv thread whenever a new frame should be rendered."""
        self._update_callback = CALLBACK(lambda _data: fn())
        if self.render_context:
            self.lib.mpv_render_context_set_update_callback(self.render_context, self._update_callback, None)

    def update_flags(self):
        return int(self.lib.mpv_render_context_update(self.render_context)) if self.render_context else 0

    def render(self, fbo, width, height, *, flip=True):
        if not self.render_context:
            return
        target = mpv_opengl_fbo(int(fbo), int(width), int(height), 0)
        flip_y = c_int(1 if flip else 0)
        block = c_int(0)  # Several players share one paintGL: never wait for a frame's display time.
        params = (mpv_render_param * 4)(mpv_render_param(RENDER_OPENGL_FBO, cast(pointer(target), c_void_p)),
                                        mpv_render_param(RENDER_FLIP_Y, cast(pointer(flip_y), c_void_p)),
                                        mpv_render_param(RENDER_BLOCK_FOR_TARGET_TIME, cast(pointer(block), c_void_p)),
                                        mpv_render_param(RENDER_INVALID, None))
        self.lib.mpv_render_context_render(self.render_context, params)

    def report_swap(self):
        if self.render_context:
            self.lib.mpv_render_context_report_swap(self.render_context)

    def free_render_context(self):
        """Needs the GL context that created it to be current."""
        if self.render_context:
            self.lib.mpv_render_context_free(self.render_context)
            self.render_context = c_void_p()

    def terminate(self):
        handle, self.handle = self.handle, None
        if handle:
            self.free_render_context()
            self.lib.mpv_terminate_destroy(handle)


def probe():
    """Create and destroy one core without video output (packaged-app smoke test)."""
    player = Mpv([('vo', 'null'), ('ao', 'null'), ('terminal', 'no'), ('config', 'no'), ('idle', 'yes')])
    try:
        return player.get('mpv-version') or 'mpv'
    finally:
        player.terminate()
