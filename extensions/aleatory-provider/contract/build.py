"""Verify provenance, compile the provider and run local conformance tests.

Usage: python3 extensions/aleatory-provider/contract/build.py
Requires smartpy-tezos==0.24.1. Makes no network calls or chain writes.
"""

from hashlib import sha256
from importlib.metadata import version
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
COMPILER_VERSION = "0.24.1"
UPSTREAM_COMMIT = "82bea97b21bd477f3bd66cb4e189c0f1627c9654"
SOURCE_SHA256 = "27a3974c1a45d775b7027ddb9339a4d06ffae71f8ab3f8c82e7557b9e9ff697a"


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def main():
    installed = version("smartpy-tezos")
    if installed != COMPILER_VERSION:
        raise SystemExit(f"Expected smartpy-tezos {COMPILER_VERSION}; found {installed}")
    source = ROOT / "upstream" / "aleatory.py"
    if digest(source) != SOURCE_SHA256:
        raise SystemExit("Upstream aleatory.py checksum mismatch; refusing to build")
    # Fresh temporary output means a failed build can never reuse old compiler
    # products. Committed artifacts are replaced only after tests succeed.
    with tempfile.TemporaryDirectory(prefix="alea-provider-contract-") as output:
        env = dict(os.environ, SMARTPY_OUTPUT_DIR=output)
        env.pop("SMARTPY_SCENARIO_NAME", None)
        for script in ["compile_provider.py", "test_provider.py"]:
            subprocess.run([sys.executable, str(ROOT / script)], env=env, check=True, cwd=ROOT)
        compiled = Path(output) / "AleatoryProvider"
        artifacts = ROOT / "artifacts"
        artifacts.mkdir(exist_ok=True)
        for suffix in ["json", "tz"]:
            shutil.copyfile(compiled / f"step_001_cont_0_contract.{suffix}", artifacts / f"AleatoryProvider.{suffix}")
        receipt = {
            "upstreamRepository": "https://github.com/skullzarmy/aleatory",
            "upstreamCommit": UPSTREAM_COMMIT,
            "upstreamPath": "contract/aleatory.py",
            "sourceSha256": SOURCE_SHA256,
            "compiler": {"package": "smartpy-tezos", "version": installed},
            "contract": "aleatory.AleatoryProvider",
            "sourceModified": False,
            "conformance": "passed",
            "chainWrites": False,
            "files": {str(p.relative_to(ROOT)): digest(p) for p in [ROOT / "compile_provider.py", ROOT / "test_provider.py", artifacts / "AleatoryProvider.json", artifacts / "AleatoryProvider.tz"]},
        }
        (artifacts / "build-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
