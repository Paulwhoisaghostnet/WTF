// These hosts are served directly by Caddy, outside the app's PAGE_DEFS routes.
export const PUBLIC_STATIC_HOSTS = [
  {
    hostname: "adrift.wtfos.app",
    mountSource: "${WTFOS_ADRIFT_DEMO_HOST_DIR:-./demos/adrift}",
    mountTarget: "/srv/demos/adrift",
    interactionHandle: "art_demo.adrift.viewed",
  },
  {
    hostname: "bts.wtfos.app",
    mountSource: "${WTFOS_BTS_DEMO_HOST_DIR:-./demos/bts}",
    mountTarget: "/srv/demos/bts",
    interactionHandle: "art_demo.bts.viewed",
  },
];
