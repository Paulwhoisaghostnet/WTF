import { Anchor, Button, GroupBox } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";

const Copy = styled.div`
  font-size: 13px;
  line-height: 1.55;

  h2 {
    font-size: 15px;
    margin: 14px 0 6px;
  }

  p {
    margin: 0 0 8px;
  }

  ul {
    margin: 0 0 10px 18px;
    padding: 0;
  }
`;

const UrlBox = styled.code`
  display: block;
  padding: 6px;
  margin: 6px 0 10px;
  background: #fff;
  border: 1px inset #c0c0c0;
  color: #000080;
  word-break: break-all;
`;

import { WTFOS_PLATFORM_ORIGIN } from "@shared/platform-branding";

const PUBLIC_SITE = WTFOS_PLATFORM_ORIGIN;

export function DiscordTerms() {
  return (
    <AppWindow title="WTF Discord Terms">
      <Copy>
        <GroupBox label="WTF Gameshow Discord Terms of Service">
          <p>
            These terms cover the WTF Gameshow Discord application, including
            the Dicksword microapp, account linking, proof codes, slash
            commands, event mirrors, attendance signals, avatar layers, and
            future Discord role sync.
          </p>
          <h2>Acceptable Use</h2>
          <ul>
            <li>Do not use the bot or server to harass, spam, scam, or impersonate others.</li>
            <li>Do not submit malicious links, wallet-draining prompts, or misleading Tezos offers.</li>
            <li>Do not attempt to bypass role, XP, proof-code, or attendance controls.</li>
          </ul>
          <h2>Account Linking</h2>
          <p>
            Linking Discord to WTF is optional. Users may link by Discord OAuth
            or by a short-lived proof code shown inside Dicksword. Staff may
            review disputed links or revoke mappings that are abusive or wrong.
          </p>
          <h2>Game Signals</h2>
          <p>
            Discord activity may create WTF game signals such as attendance,
            XP-ready events, avatar selections, event participation, lottery
            entries, or auction activity. Final scoring and rewards remain
            subject to WTF Gameshow rules and host review.
          </p>
          <h2>Availability</h2>
          <p>
            The Discord application is provided as part of WTF Gameshow and may
            be changed, paused, rate-limited, or disabled when needed for safety,
            maintenance, or platform compliance.
          </p>
        </GroupBox>
      </Copy>
    </AppWindow>
  );
}

export function DiscordPrivacy() {
  return (
    <AppWindow title="WTF Discord Privacy">
      <Copy>
        <GroupBox label="WTF Gameshow Discord Privacy Policy">
          <p>
            This policy describes data used by the WTF Gameshow Discord
            application and Dicksword microapp.
          </p>
          <h2>Data We Store</h2>
          <ul>
            <li>Discord user ID, username/tag, guild ID, channel/event IDs, and link status.</li>
            <li>Proof-code claim records, timestamps, and whether the claim succeeded or expired.</li>
            <li>Discord activity signals needed for attendance, XP, event mirrors, and moderation review.</li>
            <li>Avatar layer selections and role mapping metadata configured by WTF staff.</li>
          </ul>
          <h2>Data We Do Not Need</h2>
          <p>
            The bot does not need wallet private keys, seed phrases, payment
            credentials, or Discord passwords. Never provide those to WTF staff,
            bots, or other users.
          </p>
          <h2>How Data Is Used</h2>
          <p>
            Data is used to link Discord participation to WTF accounts, mirror
            gameshow events, prepare XP and role sync, support avatars, and keep
            audit trails for host/admin review.
          </p>
          <h2>Retention And Removal</h2>
          <p>
            Users can disconnect Discord in their WTF profile. Staff may retain
            limited audit records where needed for abuse prevention, game
            integrity, or operational debugging.
          </p>
        </GroupBox>
      </Copy>
    </AppWindow>
  );
}

export function DiscordLinkedRoles() {
  return (
    <AppWindow title="WTF Discord Linked Roles">
      <Copy>
        <GroupBox label="Verify WTF Identity For Discord Roles">
          <p>
            Use Dicksword to connect your WTF account and Discord account.
            You can connect with Discord OAuth or generate a proof code and run
            <strong> /wtf prove &lt;code&gt;</strong> in the WTF Discord server.
          </p>
          <UrlBox>{PUBLIC_SITE}/dicksword</UrlBox>
          <p>
            Role sync is currently configured as a protected, dry-run-first
            process. Admin, host, cohost, and moderator roles are not changed
            unless WTF staff explicitly map and approve them.
          </p>
          <p>
            <Button onClick={() => window.location.assign("/dicksword")}>
              Open Dicksword
            </Button>{" "}
            <Anchor href="/api/auth/discord">Connect Discord OAuth</Anchor>
          </p>
        </GroupBox>
      </Copy>
    </AppWindow>
  );
}
