#!/usr/bin/env python3
"""Validate an exact release manifest before extracting any files."""
import argparse
import hashlib
import json
import pathlib
import re
import tarfile


def canonical_name(raw):
    name = raw[2:] if raw.startswith("./") else raw
    parts = pathlib.PurePosixPath(name)
    if not name or name.startswith("/") or ".." in parts.parts or "\\" in name:
        raise ValueError("Unsafe archive member path")
    return str(parts)


def verify_release(archive_path, destination=None):
    with tarfile.open(archive_path, "r:gz") as archive:
        files = {}
        directories = set()
        for member in archive.getmembers():
            if member.name in (".", "./") and member.isdir():
                continue
            name = canonical_name(member.name)
            if member.isdir():
                if name in files or name in directories:
                    raise ValueError("Duplicate archive path")
                directories.add(name)
                continue
            if not member.isfile() or name in files or name in directories:
                raise ValueError("Only unique regular release files are permitted")
            files[name] = member
        manifest_member = files.get("release-manifest.json")
        if manifest_member is None:
            raise ValueError("Missing release manifest")
        manifest = json.load(archive.extractfile(manifest_member))
        if manifest.get("format") != "wtf-aleatory-provider-release-v1":
            raise ValueError("Unsupported release format")
        commit = manifest.get("gitCommit", "")
        if not re.fullmatch(r"[a-f0-9]{40}", commit):
            raise ValueError("Release commit must be a Git SHA-1 object name")
        expected = {}
        for record in manifest["files"]:
            name = canonical_name(record["path"])
            if name == "release-manifest.json" or name in expected or record.get("mode") not in (0o644, 0o755):
                raise ValueError("Invalid or duplicate manifest record")
            if not re.fullmatch(r"[a-f0-9]{64}", record.get("sha256", "")):
                raise ValueError("Invalid manifest hash")
            exact = {
                "package.json", "package-lock.json", "shared/operator-signer.ts",
                "extensions/wtf-operator-signer/src/keyring.ts",
                "extensions/wtf-operator-signer/src/network.ts",
                "extensions/wtf-operator-signer/src/env.ts",
                "extensions/aleatory-provider/contract/artifacts/AleatoryProvider.json",
            }
            prefixes = tuple("extensions/aleatory-provider/" + part + "/" for part in ("src", "vendor", "ops"))
            if name not in exact and not name.startswith(prefixes):
                raise ValueError("File is outside the provider release allowlist")
            if any(part in ("node_modules", "secrets") or part == ".env" or part.startswith(".env.") for part in pathlib.PurePosixPath(name).parts):
                raise ValueError("Runtime credentials and dependencies cannot enter the source artifact")
            expected[name] = record
        if set(files) != set(expected) | {"release-manifest.json"}:
            raise ValueError("Archive file inventory differs from manifest")
        allowed_directories = {str(parent) for name in files for parent in pathlib.PurePosixPath(name).parents}
        if not directories.issubset(allowed_directories):
            raise ValueError("Unexpected archive directory")
        if set(files) & allowed_directories:
            raise ValueError("Archive file conflicts with a parent directory")
        for name, record in expected.items():
            digest = hashlib.sha256(archive.extractfile(files[name]).read()).hexdigest()
            if digest != record["sha256"]:
                raise ValueError("Release hash mismatch: " + name)
        if destination is not None:
            target = pathlib.Path(destination)
            if target.exists() and (target.is_symlink() or any(target.iterdir())):
                raise ValueError("Extraction destination must be an empty real directory")
            target.mkdir(parents=True, exist_ok=True)
            for name, member in files.items():
                output = target / name
                output.parent.mkdir(parents=True, exist_ok=True)
                with output.open("xb") as stream:
                    stream.write(archive.extractfile(member).read())
                output.chmod(expected.get(name, {"mode": 0o644})["mode"])
        return commit


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    parser.add_argument("--extract-to")
    args = parser.parse_args()
    try:
        print(verify_release(args.archive, args.extract_to))
    except (ValueError, KeyError, TypeError, OSError, tarfile.TarError) as error:
        raise SystemExit(str(error)) from None
