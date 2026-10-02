import hashlib
import importlib.util
import io
import json
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import unittest

OPS = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("release_verifier", OPS / "verify-release.py")
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, filename="package.json", payload=b"{}", actual=None, extra=None):
        archive = self.root / "release.tar.gz"
        manifest = {
            "format": "wtf-aleatory-provider-release-v1", "gitCommit": "a" * 40,
            "files": [{"path": filename, "sha256": hashlib.sha256(payload).hexdigest(), "mode": 0o644}],
        }
        with tarfile.open(archive, "w:gz") as handle:
            for name, data in [(filename, payload if actual is None else actual), ("release-manifest.json", json.dumps(manifest).encode())]:
                member = tarfile.TarInfo(name)
                member.size = len(data)
                handle.addfile(member, io.BytesIO(data))
            if extra:
                handle.addfile(extra)
        return archive

    def test_extracts_verified_bytes(self):
        archive = self.archive(payload=b'{"private":true}')
        target = self.root / "extracted"
        self.assertEqual(verifier.verify_release(archive, target), "a" * 40)
        self.assertEqual((target / "package.json").read_bytes(), b'{"private":true}')

    def test_tampered_bytes_rejected_before_any_extraction(self):
        archive = self.archive(actual=b'{"changed":true}')
        target = self.root / "extracted"
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            verifier.verify_release(archive, target)
        self.assertFalse(target.exists())

    def test_traversal_and_credentials_rejected(self):
        for name in ["../escape", "/absolute", "extensions/aleatory-provider/src/.env", "extensions/aleatory-provider/src/secrets/key"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                verifier.verify_release(self.archive(filename=name))

    def test_symlink_rejected_before_extraction(self):
        link = tarfile.TarInfo("extensions/aleatory-provider/src/escape")
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/wtf"
        with self.assertRaisesRegex(ValueError, "regular release files"):
            verifier.verify_release(self.archive(extra=link))

    def test_unlisted_file_and_existing_destination_rejected(self):
        with self.assertRaisesRegex(ValueError, "inventory differs"):
            verifier.verify_release(self.archive(extra=tarfile.TarInfo("unlisted")))
        target = self.root / "existing"
        target.mkdir()
        (target / "valuable").write_text("preserve")
        with self.assertRaisesRegex(ValueError, "empty real directory"):
            verifier.verify_release(self.archive(), target)
        self.assertEqual((target / "valuable").read_text(), "preserve")

    def test_assembler_uses_committed_allowlist_not_working_tree(self):
        repository = self.root / "repository"
        repository.mkdir()
        extension = repository / "extensions/aleatory-provider"
        sources = {
            "extensions/aleatory-provider/package.json": b'{"private":true}',
            "extensions/aleatory-provider/package-lock.json": b'{}',
            "extensions/aleatory-provider/src/daemon.mts": b'export const committed = true;',
            "extensions/aleatory-provider/vendor/provider/provider.mts": b'export {};',
            "extensions/aleatory-provider/contract/artifacts/AleatoryProvider.json": b'{}',
            "extensions/aleatory-provider/ops/wtf-aleatory-provider.service": b'[Service]\n',
            "extensions/wtf-operator-signer/src/keyring.ts": b'export {};',
            "extensions/wtf-operator-signer/src/network.ts": b'export {};',
            "extensions/wtf-operator-signer/src/env.ts": b'export {};',
            "shared/operator-signer.ts": b'export {};',
            "unrelated-application.ts": b'never ship this',
        }
        for name, data in sources.items():
            target = repository / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        shutil.copyfile(OPS / "assemble.mjs", extension / "ops/assemble.mjs")
        def git(*args):
            return subprocess.check_output(["git", "-C", str(repository), *args], stderr=subprocess.DEVNULL).decode().strip()
        git("init")
        git("add", ".")
        git("-c", "user.name=Release Test", "-c", "user.email=release-test@example.invalid", "commit", "-m", "fixture")
        commit = git("rev-parse", "HEAD")
        (extension / "src/daemon.mts").write_text("uncommitted change")
        (extension / "src/.env").write_text("DO_NOT_PACKAGE=private-placeholder")
        archive = self.root / "assembled.tar.gz"
        subprocess.run(["node", str(extension / "ops/assemble.mjs"), str(archive)], check=True, stdout=subprocess.DEVNULL)
        target = self.root / "assembled"
        self.assertEqual(verifier.verify_release(archive, target), commit)
        self.assertEqual((target / "extensions/aleatory-provider/src/daemon.mts").read_bytes(), sources["extensions/aleatory-provider/src/daemon.mts"])
        self.assertFalse((target / "unrelated-application.ts").exists())
        self.assertFalse((target / "extensions/aleatory-provider/src/.env").exists())
        self.assertTrue((target / "package.json").exists())
        self.assertTrue(pathlib.Path(str(archive) + ".sha256").exists())


if __name__ == "__main__":
    unittest.main()
