"""Real upload -> SQLite queue -> Demucs -> authorized download, isolated from user data."""
from pathlib import Path
import tempfile
import time
from unittest.mock import patch

from fastapi.testclient import TestClient
import server


def main():
    original_data = server.DATA
    with tempfile.TemporaryDirectory(prefix='web-pipeline-', dir=original_data) as directory:
        data = Path(directory)
        (data/'models').symlink_to(original_data/'models', target_is_directory=True)
        with patch.object(server, 'DATA', data), patch.object(server.cloud_publish, 'configured', return_value=False):
            server.app.dependency_overrides[server.principal] = lambda: {
                'sub':'test-admin', 'email':'admin@genesaret.com', 'email_verified':True}
            try:
                with TestClient(server.app) as client:
                    with server.connect() as db:
                        db.execute("INSERT INTO audio_administrators VALUES ('test-admin','integration test')")
                    content = (original_data/'inputs/synthetic.wav').read_bytes()
                    response = client.post('/songs/pipeline-song/audio', content=content,
                        headers={'Origin':server.ORIGINS[0], 'Content-Type':'audio/wav'})
                    assert response.status_code == 202, response.text
                    deadline = time.monotonic()+60
                    while time.monotonic() < deadline:
                        state = client.get('/songs/pipeline-song').json()
                        if state['state'] in ('listo','error'):
                            break
                        time.sleep(0.2)
                    assert state['state']=='listo', state
                    server.app.dependency_overrides[server.principal] = lambda: {'sub':'member','email':'member@example.com'}
                    for stem in server.STEMS:
                        response = client.get('/songs/pipeline-song/stems/'+stem, params={'version':state['version']})
                        assert response.status_code == 200, response.text
                        assert response.content[:4] == b'RIFF'
                        assert response.headers['cache-control'] == 'no-store'
                    assert client.post('/songs/pipeline-song/audio', content=content,
                        headers={'Origin':server.ORIGINS[0], 'Content-Type':'audio/wav'}).status_code == 403
                    assert not list(data.glob('processing-*'))
                print('PASS: carga HTTP real, cola persistente, Demucs real, seis descargas autorizadas y rechazo de escritura a integrante; identidad simulada')
            finally:
                server.app.dependency_overrides.clear()


if __name__ == '__main__':
    main()
