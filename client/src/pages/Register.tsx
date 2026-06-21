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
import { AuthScreenShell } from "../components/layout/AuthScreenShell";
import { WTFOS_PLATFORM_NAME } from "@shared/platform-branding";

const CenterWrapper = styled.div`
  display: grid;
  place-items: center;
  flex: 1;
  padding: 18px;
`;

const RegWindow = styled(Window)`
  width: min(460px, calc(100vw - 28px));
  max-width: calc(100vw - 24px);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Intro = styled.div`
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: var(--wtf-type-title, 18px);
  line-height: 1.15;
`;

const Copy = styled.p`
  margin: 0;
  font-size: var(--wtf-type-body, 14px);
  line-height: 1.45;
`;

const StatusStrip = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  background: #efefef;
  border: 2px inset #fff;
  font-size: var(--wtf-type-caption, 13px);
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ErrorMsg = styled.p`
  color: #8b0000;
  font-size: var(--wtf-type-body, 14px);
  margin: 0;
  padding: 7px 8px;
  background: #fff4f4;
  border: 2px inset #fff;
`;

const ButtonRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
`;

const WalletBadge = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  background: #e8e8e8;
  border: 2px inset #fff;
  padding: 6px 8px;
  word-break: break-all;
  margin-top: 4px;
`;

const Hint = styled.p`
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
  margin: 8px 0 0 0;
  color: #555;
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
        const { signature } = await tezos.signAuthPayload(message);
        if (!cancelled) {
          setWalletSignature({ nonce, signature });
        }
      } catch (err) {
        console.warn("Failed to pre-sign wallet challenge for registration:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [walletParams]);

  if (user) return <Redirect to="/" />;

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
    if (!isWalletFlow && form.password.length < 8) {
      setError("Password must be at least 8 characters");
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
      setLocation("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell documentTitle={`Create account - ${WTFOS_PLATFORM_NAME}`}>
      <CenterWrapper>
        <RegWindow>
          <WindowHeader>
            <span>{WTFOS_PLATFORM_NAME} - Create Account</span>
          </WindowHeader>
          <WindowContent>
            <Intro>
              <Title>Set up your desktop</Title>
              <Copy>
                Pick a handle and we will take you straight into {WTFOS_PLATFORM_NAME}. Your
                first welcome message will appear on the desktop after the account
                is created.
              </Copy>
            <StatusStrip aria-live="polite">
              <span>{loading ? "Creating desktop session..." : "Account setup"}</span>
              <span>{isWalletFlow ? "Wallet flow" : "Password flow"}</span>
            </StatusStrip>
          </Intro>
          <Form onSubmit={handleSubmit}>
            {isWalletFlow && (
              <GroupBox label="Linked Wallet">
                <WalletBadge>{walletParams!.walletAddress}</WalletBadge>
                <Hint>
                  This wallet will be automatically linked to your new account.
                </Hint>
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
                  autoFocus
                />
              </Field>
              <Hint>
                Email and social accounts are configured later in your Profile.
              </Hint>
            </GroupBox>

            <GroupBox label={isWalletFlow ? "Password (optional)" : "Password"}>
              <Field>
                <label>{isWalletFlow ? "Password" : "Password *"}</label>
                <TextInput
                  type="password"
                  value={form.password}
                  onChange={update("password")}
                  placeholder={isWalletFlow ? "Optional - for username/password login" : "Min 8 characters"}
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
                {loading ? "Creating..." : "Create Account"}
              </Button>
            </ButtonRow>
          </Form>
        </WindowContent>
      </RegWindow>
    </CenterWrapper>
    </AuthScreenShell>
  );
}
