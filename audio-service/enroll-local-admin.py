"""Owner-only terminal enrollment. There is deliberately no HTTP enrollment endpoint."""
import argparse

import server


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('firebase_uid',help='Exact UID confirmed by the project owner')
    args=parser.parse_args()
    server.initialize()
    with server.connect() as db:
        account=db.execute('SELECT * FROM observed_accounts WHERE firebase_uid=?',(args.firebase_uid,)).fetchone()
        if not account:
            parser.error('Primero abre la web local con esta cuenta: debe comprobarse su token Firebase.')
        db.execute('INSERT INTO audio_administrators VALUES (?,?) ON CONFLICT(firebase_uid) DO UPDATE SET label=excluded.label',
                   (args.firebase_uid,account['email']))
    print('Administrador de audio registrado por UID. Pulsa Actualizar en el mezclador.')


if __name__=='__main__':
    main()
