"""Serveur statique de développement pour la webapp mobile bitan·sono.

Sert le dossier `mobile/` sur le réseau local, avec les bons types MIME pour
`.webmanifest`, `.svg` et `.wav`.

    python serve.py                    # http://<ip-locale>:8080
    python serve.py --port 8443 --tls  # HTTPS avec des certificats fournis

Attention : les API WebHID / WebUSB n'existent que dans un **contexte
sécurisé**. En HTTP elles sont bloquées, sauf sur `localhost`. Pour tester sur
le téléphone il faut donc :

  1. soit servir la page en HTTPS (`--tls --cert ... --key ...`, ou un
     reverse-proxy type Caddy / nginx, ou `mkcert`) ;
  2. soit, pour un essai rapide, marquer l'origine comme sûre dans Chrome
     Android : `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
     puis y ajouter `http://<ip-locale>:8080`.

Dans les deux cas l'appareil doit rester branché en OTG et il faut accepter la
demande d'accès USB du navigateur.
"""

from __future__ import annotations

import argparse
import functools
import mimetypes
import socket
import ssl
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent

for suffix, kind in (
    (".webmanifest", "application/manifest+json"),
    (".js", "text/javascript"),
    (".mjs", "text/javascript"),
    (".svg", "image/svg+xml"),
    (".wav", "audio/wav"),
    (".json", "application/json"),
    (".css", "text/css"),
):
    mimetypes.add_type(kind, suffix)


class Handler(SimpleHTTPRequestHandler):
    """Sert le dossier mobile/ sans cache, pour que le rechargement soit fiable."""

    def end_headers(self) -> None:  # noqa: D102
        self.send_header("Cache-Control", "no-store, must-revalidate")
        # Un service worker a besoin d'un scope racine ; rien de special a faire,
        # mais l'en-tete evite les mises en cache intermediaires.
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:  # noqa: D102
        sys.stderr.write("  %s\n" % (fmt % args))


def local_ips() -> list[str]:
    ips = {"127.0.0.1"}
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ips.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    return sorted(ips)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serveur de développement bitan·sono mobile")
    parser.add_argument("--host", default="0.0.0.0", help="interface d'écoute (défaut : toutes)")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--root", default=str(ROOT), help="dossier à servir")
    parser.add_argument("--tls", action="store_true", help="activer HTTPS")
    parser.add_argument("--cert", help="certificat PEM (avec --tls)")
    parser.add_argument("--key", help="clé privée PEM (avec --tls)")
    args = parser.parse_args()

    handler = functools.partial(Handler, directory=args.root)
    httpd = ThreadingHTTPServer((args.host, args.port), handler)

    scheme = "http"
    if args.tls:
        if not (args.cert and args.key):
            parser.error("--tls exige --cert et --key")
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(args.cert, args.key)
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"

    print("bitan·sono mobile — serveur de développement")
    print(f"  racine : {args.root}")
    for ip in local_ips():
        print(f"  {scheme}://{ip}:{args.port}/")
    if scheme == "http":
        print()
        print("  Rappel : WebHID / WebUSB sont bloqués en HTTP (sauf localhost).")
        print("  Sur téléphone, utilisez --tls, un reverse-proxy HTTPS, ou marquez")
        print("  l'origine comme sûre dans chrome://flags (#unsafely-treat-…)")
    print()
    print("  Ctrl+C pour arrêter.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  arrêt.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
