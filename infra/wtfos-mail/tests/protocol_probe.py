#!/usr/bin/env python3
"""Read a private probe configuration on stdin; emit only sanitized receipts.

The address must belong to the caller's controlled mailbox. The send phase only
sends to that same address. Run from a separate client on the isolated network
to exercise the same authentication and relay boundary as a remote client.
"""

import email.message
import email.parser
import email.policy
import email.utils
import hashlib
import imaplib
import json
import smtplib
import ssl
import sys


def run(config, phase):
    host = config["host"]
    address = config["address"]
    password = config["password"]
    marker = config["marker"]
    context = ssl.create_default_context()
    receipt = {"phase": phase, "certificateHostnameVerified": host}

    if phase == "relay-send":
        relay = config["relay"]
        body = f"Controlled migration proof: {marker} relay\n"
        message = email.message.EmailMessage()
        message["From"] = address
        message["To"] = address
        message["Date"] = email.utils.formatdate(localtime=False, usegmt=True)
        message["Subject"] = "wtfOS controlled relay migration proof"
        message["Message-ID"] = f"<{marker}.relay@migration.invalid>"
        message["X-Wtfos-Migration-Probe"] = marker
        message.set_content(body, cte="base64")
        with smtplib.SMTP(relay["host"], relay["port"], timeout=relay["connectTimeoutSeconds"]) as client:
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()
            assert client.login(relay["user"], relay["password"])[0] == 235
            assert not client.send_message(message)
            receipt.update({"accepted": True, "relayCertificateVerified": True,
                            "tlsVersion": client.sock.version(), "bodySha256": hashlib.sha256(body.encode()).hexdigest(),
                            "deliveryPath": "authenticated Resend SMTP to the controlled local mailbox"})
        return receipt

    if phase == "send":
        # RCPT is rejected before DATA; this does not send an external message.
        with smtplib.SMTP(host, 25) as client:
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()
            client.mail(address)
            code, _ = client.rcpt("relay-denial-probe@example.invalid")
            assert code in (550, 554), f"Unauthenticated relay was not denied: {code}"
            receipt["unauthenticatedRelayDenied"] = code

        for port, label in ((25, "inbound"), (587, "submission")):
            message = email.message.EmailMessage()
            message["From"] = address
            message["To"] = address
            message["Subject"] = f"wtfOS migration probe {label}"
            message["Date"] = email.utils.formatdate(localtime=False, usegmt=True)
            message["Message-ID"] = f"<{marker}.{label}@migration.invalid>"
            message.set_content(f"Controlled migration proof: {marker} {label}\n")
            with smtplib.SMTP(host, port) as client:
                client.ehlo()
                client.starttls(context=context)
                client.ehlo()
                if port == 587:
                    assert client.login(address, password)[0] == 235
                assert not client.send_message(message)
                receipt[label] = {"accepted": True, "tlsVersion": client.sock.version()}
        return receipt

    assert phase in ("read", "relay-read"), "Expected send/read or relay-send/relay-read"
    with imaplib.IMAP4_SSL(host, 993, ssl_context=context) as client:
        assert client.login(address, password)[0] == "OK"
        assert client.select("INBOX")[0] == "OK"
        receipt["tlsVersion"] = client.sock.version()
        receipt["uidValidity"] = client.response("UIDVALIDITY")[1][0].decode()
        receipt["messages"] = {}
        for label in (["relay"] if phase == "relay-read" else ["inbound", "submission"]):
            header, value = ("X-Wtfos-Migration-Probe", marker) if label == "relay" else ("Message-ID", f"<{marker}.{label}@migration.invalid>")
            status, data = client.uid("search", None, "HEADER", header, value)
            assert status == "OK" and len(data[0].split()) == 1, f"Expected one {label} delivery"
            uid = data[0].split()[0]
            status, data = client.uid("fetch", uid, "(BODY.PEEK[])")
            assert status == "OK"
            body = next(item[1] for item in data if isinstance(item, tuple))
            parsed = email.parser.BytesParser(policy=email.policy.default).parsebytes(body)
            expected = f"Controlled migration proof: {marker} {label}\n".encode()
            decoded = parsed.get_payload(decode=True)
            assert decoded.replace(b"\r\n", b"\n") == expected
            assert b"with LMTP" in body, "Expected Postfix to Dovecot LMTP delivery"
            receipt["messages"][label] = {"uid": uid.decode(), "sha256": hashlib.sha256(body).hexdigest(), "lmtpReceivedHeader": True}
            if label == "relay":
                assert decoded == expected, "Expected byte-for-byte decoded body through the relay"
                receipt["messages"][label]["bodySha256"] = hashlib.sha256(decoded).hexdigest()
    return receipt


if __name__ == "__main__":
    try:
        print(json.dumps(run(json.load(sys.stdin), sys.argv[1]), sort_keys=True))
    except Exception as error:
        # Protocol errors may contain mailbox names, so do not print their text.
        print(json.dumps({"phase": sys.argv[1], "ok": False, "errorType": type(error).__name__}), file=sys.stderr)
        raise SystemExit(1) from None
