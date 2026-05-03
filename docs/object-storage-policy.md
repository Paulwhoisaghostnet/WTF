# Object Storage Policy

WTF uses Hetzner Object Storage as the durable source-of-record for large media originals.

## Limit

Internal cap: 969 GiB = `1040450734080` bytes.

Thresholds:

- 80% warning: `832360587264`
- 90% warning: `936405660672`
- 95% upload protection: `988428527616`
- Hard block before `1040450734080`

## Worker Behavior

The `object-storage-usage-check` job runs every 24 hours.

It tries to list the S3 bucket and sum object sizes. If listing fails, it falls back to DB accounting from `user_media_library.file_size_bytes` for rows with `object_storage_bucket`.

Results are stored in `object_storage_usage_checks` and exposed at:

- `GET /api/admin/storage/status`
- `POST /api/admin/storage/object-usage-check`

## Upload Protection

When the latest usage check is at 95% or higher, non-critical media uploads return HTTP 507 and do not upload to Object Storage. Incoming uploads that would cross the hard limit are also blocked.

## Key Convention

`media/users/{ownerUserId}/{yyyy}/{mm}/{mediaId}-{sha12}-{safeFilename}`

Keys never contain path traversal segments and retain original filenames separately in DB.

