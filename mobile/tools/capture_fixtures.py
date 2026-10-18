"""Capture des trames réelles du sonomètre pour les tests d'équivalence.

Le JavaScript mobile doit décoder *exactement* comme `slm/protocol.py`. Plutôt
que de croire une transcription sur parole, ce script interroge l'appareil et
fige :

  * une série de rapports live, avec la valeur attendue calculée par Python,
  * le flux d'historique complet (charge utile de 8 octets par trame) et les
    enregistrements décodés par Python,
  * quelques groupes 12 bits bruts.

Le tout part dans `tests/fixtures/device.json`, rejoué ensuite par
`tests/protocol.test.mjs`. À relancer quand on veut rafraîchir les captures :

    python tools/capture_fixtures.py

Fermer toute autre application qui utilise le sonomètre (SoundLab, l'exe de
bureau) avant de lancer : l'appareil n'accepte qu'un seul programme.
"""

from __future__ import annotations

import base64
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from slm import protocol as P  # noqa: E402
from slm.usb import HidTransport, describe_devices, find_device  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "device.json"
LIVE_SAMPLES = 12
MAX_STREAM = 31_000 * 3 + 16


def wait_report(reports: list[bytes], timeout: float) -> bytes | None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if reports:
            return reports[-1]
        time.sleep(0.01)
    return None


def split(raw: bytes) -> tuple[str, str]:
    """Rend la trame telle que reçue (9 octets) et sa charge utile (8 octets)."""
    full = P._normalize(raw)  # noqa: SLF001 - même normalisation que le parseur
    return full.hex(), bytes(full[1:9]).hex()


def main() -> int:
    devices = find_device()
    if not devices:
        print("Aucun sonomètre trouvé.\n")
        print(describe_devices())
        return 1

    reports: list[bytes] = []
    transport = HidTransport(on_report=reports.append)
    transport.open()
    print(f"Appareil ouvert : {devices[0].label}")
    live: list[dict] = []
    payloads: list[str] = []

    try:
        # -- mesures live --------------------------------------------------
        for _ in range(LIVE_SAMPLES):
            reports.clear()
            transport.write(P.read_point())
            raw = wait_report(reports, 1.0)
            if raw is None:
                print("  (pas de réponse live, capture partielle)")
                break
            raw9, payload8 = split(raw)
            try:
                expected = P.parse_read_point(raw).to_dict()
            except ValueError:
                continue
            live.append({"raw9": raw9, "payload8": payload8, "expect": expected})
            time.sleep(0.05)
        print(f"  {len(live)} rapports live capturés")

        # -- historique ----------------------------------------------------
        reports.clear()
        transport.write(P.handshake_history())
        wait_report(reports, 1.0)

        stream = bytearray()
        empties = 0
        while len(stream) < MAX_STREAM:
            reports.clear()
            transport.write(P.read_history())
            raw = wait_report(reports, 0.6)
            if raw is None or len(raw) < P.HID_REPORT_LEN:
                empties += 1
                if empties >= 3:
                    break
                continue
            empties = 0
            _, payload8 = split(raw)
            payload = bytes.fromhex(payload8)
            payloads.append(payload8)
            stream.extend(payload)
            if payload[0] == P.NO_DATA:
                break

        records = [m.to_dict() for m in P.iter_history(bytes(stream))]
        for i, record in enumerate(records, 1):
            record["no"] = i

        # Quelques groupes 12 bits bruts, pour tester le décodage au plus près.
        groups: list[dict] = []
        pos = 9
        while pos + 3 <= len(stream) and len(groups) < 12:
            if stream[pos] in (P.NO_DATA, P.ACK_HISTORY_RECORD):
                break
            group = bytes(stream[pos : pos + 3])
            v1, v2 = P.decode_history_group(group)
            groups.append({"raw": group.hex(), "expect": [v1, v2]})
            pos += 3
        print(f"  historique : {len(payloads)} trames, {len(records)} enregistrements, {len(groups)} groupes")
    finally:
        transport.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "captured": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "backend": "pywinusb",
                "report_len": P.HID_REPORT_LEN,
                "live": live,
                "history": {
                    "payloads": payloads,
                    "stream_b64": base64.b64encode(bytes(stream)).decode(),
                    "records": records,
                    "groups": groups,
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Écrit {OUT} ({OUT.stat().st_size / 1024:.1f} Ko)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
