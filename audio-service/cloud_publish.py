"""Private Supabase upload, enabled only when a backend-only credential is configured."""
import json
import os
import threading
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import requests

from separate import sha256
from web_export import prepare

BUCKET = 'ensayo-audio'
DEFAULT_URL = 'https://pkwiklslewgzcyiiyjek.supabase.co'
PUBLIC_KEY = 'sb_publishable_TnShsBTclb7gywjrY1vv3A_Et-4Sqy-'
_lock = threading.Lock()
_session = None


def remember_session(token, expires_at):
    """Called only after local Firebase signature + verified-admin checks. Never persisted."""
    global _session
    with _lock:
        _session = (token, expires_at)


def active_session():
    with _lock:
        return _session[0] if _session and _session[1] > time.time()+15 else None


def load_private_config():
    """Optional credentials live OUTSIDE the static web checkout, owner-readable only."""
    path = Path.home()/'.config/alabanza-audio/cloud.json'
    if not path.exists():
        return
    if path.stat().st_mode & 0o077:
        raise RuntimeError('La configuración privada de nube debe tener permisos 600.')
    settings = json.loads(path.read_text())
    for name in ('ALABANZA_SUPABASE_URL','ALABANZA_SUPABASE_SERVICE_KEY'):
        if settings.get(name) and name not in os.environ:
            os.environ[name] = settings[name]


def configured():
    return bool(os.environ.get('ALABANZA_SUPABASE_SERVICE_KEY') or active_session())


def publish(song_id, output, data):
    if not configured():
        raise RuntimeError('Falta configurar la credencial privada de almacenamiento en el Mac.')
    if not os.environ.get('ALABANZA_SUPABASE_SERVICE_KEY'):
        return publish_with_session(song_id,output,data)
    url = os.environ.get('ALABANZA_SUPABASE_URL', DEFAULT_URL).rstrip('/')
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.supabase.co'):
        raise ValueError('La URL de Supabase debe ser HTTPS y terminar en .supabase.co.')
    key = os.environ['ALABANZA_SUPABASE_SERVICE_KEY']
    session = requests.Session()
    session.headers.update({'apikey':key, 'Authorization':'Bearer '+key})

    def call(method, path, **kwargs):
        response = session.request(method, url+path, timeout=(10,120), **kwargs)
        if not response.ok:
            # Do not expose response bodies, keys, URLs with signatures, or original paths.
            raise RuntimeError('El almacenamiento rechazó la operación (HTTP '+str(response.status_code)+').')
        return response

    export, manifest = prepare(output,data)
    existing = call('GET','/rest/v1/rehearsal_audio',params={
        'song_id':'eq.'+song_id,'select':'manifest'}).json()
    if existing and existing[0]['manifest'].get('version') == manifest['version']:
        return manifest
    if not existing:
        catalog = call('GET','/rest/v1/rehearsal_audio',params={'select':'song_id'}).json()
        if len(catalog) >= 7:
            raise RuntimeError('La prueba está limitada a siete canciones. No se subieron archivos nuevos.')
    prefix = song_id+'/'+manifest['version']+'/'
    for name, stem in manifest['stems'].items():
        path = prefix+name+'.m4a'
        with (export/stem['file']).open('rb') as stream:
            response = session.post(url+'/storage/v1/object/'+BUCKET+'/'+quote(path,safe='/'),
                data=stream,headers={'Content-Type':'audio/mp4','x-upsert':'false'},timeout=(10,120))
        if response.status_code in (400,409):
            # An interrupted previous attempt can leave immutable objects behind.
            saved = call('GET','/storage/v1/object/authenticated/'+BUCKET+'/'+quote(path,safe='/'))
            import hashlib
            if hashlib.sha256(saved.content).hexdigest() != stem['sha256']:
                raise RuntimeError('Una pista remota no coincide con la copia local verificada.')
        elif not response.ok:
            raise RuntimeError('No se pudo subir una pista (HTTP '+str(response.status_code)+').')
    # Only expose a version after every object has uploaded successfully.
    call('POST','/rest/v1/rpc/publish_rehearsal_audio',json={
        'p_song_id':song_id,'p_manifest':manifest})
    return manifest


def publish_with_session(song_id,output,data):
    token = active_session()
    if not token:
        raise RuntimeError('Abre la web con tu cuenta administrativa para continuar la subida.')
    export, manifest = prepare(output,data)
    headers = {'Authorization':'Bearer '+token,'apikey':PUBLIC_KEY,
               'Origin':'http://127.0.0.1:5500','Content-Type':'application/json'}
    endpoint = DEFAULT_URL+'/functions/v1/rehearsal-audio?song='+quote(song_id,safe='')
    def action(name):
        response=requests.post(endpoint,headers=headers,json={'action':name,'manifest':manifest},timeout=(10,90))
        if not response.ok:
            raise RuntimeError('La nube rechazó la publicación (HTTP '+str(response.status_code)+').')
        return response.json()
    plan=action('prepare')
    if plan.get('alreadyPublished'):
        return manifest
    for name,url in plan.get('uploads',{}).items():
        address=urlparse(url)
        if (name not in manifest['stems'] or address.scheme!='https'
                or address.netloc!=urlparse(DEFAULT_URL).netloc
                or not address.path.startswith('/storage/v1/object/upload/sign/')):
            raise ValueError('Referencia de subida inválida.')
        with (export/manifest['stems'][name]['file']).open('rb') as stream:
            response=requests.put(url,data=stream,headers={'Content-Type':'audio/mp4','x-upsert':'false'},timeout=(10,120))
        if not response.ok:
            raise RuntimeError('No se pudo subir una pista (HTTP '+str(response.status_code)+').')
    action('commit')
    return manifest
