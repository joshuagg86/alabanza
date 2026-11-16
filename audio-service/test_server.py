"""API authorization, upload isolation and durable queue tests; no real Firebase users."""
from pathlib import Path
import tempfile
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from google.auth import crypt, jwt
import server


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.data = patch.object(server, "DATA", Path(self.folder.name))
        self.data.start()
        server.initialize()
        self.client = TestClient(server.app)
        self.headers = {"Origin": server.ORIGINS[0], "Content-Type": "audio/mpeg"}

    def tearDown(self):
        self.client.close()
        server.app.dependency_overrides.clear()
        self.data.stop()
        self.folder.cleanup()

    def login(self, admin=False, verified=True):
        if admin:
            with server.connect() as db:
                db.execute("INSERT OR IGNORE INTO audio_administrators VALUES ('member-uid','test admin')")
        server.app.dependency_overrides[server.principal] = lambda: {
            "sub": "member-uid", "email": "admin@genesaret.com" if admin else "member@example.com",
            "email_verified": verified}

    def test_no_token_is_rejected(self):
        self.assertEqual(self.client.get('/songs/song').status_code, 401)
        self.assertEqual(self.client.get('/songs/song/stems/vocals?version=fake').status_code, 401)

    def test_forged_token_is_not_decoded_without_signature(self):
        with patch.object(server, 'verify_firebase_token', side_effect=ValueError('Invalid signature')):
            self.assertEqual(self.client.get('/songs/song', headers={"Authorization": "Bearer forged"}).status_code, 401)

    def test_real_signature_expiry_audience_and_tampering(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'local-test')])
        now = datetime.now(timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
                .public_key(key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(days=1))
                .sign(key, hashes.SHA256()).public_bytes(serialization.Encoding.PEM).decode())
        signer = crypt.RSASigner.from_string(key.private_bytes(serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8, serialization.NoEncryption()), key_id='test-key')
        claims = {'sub':'signed-uid', 'iss':'https://securetoken.google.com/'+server.PROJECT,
                  'aud':server.PROJECT, 'iat':int(time.time()), 'exp':int(time.time())+300}
        import json
        response = SimpleNamespace(status=200, data=json.dumps({'test-key':cert}).encode())
        def get_token(payload):
            return jwt.encode(signer, payload).decode()
        with patch.object(server, 'CERT_REQUEST', return_value=response):
            token = get_token(claims)
            self.assertEqual(self.client.get('/songs/song', headers={'Authorization':'Bearer '+token}).status_code, 200)
            for payload in ({**claims,'aud':'other-project'}, {**claims,'exp':int(time.time())-60},
                            {**claims,'iss':'https://evil.test'}):
                self.assertEqual(self.client.get('/songs/song', headers={'Authorization':'Bearer '+get_token(payload)}).status_code, 401)
            segments = token.split('.')
            segments[-1] = ('A' if segments[-1][0] != 'A' else 'B') + segments[-1][1:]
            self.assertEqual(self.client.get('/songs/song', headers={'Authorization':'Bearer '+'.'.join(segments)}).status_code, 401)

    def test_member_reads_but_cannot_upload(self):
        self.login()
        self.assertEqual(self.client.get('/songs/song').json()['state'], 'sin_audio')
        self.assertEqual(self.client.post('/songs/song/audio', headers=self.headers, content=b'audio').status_code, 403)

    def test_enrolled_uid_can_upload_without_email_verification(self):
        self.login(admin=True, verified=False)
        self.assertEqual(self.client.post('/songs/song/audio', headers=self.headers, content=b'audio').status_code, 202)

    def test_uid_permission_does_not_require_email_verification(self):
        import json
        self.login(admin=True,verified=False)
        output=server.DATA/'outputs'/'test-output'
        output.mkdir(parents=True)
        (output/'manifest.json').write_text(json.dumps({'frames':100,'stems':{}}))
        with server.connect() as db:
            db.execute("INSERT INTO jobs VALUES ('job','song','source','listo','owner',0,?,NULL)",(str(output),))
            db.execute("INSERT INTO songs VALUES ('song','job',NULL)")
        with patch.object(server.cloud_publish,'configured',return_value=False):
            state=self.client.get('/songs/song').json()
        self.assertTrue(state['ready'])
        self.assertTrue(state['canPublish'])
        self.assertNotIn('emailVerified',state)
        self.assertEqual(state['cloudState'],'sin_configurar')

    def test_admin_email_alone_does_not_grant_access(self):
        server.app.dependency_overrides[server.principal]=lambda: {
            'sub':'not-enrolled','email':'admin@genesaret.com','email_verified':True}
        self.assertEqual(self.client.post('/songs/song/audio',headers=self.headers,content=b'audio').status_code,403)
        self.assertFalse(self.client.get('/songs/song').json()['canPublish'])

    def test_admin_queues_once_and_preserves_song(self):
        self.login(admin=True)
        first = self.client.post('/songs/song/audio', headers=self.headers, content=b'will-be-validated-by-worker')
        self.assertEqual(first.status_code, 202)
        self.assertEqual(self.client.get('/songs/song').json()['state'], 'pendiente')
        self.assertEqual(self.client.post('/songs/song/audio', headers=self.headers, content=b'other').status_code, 409)
        self.assertEqual(list((server.DATA/'incoming').iterdir()), [])
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM jobs').fetchone()[0], 1)

    def test_origin_type_size_and_paths(self):
        self.login(admin=True)
        self.assertEqual(self.client.post('/songs/song/audio', headers={**self.headers, 'Origin': 'https://evil.test'}, content=b'audio').status_code, 403)
        self.assertEqual(self.client.post('/songs/song/audio', headers={**self.headers, 'Content-Type': 'text/html'}, content=b'audio').status_code, 415)
        self.assertEqual(self.client.post('/songs/song/audio', headers={**self.headers, 'Content-Length': str(101*1024*1024)}, content=b'audio').status_code, 413)
        self.assertEqual(self.client.get('/songs/invalid.id').status_code, 400)

    def test_token_audience_and_issuer(self):
        valid = {"sub": "uid", "iss": "https://securetoken.google.com/" + server.PROJECT}
        with patch.object(server, 'verify_firebase_token', return_value=valid) as verify:
            response = self.client.get('/songs/song', headers={"Authorization": "Bearer valid"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(verify.call_args.kwargs['audience'], server.PROJECT)
        with patch.object(server, 'verify_firebase_token', return_value={**valid, 'iss': 'https://evil.test'}):
            self.assertEqual(self.client.get('/songs/song', headers={"Authorization": "Bearer valid"}).status_code, 401)


if __name__ == '__main__':
    unittest.main()
