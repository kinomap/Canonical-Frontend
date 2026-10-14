"""Source-level split role checks, not fresh SSH/WG/TLS acceptance."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_public_build_never_copies_admin_sources():
    text=(ROOT/'Dockerfile.public-frontend').read_text()
    assert 'COPY frontend/' in text
    assert 'admin-frontend/' not in text and 'admin-builder' not in text
    assert '/usr/share/nginx/html/admin' not in text
    assert 'RUN npm ci\n' in text and 'npm install' not in text
    assert 'io.kinosota.role=public-frontend' in text

def test_admin_build_never_copies_public_sources():
    text=(ROOT/'Dockerfile.admin-frontend').read_text()
    assert 'COPY admin-frontend/' in text
    assert 'COPY frontend/' not in text and 'public-builder' not in text
    assert '/usr/share/nginx/html/public' not in text
    assert 'io.kinosota.role=private-admin' in text

def test_standalone_public_image_is_fail_closed():
    text=(ROOT/'nginx.public-only.conf').read_text()
    for path in ('/admin/','/api/','/media/','/stream/'):
        assert 'location ^~ '+path+' { return 403; }' in text
    assert 'proxy_pass' not in text
    assert 'try_files $uri =404;' in text

def test_build_context_excludes_credentials_and_host_dependencies():
    text=(ROOT/'.dockerignore').read_text()
    for pattern in ('**/node_modules','**/.env','**/.env.*','**/*.session','**/*.pem','**/*.key'):
        assert pattern in text

def test_private_admin_image_has_no_backend_direct_proxy():
    text=(ROOT/'nginx.admin-only.conf').read_text()
    assert 'proxy_pass' not in text and '8000' not in text and '5432' not in text
    assert 'location / { return 404; }' in text
