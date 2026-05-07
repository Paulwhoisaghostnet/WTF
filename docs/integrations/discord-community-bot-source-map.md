# Discord Community Bot Source Map

## Source

- `../building/Discord Bots`
- Python cogs are reference implementations only. WTF keeps one production Discord bot: `extensions/wtf-gameshow-bot`.

## Feature Targets

- `cogs/core_agent.py`, `cogs/leaderboard.py` -> `extensions/wtf-gameshow-bot/src/features/community-xp`
- `cogs/image_challenge_agent.py` -> `extensions/wtf-gameshow-bot/src/features/community-challenges`
- `cogs/trait_ideas_agent.py` -> `extensions/wtf-gameshow-bot/src/features/trait-ideas`
- Tezos verification command flows -> `extensions/wtf-gameshow-bot/src/features/tezos-verification`
- `cogs/dj_agent.py` -> `extensions/wtf-gameshow-bot/src/features/dj`

## Notes

- XP, challenge, and trait events now flow through the WTF signed bot webhook instead of a local SQLite bot database.
- `community-xp` mirrors Discord message/reaction XP and adds `/wtf rank`, `/wtf leaderboard`, and `/wtf levels`.
- `community-challenges` and `trait-ideas` record submissions/awards as signed WTF activity events.
- Tezos verification intentionally routes users back through WTF identity and wallet APIs.
- DJ is kept as a disabled feature module. Heavy voice/music dependencies were not imported.
