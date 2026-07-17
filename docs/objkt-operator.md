# Objkt Operator on wtfOS

Objkt Operator is a private wtfOS application for the configured owner account.
Open it from the wtfOS desktop icon or Start > Admin > Objkt Operator, or use
`/objkt-operator` directly on the deployed wtfOS origin.

The app state is stored in the `objkt_operator_states` Postgres table. Creator
reviews, score breakdowns, buy policy, market scans, signing queue, wallet
address, Kukai/Objkt tab checkpoints, and operator events survive browser
restarts and server restarts. The browser is only the control surface; it is
not the state store.

## Deployment checklist

Set `OBJKT_OPERATOR_OWNER_USERNAMES` to the comma-separated username allowlist.
The default is `wtf-admin`, but production should set this explicitly. Run the
normal WTF database migration process so `drizzle/0114_objkt_operator_state.sql`
is installed, then deploy the normal wtfOS service.

The access probe is read-only and owner-gated. The state and mutation routes
remain behind the same owner check, so an administrator who is not on the
allowlist cannot use the app even if they know the route.

## Wallet boundary

Kukai remains an external signing tab. wtfOS records the signing workflow and
operation hash, but does not store a seed phrase or private key in Postgres,
browser storage, or an environment file.

The old standalone `collekt-wtf` `/operator` page is a development surface.
Use the native `/objkt-operator` app for the persistent 24/7 workflow.
