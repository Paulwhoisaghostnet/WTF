import { useState, useEffect, useMemo } from "react";
import styled from "styled-components";
import {
  Window,
  WindowHeader,
  WindowContent,
  TextInput,
  Button,
  GroupBox,
} from "react95";
import { useLocation, useSearch, Redirect } from "wouter";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

const CenterWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
`;

const RegWindow = styled(Window)`
  width: 400px;
  max-width: calc(100vw - 24px);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ErrorMsg = styled.p`
  color: red;
  font-size: 12px;
  margin: 0;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
`;

const WalletBadge = styled.div`
  font-size: 11px;
  background: #e8e8e8;
  border: 1px solid #aaa;
  padding: 6px 8px;
  word-break: break-all;
  margin-top: 4px;
`;

export function Register() {
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, register, walletRegister } = useAuth();
  const [, setLocation] = useLocation();
  const rawSearch = useSearch();

  const walletParams = useMemo(() => {
    const params = new URLSearchParams(rawSearch);
    const wallet = params.get("wallet");
    const pk = params.get("pk");
    return wallet && pk ? { walletAddress: wallet, publicKey: pk } : null;
  }, [rawSearch]);

  const [walletSignature, setWalletSignature] = useState<{
    nonce: string;
    signature: string;
  } | null>(null);

  useEffect(() => {
    if (!walletParams) return;
    let cancelled = false;

    (async () => {
      try {
        const { nonce, message } = await api.post<{ nonce: string; message: string }>(
          "/api/auth/wallet/challenge",
          { walletAddress: walletParams.walletAddress }
        );
        const tezos = await import("../lib/tezos");
        const { signature } = await tezos.signPayload(message);
        if (!cancelled) {
          setWalletSignature({ nonce, signature });
        }
      } catch (err) {
        console.warn("Failed to pre-sign wallet challenge for registration:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [walletParams]);

  if (user) return <Redirect to="/dashboard" />;

  const isWalletFlow = !!walletParams;

  const update = (field: string) => (e: any) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isWalletFlow && form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!isWalletFlow && form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      if (isWalletFlow && walletSignature) {
        await walletRegister({
          walletAddress: walletParams!.walletAddress,
          publicKey: walletParams!.publicKey,
          signature: walletSignature.signature,
          nonce: walletSignature.nonce,
          username: form.username,
          password: form.password || undefined,
        });
      } else {
        await register({
          username: form.username,
          password: form.password,
        });
      }
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <CenterWrapper>
      <RegWindow>
        <WindowHeader>
          <span>Register - WTF Gameshow</span>
        </WindowHeader>
        <WindowContent>
          <Form onSubmit={handleSubmit}>
            {isWalletFlow && (
              <GroupBox label="Linked Wallet">
                <WalletBadge>{walletParams!.walletAddress}</WalletBadge>
                <p style={{ fontSize: 11, margin: "6px 0 0" }}>
                  This wallet will be automatically linked to your new account.
                </p>
              </GroupBox>
            )}

            <GroupBox label="Account">
              <Field>
                <label>Username *</label>
                <TextInput
                  value={form.username}
                  onChange={update("username")}
                  placeholder="3-50 characters"
                  fullWidth
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                />
              </Field>
              <p style={{ fontSize: 11, margin: "8px 0 0 0" }}>
                Email and social accounts are configured later in your Profile.
              </p>
            </GroupBox>

            <GroupBox label={isWalletFlow ? "Password (optional)" : "Password"}>
              <Field>
                <label>{isWalletFlow ? "Password" : "Password *"}</label>
                <TextInput
                  type="password"
                  value={form.password}
                  onChange={update("password")}
                  placeholder={isWalletFlow ? "Optional - for username/password login" : "Min 6 characters"}
                  fullWidth
                  autoComplete="new-password"
                />
              </Field>
              {(!isWalletFlow || form.password) && (
                <Field style={{ marginTop: 8 }}>
                  <label>Confirm Password {!isWalletFlow && "*"}</label>
                  <TextInput
                    type="password"
                    value={form.confirmPassword}
                    onChange={update("confirmPassword")}
                    fullWidth
                    autoComplete="new-password"
                  />
                </Field>
              )}
            </GroupBox>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <ButtonRow>
              <Button type="button" onClick={() => setLocation("/login")}>
                Back to Login
              </Button>
              <Button
                type="submit"
                disabled={loading || (isWalletFlow && !walletSignature)}
              >
                {loading ? "Creating..." : "Register"}
              </Button>
            </ButtonRow>
          </Form>
        </WindowContent>
      </RegWindow>
    </CenterWrapper>
  );
}
