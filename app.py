#!/usr/bin/env python3
"""Sere — jobs, invoices, payments, and cash for HVAC shops.

Nexus (the existing call-list app) remains at /nexus.
"""

from __future__ import annotations

import os
import socket

from dotenv import load_dotenv

from paths import HERE
from sere import create_app

load_dotenv(HERE / ".env")

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
    print(f"  Sere              : http://127.0.0.1:{port}")
    print(f"  On your network   : http://{ip}:{port}")
    print(f"  Demo login        : owner@sere.cash / harborair")
    print(f"  Nexus (preserved) : http://127.0.0.1:{port}/nexus/")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
