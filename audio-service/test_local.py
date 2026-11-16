"""Boundary checks without downloading or running the model."""
import argparse
import contextlib
import fcntl
import io
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import soundfile as sf

from separate import STEMS, run, validate_stems


class LocalAudioTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def args(self, source):
        return argparse.Namespace(source=source, data_dir=self.root / "data",
                                  device="cpu", timeout=30)

    def stems(self):
        for name in STEMS:
            sf.write(self.root / (name + ".wav"), np.zeros((100, 2)), 44100)

    def test_all_stems_must_have_equal_frames(self):
        self.stems()
        sf.write(self.root / "bass.wav", np.zeros((99, 2)), 44100)
        with self.assertRaisesRegex(ValueError, "longitud"):
            validate_stems(self.root)

    def test_old_four_stem_manifest_remains_readable(self):
        from separate import LEGACY_STEMS, sha256
        manifest = {}
        for name in LEGACY_STEMS:
            path = self.root / (name + '.wav')
            sf.write(path, np.zeros((100, 2)), 44100)
            manifest[name] = {'sha256': sha256(path)}
        result, frames = validate_stems(self.root, 100, manifest)
        self.assertEqual(set(result), set(LEGACY_STEMS))
        self.assertEqual(frames, 100)

    def test_modified_cached_stem_is_rejected(self):
        self.stems()
        original, frames = validate_stems(self.root)
        sf.write(self.root / "vocals.wav", np.ones((100, 2)) * 0.1, 44100)
        with self.assertRaisesRegex(ValueError, "modificada"):
            validate_stems(self.root, frames, original)

    def test_fake_wav_records_error_and_cleans_temporary_files(self):
        source = self.root / "fake.wav"
        source.write_text("This is not audio")
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, "decodificar"):
                run(self.args(source))
        data = self.root / "data"
        status = json.loads(next((data / "jobs").glob("*.json")).read_text())
        self.assertEqual(status["state"], "error")
        self.assertEqual(list(data.glob("processing-*")), [])
        self.assertEqual(list((data / "outputs").iterdir()), [])

    def test_second_process_is_rejected(self):
        source = self.root / "input.wav"
        sf.write(source, np.zeros((100, 2)), 44100)
        data = self.root / "data"
        data.mkdir()
        with (data / "worker.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, "activo"):
                run(self.args(source))

    def test_file_limit_precedes_processing(self):
        source = self.root / "large.wav"
        with source.open("wb") as stream:
            stream.truncate(100 * 1024 * 1024 + 1)
        with self.assertRaisesRegex(ValueError, "100 MiB"):
            run(self.args(source))
        self.assertFalse((self.root / "data").exists())


if __name__ == "__main__":
    unittest.main()
