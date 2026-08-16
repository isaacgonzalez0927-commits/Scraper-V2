#!/usr/bin/env python3
"""Sere — jobs, invoices, payments, and cash for HVAC shops."""

from __future__ import annotations

import os
import socket
from pathlib import Path

from dotenv import load_dotenv

from sere import create_app

load_dotenv(Path(__file__).parent / ".env")

app = create_app()


def local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    ip = local_ip()
    print("=" * 60)
    print("Sere — jobs, invoices, payments, cash")
    print("=" * 60)
    print(f"  Local             : http://127.0.0.1:{port}")
    print(f"  On your network   : http://{ip}:{port}")
    print("  Demo login        : owner@sere.cash / harborair")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
