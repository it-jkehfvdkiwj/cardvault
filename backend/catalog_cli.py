"""
Command line for the local card catalogue.

    docker compose exec backend python catalog_cli.py status
    docker compose exec backend python catalog_cli.py import
    docker compose exec backend python catalog_cli.py images --kind small
    docker compose exec backend python catalog_cli.py images --kind large --limit 500

Note the path: the image sets WORKDIR=/app/backend, so the script is addressed
without a "backend/" prefix — "backend/catalog_cli.py" resolves to
/app/backend/backend/catalog_cli.py and fails.

`import` is safe to re-run and safe to interrupt: pages are committed as they
arrive and rows are matched by id, so a second run updates instead of
duplicating. That is also what makes the monthly refresh a plain re-run.

`images` is resumable in the same way and stops on its own before the disk
fills up — a full disk on this server takes the website down with it.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from database import Base, SessionLocal, engine   # noqa: E402
import models                                     # noqa: E402,F401
from services import catalog_service              # noqa: E402


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024 or unit == "GB":
            return f"{n:,.1f} {unit}".replace(",", ".")
        n /= 1024
    return f"{n} B"


def cmd_status(db) -> int:
    s = catalog_service.stats(db)
    free = catalog_service.free_bytes()
    img_dir = catalog_service.IMAGE_DIR
    used = sum(f.stat().st_size for f in img_dir.glob("*") if f.is_file()) if img_dir.exists() else 0
    print(f"Karten im Katalog:      {s['cards']:,}".replace(",", "."))
    print(f"Sets:                   {s['sets']}")
    print(f"davon mit eigenem Bild: {s['with_local_image']:,}".replace(",", "."))
    print(f"Bilder belegen:         {_human(used)}")
    print(f"Frei auf der Platte:    {_human(free)}")
    print(f"Bildordner:             {img_dir}")
    return 0


def cmd_import(db, args) -> int:
    print("Lade den Kartenkatalog, Set fuer Set. Das dauert ein paar Minuten.", flush=True)
    started = time.time()

    def progress(idx, n_sets, set_id, seen):
        print(f"  Set {idx:>3}/{n_sets}  {set_id:<12} {seen:>6} Karten "
              f"{idx * 100 / n_sets:4.0f} %", flush=True)

    try:
        res = catalog_service.import_all(db, progress=progress, page_limit=args.pages)
    except Exception as exc:
        print(f"\nAbgebrochen: {type(exc).__name__}: {exc}")
        print("Bereits geladene Seiten bleiben erhalten — einfach erneut starten.")
        return 1
    print(
        f"\nFertig in {time.time() - started:.0f}s: "
        f"{res['imported']} neu, {res['updated']} aktualisiert, "
        f"{res['skipped_sets']} Sets waren schon vollstaendig."
    )
    if res["failed_sets"]:
        print(
            f"Nicht geladen: {', '.join(res['failed_sets'])}\n"
            "Einfach noch einmal starten — fertige Sets werden uebersprungen."
        )
    return cmd_status(db)


def cmd_images(db, args) -> int:
    free = catalog_service.free_bytes()
    print(f"Frei auf der Platte: {_human(free)}")
    if free < catalog_service.MIN_FREE_BYTES:
        print(
            f"Zu wenig Platz — mindestens {_human(catalog_service.MIN_FREE_BYTES)} "
            "sollten frei bleiben. Abbruch."
        )
        return 1

    pending = catalog_service.stats(db)
    print(
        f"Bilder werden geladen ({args.kind}). "
        f"{pending['cards'] - pending['with_local_image']:,} stehen noch aus."
        .replace(",", ".")
    )

    def progress(done, total):
        print(f"  {done}/{total}", flush=True)

    res = catalog_service.download_images(
        db, kind=args.kind, limit=args.limit, progress=progress
    )
    print(
        f"\n{res['downloaded']} geladen, {res['failed']} fehlgeschlagen, "
        f"{res['remaining']} offen. Belegt: {_human(res['bytes_on_disk'])}"
    )
    if res["stopped_for_space"]:
        print("Vorzeitig gestoppt, weil der Platz knapp wurde.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Lokaler Kartenkatalog")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    p_imp = sub.add_parser("import")
    p_imp.add_argument("--pages", type=int, default=None, dest="pages",
                       help="nur so viele SETS laden (zum Ausprobieren)")
    p_img = sub.add_parser("images")
    p_img.add_argument("--kind", choices=["small", "large"], default="small")
    p_img.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if args.cmd == "status":
            return cmd_status(db)
        if args.cmd == "import":
            return cmd_import(db, args)
        if args.cmd == "images":
            return cmd_images(db, args)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
