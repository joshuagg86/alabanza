"""Prepare aligned AAC copies; originals and lossless stems stay on the Mac."""
import fcntl
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from separate import atomic_json, sha256, validate_stems

RECIPE = 'aac-96k-44100-v1'


def prepare(output, data):
    import imageio_ffmpeg
    import soundfile as sf
    output, data = Path(output).resolve(), Path(data).resolve()
    source = json.loads((output/'manifest.json').read_text())
    validate_stems(output, source['frames'], source['stems'])
    version = hashlib.sha256((source['jobId']+RECIPE).encode()).hexdigest()
    exports = data/'exports'
    exports.mkdir(parents=True, exist_ok=True)
    destination = exports/version
    with (exports/'export.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if destination.exists():
            manifest = json.loads((destination/'web-manifest.json').read_text())
            for stem in manifest['stems'].values():
                if sha256(destination/stem['file']) != stem['sha256']:
                    raise ValueError('La copia web guardada fue modificada.')
            return destination, manifest
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        with tempfile.TemporaryDirectory(prefix='export-', dir=data) as folder:
            workspace = Path(folder)
            result = workspace/'result'
            result.mkdir()
            stems, lengths = {}, set()
            for name in source['stems']:
                encoded = result/(name+'.m4a')
                subprocess.run([ffmpeg,'-nostdin','-v','error','-i',str(output/(name+'.wav')),
                    '-map_metadata','-1','-c:a','aac','-b:a','96k','-ar','44100',
                    '-movflags','+faststart',str(encoded)], check=True, timeout=180,
                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                decoded = workspace/(name+'.wav')
                subprocess.run([ffmpeg,'-nostdin','-v','error','-i',str(encoded),
                    '-c:a','pcm_f32le',str(decoded)], check=True, timeout=120,
                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                info = sf.info(decoded)
                if (info.samplerate != 44100 or info.channels != 2
                        or not 0 <= info.frames-source['frames'] < 1024):
                    raise ValueError('La copia comprimida no conserva la longitud esperada: '+name)
                lengths.add(info.frames)
                decoded.unlink()
                stems[name] = {'file':encoded.name,'bytes':encoded.stat().st_size,'sha256':sha256(encoded)}
            if len(lengths) != 1:
                raise ValueError('Las copias comprimidas no tienen igual longitud decodificada.')
            manifest = {'version':version,'recipe':RECIPE,'model':source['model'],
                'sampleRate':44100,'frames':source['frames'],'decodedFrames':lengths.pop(),
                'duration':source['frames']/44100,'stems':stems,
                'totalBytes':sum(stem['bytes'] for stem in stems.values())}
            atomic_json(result/'web-manifest.json', manifest)
            result.rename(destination)
    return destination, manifest


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--data-dir',type=Path,default=Path(__file__).resolve().parent/'.local')
    args = parser.parse_args()
    path, manifest = prepare(args.output,args.data_dir)
    print(path)
    print(json.dumps({'bytes':manifest['totalBytes'],'frames':manifest['frames'],
                      'decodedFrames':manifest['decodedFrames']},indent=2))
