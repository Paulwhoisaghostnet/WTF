#!/usr/bin/env python3
"""Private mail provisioner API for wtfOS (bind 10.0.0.3 only)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BIND = os.environ.get("MAIL_ADMIN_BIND", "10.0.0.3")
PORT = int(os.environ.get("MAIL_ADMIN_PORT", "9120"))
SECRET = os.environ.get("MAIL_PROVISION_SECRET", "")
SCRIPT = os.environ.get("MAIL_PROVISION_SCRIPT", "/opt/platform/mail/scripts/provision-address.sh")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def _auth_ok(self) -> bool:
        if not SECRET:
            return False
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        return auth[7:].strip() == SECRET

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlparse(self.path).path != "/v1/mailboxes":
            return self._json(404, {"error": "not_found"})
        if not self._auth_ok():
            return self._json(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "invalid_json"})
        local_part = str(data.get("localPart") or data.get("local_part") or "").strip()
        if not local_part:
            return self._json(400, {"error": "local_part_required"})
        try:
            proc = subprocess.run(
                [SCRIPT, local_part],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except Exception as exc:
            return self._json(500, {"error": "provision_failed", "detail": str(exc)})
        if proc.returncode != 0:
            return self._json(500, {"error": "provision_script_failed", "detail": proc.stderr.strip()})
        try:
            payload = json.loads(proc.stdout.strip())
        except json.JSONDecodeError:
            return self._json(500, {"error": "invalid_script_output"})
        return self._json(201, payload)


def main():
    if not SECRET:
        print("MAIL_PROVISION_SECRET required", file=sys.stderr)
        sys.exit(1)
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"mail-admin listening on {BIND}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
