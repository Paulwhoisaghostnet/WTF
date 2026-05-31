# CRP Nominations — User Manual

The **CRP Nominations** app helps you nominate Tezos community members for the Tezos Commons Community Recognition Program (CRP). Nominations are stored on the wtfOS AT Protocol spine and can be shared on X and Bluesky.

## Opening the App

You can open CRP Nominations from:

- The **desktop icon** labeled **CRP**
- **Start Menu → Social → CRP Nominations**
- Direct URL: `/crp-nominate`

You must be signed in. If an admin has disabled the app, the launcher will be hidden until it is re-enabled.

## Step 1 — Find the Nominee

1. Enter a **Tezos wallet address**, **`.tez` domain**, **X handle**, or **Bluesky handle** in the search box.
2. Click **Find linked identity**.

The app merges public identity hints from Objkt, TzKT, Tezos Domains, tzprofiles, tz2at wallet links, tzbsky wallet proofs, and linked wtfOS profile data.

## Step 2 — Refine the Identity Bundle

If multiple wallets or social handles were found, pick the **exact combination** you want on the nomination record using the radio buttons.

Each bundle shows which sources contributed to the match.

## Step 3 — Choose a Category

Select one of the official **Tezos Commons CRP categories** (for example Tez Dev Award, Helping Hand, and others listed in the dropdown).

## Step 4 — Add Justification (Optional)

- **Summary:** a short note on why this person deserves the nomination
- **Proof links:** one URL per line (optional)

## Step 5 — Anonymous or Attributed

**Default (attributed):**

- Your nomination appears under **My nominations**
- A pointer is written to your wtfOS repo when you have one provisioned
- You can re-open share buttons later from My nominations

**Submit anonymously** (checkbox):

- The public CRP record does **not** include your username or profile link
- The nomination does **not** appear under My nominations
- No link is written to your personal wtfOS repo
- You still earn **anonymous nomination credits** toward rewards (count shown on the page)
- Share buttons appear **immediately after submit** — save or share then, because anonymous nominations cannot be looked up again later from My nominations

## Submit

Click **Submit nomination to wtfOS AppView**.

On success:

- The nomination is queued to the dedicated CRP AT repo
- A Bluesky-compatible share post is created in that same repo
- Share on **X** or **Bluesky** using the buttons shown after submit (or from My nominations for attributed submissions)

Bluesky share links use compose intent text plus the published post URL. wtfOS does not post to your Bluesky account automatically.

## My Nominations

The **My nominations** section lists nominations you submitted **without** anonymous mode. Each card shows:

- Category and nominee summary
- Optional justification
- Bluesky record link (when indexed)
- **Share on X** / **Share on Bluesky** buttons

If you have anonymous credits, the page also shows: **Anonymous nominations submitted: N**

## Sharing

Share buttons open a new tab with a pre-filled compose intent:

- **X:** `#TezosCRP` draft within character limits
- **Bluesky:** draft text plus the CRP repo’s published post URL for card preview

You control whether and when to publish the share post.

## Permissions and Privacy

| Mode | Who can see you nominated | Repo link to your profile |
|------|---------------------------|---------------------------|
| Attributed | Anyone reading your nomination record or My nominations | Yes, when wtfOS repo is provisioned |
| Anonymous | Nominee and category are public on the CRP repo; your identity is omitted | No |

Anonymous reward tracking stores **only** that you submitted a nomination — not who you nominated or which category. No submission timestamp is stored in that credit ledger.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Submit fails with repo error | Operator has not configured the CRP nominations AT repo yet |
| My nominations empty after attributed submit | AppView indexer still catching up; refresh after a minute |
| Share button disabled on old anonymous nomination | Anonymous nominations only expose share intents at submit time |
| App missing from desktop | Admin disabled the `crp-nominations` desktop gate |

## Related Programs

The legacy **#TezosCRP** X side quest (auto-verify from tweets) is separate from this AppView. This app produces structured AT records for the Tezos Commons nomination workflow on wtfOS.

For operator setup, see `docs/crp-nominations-builder.md`.
