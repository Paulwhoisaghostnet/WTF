// These hosts are served directly by Caddy, outside the app's PAGE_DEFS routes.
export const PUBLIC_STATIC_HOSTS = [
  {
    hostname: "adrift.wtfos.app",
    sourceDir: "demos/adrift",
    mountSource: "${WTFOS_ADRIFT_DEMO_HOST_DIR:-./demos/adrift}",
    mountTarget: "/srv/demos/adrift",
    interactionHandle: "art_demo.adrift.viewed",
  },
  {
    hostname: "bts.wtfos.app",
    sourceDir: "demos/bts",
    mountSource: "${WTFOS_BTS_DEMO_HOST_DIR:-./demos/bts}",
    mountTarget: "/srv/demos/bts",
    interactionHandle: "art_demo.bts.viewed",
    exactPaths: [{ path: "/contact", file: "contact/index.html", interactionHandle: "art_demo.bts.contact_viewed" }],
    aspectPaths: {
      matcher: "@aspect path_regexp ^/(?:ar/)?[1-9][0-9]*x[1-9][0-9]*/?$",
      rewrite: "rewrite @aspect /index.html",
      examples: ["/ar/9x16", "/4x5", "/2x3"],
      interactionHandle: "art_demo.bts.aspect_viewed",
    },
  },
];
