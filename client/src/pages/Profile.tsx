import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  TextInput,
  Separator,
  Table,
  TableHead,
  TableRow,
  TableHeadCell,
  TableDataCell,
  TableBody,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { WalletButton } from "../components/WalletButton";
import { OwnedTokensGallery } from "../components/OwnedTokensGallery";
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";

const Section = styled(GroupBox)`
  margin-bottom: 12px;
`;

const Field = styled.div`
  margin-bottom: 8px;
`;

const TokenCountBadge = styled.span`
  background: #000080;
  color: #fff;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: bold;
  border-radius: 2px;
`;

interface WalletWithCount {
  id: number;
  walletAddress: string;
  tezDomain?: string;
  isPrimary: boolean;
  tokenCount: number;
}

export function Profile() {
  const { user } = useAuth();
  const { address } = useWallet();
  const qc = useQueryClient();
  const [linkAddress, setLinkAddress] = useState("");

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletWithCount[]>("/api/wallets"),
  });

  const totalTokens =
    wallets?.reduce((sum, w) => sum + (w.tokenCount ?? 0), 0) ?? 0;

  const walletOptions =
    wallets?.map((w) => ({
      label: `${w.walletAddress.slice(0, 10)}...${w.walletAddress.slice(-6)}${w.tezDomain ? ` (${w.tezDomain})` : ""}${w.isPrimary ? " *" : ""} [${w.tokenCount}]`,
      value: w.walletAddress,
    })) ?? [];

  const linkMutation = useMutation({
    mutationFn: (walletAddress: string) =>
      api.post("/api/wallets", { walletAddress }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["profile-tokens"] });
      setLinkAddress("");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/wallets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["profile-tokens"] });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (id: number) => api.put(`/api/wallets/${id}/primary`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
  });

  const handleLinkWallet = () => {
    const addr = linkAddress.trim() || address;
    if (addr) linkMutation.mutate(addr);
  };

  return (
    <AppWindow title="My Profile">
      <Section label="Account Info">
        <Field>
          <strong>Username:</strong> {user?.username}
        </Field>
        <Field>
          <strong>Display Name:</strong> {user?.displayName || "Not set"}
        </Field>
        <Field>
          <strong>Email:</strong> {user?.email || "Not set"}
        </Field>
        <Field>
          <strong>Role:</strong> {user?.role}
        </Field>
        <Field>
          <strong>Member since:</strong>{" "}
          {user?.createdAt
            ? new Date(user.createdAt).toLocaleDateString()
            : "---"}
        </Field>
      </Section>

      <Section label="Connected Wallet">
        <WalletButton />
        {address && (
          <p style={{ fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>
            {address}
          </p>
        )}
      </Section>

      <Section label="Linked Wallets">
        <p style={{ fontSize: 12, marginBottom: 8 }}>
          Link your Tezos wallets to track your WTF balance and participate in
          the leaderboard.
        </p>

        {wallets && wallets.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Address</TableHeadCell>
                <TableHeadCell>Domain</TableHeadCell>
                <TableHeadCell>Tokens</TableHeadCell>
                <TableHeadCell>Primary</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wallets.map((w) => (
                <TableRow key={w.id}>
                  <TableDataCell
                    style={{ fontFamily: "monospace", fontSize: 10 }}
                  >
                    {w.walletAddress.slice(0, 10)}...
                    {w.walletAddress.slice(-6)}
                  </TableDataCell>
                  <TableDataCell>{w.tezDomain || "---"}</TableDataCell>
                  <TableDataCell>
                    <TokenCountBadge>{w.tokenCount}</TokenCountBadge>
                  </TableDataCell>
                  <TableDataCell>{w.isPrimary ? "Yes" : "No"}</TableDataCell>
                  <TableDataCell>
                    <div style={{ display: "flex", gap: 4 }}>
                      {!w.isPrimary && (
                        <Button
                          size="sm"
                          onClick={() => setPrimaryMutation.mutate(w.id)}
                        >
                          Set Primary
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => unlinkMutation.mutate(w.id)}
                      >
                        Unlink
                      </Button>
                    </div>
                  </TableDataCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Separator style={{ margin: "8px 0" }} />

        <div style={{ display: "flex", gap: 4 }}>
          <TextInput
            value={linkAddress}
            onChange={(e: any) => setLinkAddress(e.target.value)}
            placeholder={address || "tz1... wallet address"}
            fullWidth
          />
          <Button
            onClick={handleLinkWallet}
            disabled={linkMutation.isPending}
          >
            Link
          </Button>
          {address && !linkAddress && (
            <Button onClick={() => setLinkAddress(address)}>
              Use Connected
            </Button>
          )}
        </div>
      </Section>

      <Section
        label={`Owned Tokens${totalTokens > 0 ? ` (${totalTokens})` : ""}`}
      >
        <p style={{ fontSize: 11, marginBottom: 8, color: "#333" }}>
          Select tokens and click <strong>+ Trade Board</strong> to make them
          available for marketplace listings, auctions, and barter offers.
        </p>
        {wallets && wallets.length > 0 ? (
          <OwnedTokensGallery
            walletOptions={walletOptions}
            userWallets={wallets.map((w) => w.walletAddress)}
          />
        ) : (
          <p style={{ fontSize: 12 }}>
            Link a wallet above to view your owned tokens.
          </p>
        )}
      </Section>
    </AppWindow>
  );
}
