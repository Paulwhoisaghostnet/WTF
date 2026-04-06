import { useQuery } from "@tanstack/react-query";
import { GroupBox } from "react95";
import styled from "styled-components";
import { useRoute } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

const Section = styled(GroupBox)`
  margin-bottom: 12px;
`;

const Field = styled.div`
  margin-bottom: 8px;
  font-size: 12px;
`;

const PfpCircle = styled.div<{ $hasImage: boolean }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid #808080;
  background: ${(p) => (p.$hasImage ? "none" : "#c0c0c0")};
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const SocialLink = styled.a`
  color: #000080;
  text-decoration: underline;
  font-size: 12px;
`;

const VerifiedBadge = styled.span`
  background: #008000;
  color: #fff;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 2px;
  margin-left: 4px;
`;

interface PublicUser {
  id: number;
  username: string;
  displayName?: string;
  role: string;
  experiencePoints?: number;
  bio?: string;
  pfpImageUrl?: string;
  email?: string;
  twitterHandle?: string;
  twitterVerified?: boolean;
  discordHandle?: string;
  discordVerified?: boolean;
  wallets: string[];
  createdAt: string;
}

export function PublicProfile() {
  const [, params] = useRoute("/user/:username");
  const username = params?.username;

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => api.get<PublicUser>(`/api/users/${username}`),
    enabled: !!username,
  });

  if (isLoading) return <AppWindow title="Profile"><p>Loading...</p></AppWindow>;
  if (error || !profile)
    return <AppWindow title="Profile"><p>User not found.</p></AppWindow>;

  return (
    <AppWindow title={`${profile.displayName || profile.username}'s Profile`}>
      <Section label="About">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <PfpCircle $hasImage={!!profile.pfpImageUrl}>
            {profile.pfpImageUrl ? (
              <img src={profile.pfpImageUrl} alt="pfp" />
            ) : (
              <span style={{ fontSize: 10, color: "#555" }}>No PFP</span>
            )}
          </PfpCircle>
          <div>
            <Field>
              <strong>Username:</strong> {profile.username}
            </Field>
            {profile.displayName && (
              <Field>
                <strong>Display Name:</strong> {profile.displayName}
              </Field>
            )}
            <Field>
              <strong>Role:</strong> {profile.role}
            </Field>
            <Field>
              <strong>XP:</strong> {profile.experiencePoints ?? 0}
            </Field>
            <Field>
              <strong>Member since:</strong>{" "}
              {new Date(profile.createdAt).toLocaleDateString()}
            </Field>
            {profile.bio && (
              <Field>
                <strong>Bio:</strong> {profile.bio}
              </Field>
            )}
          </div>
        </div>
      </Section>

      {(profile.email || profile.twitterHandle || profile.discordHandle) && (
        <Section label="Contact & Social">
          {profile.email && (
            <Field>
              <strong>Email:</strong>{" "}
              <SocialLink href={`mailto:${profile.email}`}>
                {profile.email}
              </SocialLink>
            </Field>
          )}
          {profile.twitterHandle && (
            <Field>
              <strong>Twitter:</strong>{" "}
              <SocialLink
                href={`https://twitter.com/${profile.twitterHandle}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                @{profile.twitterHandle}
              </SocialLink>
              {profile.twitterVerified && <VerifiedBadge>Verified</VerifiedBadge>}
            </Field>
          )}
          {profile.discordHandle && (
            <Field>
              <strong>Discord:</strong> {profile.discordHandle}
              {profile.discordVerified && (
                <VerifiedBadge>Verified</VerifiedBadge>
              )}
            </Field>
          )}
        </Section>
      )}

      {profile.wallets.length > 0 && (
        <Section label="Wallets">
          {profile.wallets.map((w) => (
            <Field key={w}>
              <a
                href={`https://tzkt.io/${w}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "monospace", fontSize: 11, color: "#000080" }}
              >
                {w}
              </a>
            </Field>
          ))}
        </Section>
      )}
    </AppWindow>
  );
}
