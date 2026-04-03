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
import { useAuth } from "../lib/auth-context";
import { useWallet } from "../lib/wallet-context";
import { api } from "../lib/api";

const Section = styled(GroupBox)`
  margin-bottom: 12px;
`;

const Field = styled.div`
  margin-bottom: 8px;
`;

export function Profile() {
  const { user } = useAuth();
  const { address } = useWallet();
  const qc = useQueryClient();
  const [linkAddress, setLinkAddress] = useState("");

  const { data: wallets } = useQuery({
    queryKey: ["wallets"],
    queryFn: () => api.get<any[]>("/api/wallets"),
  });

  const linkMutation = useMutation({
    mutationFn: (walletAddress: string) =>
      api.post("/api/wallets", { walletAddress }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      setLinkAddress("");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/wallets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
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
                <TableHeadCell>Primary</TableHeadCell>
                <TableHeadCell>Actions</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wallets.map((w: any) => (
                <TableRow key={w.id}>
                  <TableDataCell style={{ fontFamily: "monospace", fontSize: 10 }}>
                    {w.walletAddress.slice(0, 10)}...{w.walletAddress.slice(-6)}
                  </TableDataCell>
                  <TableDataCell>{w.tezDomain || "---"}</TableDataCell>
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
    </AppWindow>
  );
}
