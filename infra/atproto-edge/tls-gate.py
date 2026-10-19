# wtfOS on-demand TLS ask-gate (Stage 2). Caddy calls GET /allow?domain=<sni>.
# Returns 200 ONLY for known infra hosts, a PDS-registered handle, or a user site
# registered with the kernel. Public PDS registration remains an independent
# authority; private page content and authorization never enter this gate.
import http.client
import json
import socket
import ssl
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NETWORK = "wtfos.me"
DOMAINS = ["social", "commerce", "media", "arcade", "tezos", "ops", "os"]
INFRA = set([NETWORK, "pds." + NETWORK, "plc." + NETWORK, "relay." + NETWORK,
             "mod." + NETWORK, "users." + NETWORK, "private." + NETWORK,
             "account." + NETWORK,
             "www." + NETWORK]
            + [d + "." + NETWORK for d in DOMAINS])
RESOLVE = "http://10.0.0.3:3000/xrpc/com.atproto.identity.resolveHandle"
KERNEL_ADDRESS = ("10.0.0.2", 443)
KERNEL_SERVER_NAME = "wtfos.app"
# Preserve the deployed PDS lookup's existing four-second transport timeout.
LOOKUP_TIMEOUT = 4


class KernelConnection(http.client.HTTPSConnection):
    """Use the private network with the canonical app's verified TLS identity."""

    def __init__(self):
        self.kernel_context = ssl.create_default_context()
        super().__init__(KERNEL_SERVER_NAME, timeout=LOOKUP_TIMEOUT, context=self.kernel_context)

    def connect(self):
        stream = socket.create_connection(KERNEL_ADDRESS, timeout=self.timeout)
        try:
            self.sock = self.kernel_context.wrap_socket(stream, server_hostname=KERNEL_SERVER_NAME)
        except Exception:
            stream.close()
            raise


def is_kernel_registered(handle):
    connection = KernelConnection()
    try:
        path = "/internal/tls/allow?" + urllib.parse.urlencode({"domain": handle})
        connection.request("GET", path, headers={"Host": KERNEL_SERVER_NAME})
        return connection.getresponse().status == 200
    except Exception:
        return False
    finally:
        connection.close()

def is_registered(handle):
    try:
        url = RESOLVE + "?" + urllib.parse.urlencode({"handle": handle})
        with urllib.request.urlopen(url, timeout=LOOKUP_TIMEOUT) as r:
            if r.status != 200:
                return False
            return bool(json.loads(r.read().decode()).get("did"))
    except Exception:
        return False


def is_allowed(domain):
    return domain in INFRA or (
        domain.endswith("." + NETWORK)
        and (is_registered(domain) or is_kernel_registered(domain))
    )


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        if p.path != "/allow":
            self.send_response(404); self.end_headers(); return
        domain = (urllib.parse.parse_qs(p.query).get("domain", [""])[0] or "").strip().lower()
        allow = is_allowed(domain)
        self.send_response(200 if allow else 403)
        self.send_header("Content-Type", "text/plain"); self.end_headers()
        self.wfile.write(b"ok" if allow else b"deny")
    def log_message(self, *a): pass

if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 9119), H).serve_forever()
