"""Publication behavior with a fake storage transport; no real cloud writes."""
import json
from pathlib import Path
import tempfile
import unittest
import time
from unittest.mock import patch, Mock

import cloud_publish
import server


class CloudTests(unittest.TestCase):
    def setUp(self):
        self.folder=tempfile.TemporaryDirectory()
        self.root=Path(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def fake_export(self):
        import hashlib
        (self.root/'vocals.m4a').write_bytes(b'encoded')
        return self.root, {'version':'a'*64,'recipe':'aac-96k-44100-v1','totalBytes':7,
            'stems':{'vocals':{'file':'vocals.m4a','sha256':hashlib.sha256(b'encoded').hexdigest()}}}

    def test_upload_precedes_atomic_metadata_commit(self):
        session=Mock()
        def response(value):
            return Mock(ok=True,json=lambda:value,status_code=200)
        session.request.side_effect=[response([]),response([]),response(None)]
        session.post.return_value=response(None)
        with patch.dict('os.environ',{'ALABANZA_SUPABASE_SERVICE_KEY':'private-test-key'}), \
             patch.object(cloud_publish.requests,'Session',return_value=session), \
             patch.object(cloud_publish,'prepare',return_value=self.fake_export()):
            cloud_publish.publish('song',self.root,self.root)
        methods=[item[0] for item in session.method_calls if item[0] in ('post','request')]
        self.assertEqual(methods,['request','request','post','request'])
        self.assertIn('/rpc/publish_rehearsal_audio',session.request.call_args.args[1])

    def test_upload_failure_never_publishes_manifest(self):
        session=Mock()
        session.request.return_value=Mock(ok=True,json=lambda:[],status_code=200)
        session.post.return_value=Mock(ok=False,status_code=503)
        with patch.dict('os.environ',{'ALABANZA_SUPABASE_SERVICE_KEY':'private-test-key'}), \
             patch.object(cloud_publish.requests,'Session',return_value=session), \
             patch.object(cloud_publish,'prepare',return_value=self.fake_export()):
            with self.assertRaisesRegex(RuntimeError,'503'):
                cloud_publish.publish('song',self.root,self.root)
        self.assertEqual(session.request.call_count,2)

    def test_existing_version_does_not_upload_twice(self):
        export,manifest=self.fake_export()
        session=Mock()
        session.request.return_value=Mock(ok=True,json=lambda:[{'manifest':manifest}],status_code=200)
        with patch.dict('os.environ',{'ALABANZA_SUPABASE_SERVICE_KEY':'private-test-key'}), \
             patch.object(cloud_publish.requests,'Session',return_value=session), \
             patch.object(cloud_publish,'prepare',return_value=(export,manifest)):
            cloud_publish.publish('song',self.root,self.root)
        session.post.assert_not_called()

    def test_firebase_session_uses_temporary_upload_links(self):
        export,manifest=self.fake_export()
        upload_url=cloud_publish.DEFAULT_URL+'/storage/v1/object/upload/sign/ensayo-audio/song/vocals.m4a?token=temporary'
        plan=Mock(ok=True,json=lambda:{'uploads':{'vocals':upload_url}},status_code=200)
        commit=Mock(ok=True,json=lambda:{'published':True},status_code=200)
        with patch.dict('os.environ',{'ALABANZA_SUPABASE_SERVICE_KEY':''}), \
             patch.object(cloud_publish,'_session',('firebase-session',time.time()+300)), \
             patch.object(cloud_publish,'prepare',return_value=(export,manifest)), \
             patch.object(cloud_publish.requests,'post',side_effect=[plan,commit]) as post, \
             patch.object(cloud_publish.requests,'put',return_value=Mock(ok=True,status_code=200)) as upload:
            cloud_publish.publish('song',self.root,self.root)
            self.assertEqual(post.call_args_list[0].kwargs['json']['action'],'prepare')
            self.assertEqual(post.call_args_list[1].kwargs['json']['action'],'commit')
            self.assertEqual(upload.call_args.args[0],upload_url)
            self.assertNotIn('Authorization',upload.call_args.kwargs['headers'])

    def test_expired_session_does_not_enable_upload(self):
        with patch.dict('os.environ',{'ALABANZA_SUPABASE_SERVICE_KEY':''}), \
             patch.object(cloud_publish,'_session',('expired',time.time()-60)):
            self.assertFalse(cloud_publish.configured())

    def test_signed_link_cannot_send_audio_to_another_host(self):
        export,manifest=self.fake_export()
        plan=Mock(ok=True,json=lambda:{'uploads':{'vocals':'https://evil.test/storage/v1/object/upload/sign/x'}},status_code=200)
        with patch.dict('os.environ',{'ALABANZA_SUPABASE_SERVICE_KEY':''}), \
             patch.object(cloud_publish,'_session',('firebase-session',time.time()+300)), \
             patch.object(cloud_publish,'prepare',return_value=(export,manifest)), \
             patch.object(cloud_publish.requests,'post',return_value=plan), \
             patch.object(cloud_publish.requests,'put') as upload:
            with self.assertRaisesRegex(ValueError,'inválida'):
                cloud_publish.publish('song',self.root,self.root)
            upload.assert_not_called()

    def test_publication_failure_keeps_local_audio_ready(self):
        with patch.object(server,'DATA',self.root):
            server.initialize()
            with server.connect() as db:
                db.execute("INSERT INTO songs VALUES ('song','job',NULL)")
                db.execute("INSERT INTO jobs VALUES ('job','song','original','listo','user',0,?,NULL)",(str(self.root),))
            with patch.object(cloud_publish,'configured',return_value=True), \
                 patch.object(cloud_publish,'publish',side_effect=RuntimeError('network')):
                server.publish_next()
            with server.connect() as db:
                self.assertEqual(db.execute("SELECT status FROM jobs").fetchone()[0],'listo')
                row=db.execute('SELECT * FROM publications').fetchone()
                self.assertEqual(row['status'],'error')
                self.assertEqual(row['attempts'],1)
                self.assertEqual(db.execute('SELECT ready_job FROM songs').fetchone()[0],'job')


if __name__=='__main__':
    unittest.main()
