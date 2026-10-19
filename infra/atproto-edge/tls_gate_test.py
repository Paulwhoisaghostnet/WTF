import importlib.util
from pathlib import Path
import ssl
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location("tls_gate", Path(__file__).with_name("tls-gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class TlsGateTests(unittest.TestCase):
    def test_existing_infrastructure_and_pds_handles_do_not_depend_on_kernel(self):
        with patch.object(gate, "is_registered", return_value=True) as pds, patch.object(gate, "is_kernel_registered") as kernel:
            for host in gate.INFRA:
                self.assertTrue(gate.is_allowed(host))
            pds.assert_not_called()
            self.assertTrue(gate.is_allowed("registered.wtfos.me"))
            pds.assert_called_once_with("registered.wtfos.me")
            kernel.assert_not_called()

    def test_only_registered_kernel_sites_extend_the_existing_allowlist(self):
        with patch.object(gate, "is_registered", return_value=False), patch.object(gate, "is_kernel_registered", return_value=True) as kernel:
            self.assertTrue(gate.is_allowed("private-project.wtfos.me"))
            kernel.assert_called_once_with("private-project.wtfos.me")
        with patch.object(gate, "is_registered", return_value=False), patch.object(gate, "is_kernel_registered", return_value=False):
            self.assertFalse(gate.is_allowed("unknown.wtfos.me"))
        with patch.object(gate, "is_registered") as pds, patch.object(gate, "is_kernel_registered") as kernel:
            for host in ["", "example.com", "wtfos.me.example.com", "notwtfos.me"]:
                self.assertFalse(gate.is_allowed(host))
            pds.assert_not_called()
            kernel.assert_not_called()

    def test_kernel_lookup_uses_fixed_authority_and_requires_success(self):
        with patch.object(gate, "KernelConnection") as connection_type:
            connection = connection_type.return_value
            for status in [200, 301, 403, 404, 503]:
                connection.getresponse.return_value.status = status
                self.assertEqual(gate.is_kernel_registered("private-project.wtfos.me"), status == 200)
                connection.request.assert_called_with("GET", "/internal/tls/allow?domain=private-project.wtfos.me", headers={"Host": "wtfos.app"})
                connection.close.assert_called()
            connection.request.side_effect = ssl.SSLCertVerificationError("untrusted upstream")
            self.assertFalse(gate.is_kernel_registered("private-project.wtfos.me"))
            connection.close.assert_called()

    def test_transport_verifies_canonical_hostname_over_private_address(self):
        connection = gate.KernelConnection()
        self.assertEqual(connection.kernel_context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(connection.kernel_context.check_hostname)
        context = MagicMock()
        connection.kernel_context = context
        with patch.object(gate.socket, "create_connection") as connect:
            connection.connect()
            connect.assert_called_once_with(("10.0.0.2", 443), timeout=gate.LOOKUP_TIMEOUT)
            context.wrap_socket.assert_called_once_with(connect.return_value, server_hostname="wtfos.app")
            self.assertIs(connection.sock, context.wrap_socket.return_value)
        connection.close()

    def test_failed_tls_handshake_closes_the_private_socket(self):
        connection = gate.KernelConnection()
        connection.kernel_context = MagicMock()
        connection.kernel_context.wrap_socket.side_effect = ssl.SSLCertVerificationError("wrong hostname")
        with patch.object(gate.socket, "create_connection") as connect:
            with self.assertRaises(ssl.SSLCertVerificationError):
                connection.connect()
            connect.return_value.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
