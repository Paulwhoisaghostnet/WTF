# DMS 16 supplies the Dovecot 2.4 configuration migration. Its September image
# predates the Debian security updates below, so the upstream tag alone is not
# the security boundary. See SECURITY-UPGRADE.md for vendor/package evidence.
FROM ghcr.io/docker-mailserver/docker-mailserver:16.0.1@sha256:d0fe7668defe157aad57ea31b1707ad1e2fb57d7a91bdf17cbdf876549946c86

USER root
RUN set -eu; \
    dpkg-query -W -f='${binary:Package} ${source:Package}\n' \
      | awk '$2 == "dovecot" { print $1 "=1:2.4.1+dfsg1-6+deb13u7" } \
             $2 == "brotli" { print $1 "=1.1.0-2+deb13u1" } \
             $2 == "openssl" { print $1 "=3.5.7-1~deb13u3" } \
             $2 == "ca-certificates" { print $1 "=20250419+deb13u1" }' \
      > /tmp/wtfos-mail-security-packages; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive xargs -r apt-get install -y --no-remove --no-install-recommends \
      < /tmp/wtfos-mail-security-packages; \
    while IFS='=' read -r package version; do \
      test "$(dpkg-query -W -f='${Version}' "$package")" = "$version"; \
    done < /tmp/wtfos-mail-security-packages; \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' dovecot-core)" ge '1:2.4.1+dfsg1-6+deb13u7'; \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libbrotli1)" ge '1.1.0-2+deb13u1'; \
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' openssl)" ge '3.5.7-1~deb13u3'; \
    install -m 0644 /tmp/wtfos-mail-security-packages /usr/local/share/wtfos-mail-security-packages; \
    rm /tmp/wtfos-mail-security-packages; \
    rm -rf /var/lib/apt/lists/*
