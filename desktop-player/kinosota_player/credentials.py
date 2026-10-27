"""Use only an OS credential vault; never a plaintext fallback."""
SERVICE='com.kinosota.player'
ACCOUNT='session'
class SessionVault:
    def __init__(self,backend=None):
        try:
            if backend is None:
                import keyring
                backend=keyring.get_keyring()
            # SecretService, Keychain, Windows vault only. Deny arbitrary/plaintext plugins.
            module=type(backend).__module__
            self.backend=backend if module.startswith(('keyring.backends.SecretService','keyring.backends.macOS','keyring.backends.Windows')) else None
        except Exception:self.backend=None
    def load(self):
        try:return self.backend.get_password(SERVICE,ACCOUNT) or '' if self.backend else ''
        except Exception:return ''
    def save(self,token):
        if not self.backend:return False
        try:self.backend.set_password(SERVICE,ACCOUNT,token);return True
        except Exception:return False
    def clear(self):
        if not self.backend:return
        try:self.backend.delete_password(SERVICE,ACCOUNT)
        except Exception:pass
