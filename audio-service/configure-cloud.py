"""Run in your Terminal. Never paste this secret in chat or frontend configuration."""
import getpass
import json
import os
from pathlib import Path
import tempfile

from cloud_publish import DEFAULT_URL


def main():
    print('Configuración privada para subida automática a Supabase.')
    print('La credencial se guarda fuera del repositorio y no se muestra.')
    key = getpass.getpass('Service role key del proyecto (entrada oculta): ').strip()
    if not key or len(key)<30:
        raise SystemExit('Credencial vacía o inválida. No se guardó nada.')
    folder = Path.home()/'.config/alabanza-audio'
    folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    with tempfile.NamedTemporaryFile(mode='w',dir=folder,delete=False) as stream:
        os.chmod(stream.name,0o600)
        json.dump({'ALABANZA_SUPABASE_URL':DEFAULT_URL,'ALABANZA_SUPABASE_SERVICE_KEY':key},stream)
        temporary=Path(stream.name)
    temporary.replace(folder/'cloud.json')
    print('Configuración guardada. Reinicia start-local.command para activarla.')


if __name__=='__main__':
    main()
