import { useState } from "react";
import styled from "styled-components";
import {
  Window,
  WindowHeader,
  WindowContent,
  TextInput,
  Button,
  GroupBox,
  Separator,
} from "react95";
import { useLocation, Redirect } from "wouter";
import { useAuth } from "../lib/auth-context";
import { AuthScreenShell } from "../components/layout/AuthScreenShell";
import { WTFOS_PLATFORM_NAME } from "@shared/platform-branding";

const CenterWrapper = styled.div`
  display: grid;
  place-items: center;
  flex: 1;
  padding: 18px;
`;

const LoginWindow = styled(Window)`
  width: min(430px, calc(100vw - 28px));
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  background: #efefef;
  border: 2px inset #fff;
  font-size: var(--wtf-type-caption, 13px);
`;

const StatusLamp = styled.span<{ $active?: boolean }>`
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border: 1px solid #101010;
  background: ${(p) => (p.$active ? "#00a000" : "#808080")};
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.75);
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

const WalletInfo = styled.p`
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;
  margin: 6px 0 0;
  color: #555;
`;

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const { user, login, walletLogin } = useAuth();
  const [, setLocation] = useLocation();

  if (user) return <Redirect to="/" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      setLocation("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWalletLogin = async () => {
    setError("");
    setWalletLoading(true);
    try {
      const result = await walletLogin();
      if (result.action === "login") {
        setLocation("/", { replace: true });
      } else {
        const params = new URLSearchParams({
          wallet: result.walletAddress || "",
          pk: result.publicKey || "",
        });
        setLocation(`/register?${params.toString()}`);
      }
    } catch (err: any) {
      setError(err.message || "Wallet login failed");
    } finally {
      setWalletLoading(false);
    }
  };

  return (
    <AuthScreenShell documentTitle={`Sign in - ${WTFOS_PLATFORM_NAME}`}>
      <CenterWrapper>
        <LoginWindow>
          <WindowHeader>
            <span>{WTFOS_PLATFORM_NAME} - Sign In</span>
          </WindowHeader>
          <WindowContent>
            <Intro>
              <Title>Welcome back</Title>
              <Copy>
                Sign in once, then you will land on the desktop. New account
                welcomes and daily GM messages appear there when they are due.
              </Copy>
            <StatusStrip aria-live="polite">
              <span>{loading || walletLoading ? "Opening desktop..." : "Desktop ready"}</span>
              <StatusLamp $active={loading || walletLoading} aria-hidden="true" />
            </StatusStrip>
          </Intro>
          <Form onSubmit={handleSubmit}>
            <GroupBox label="Account password">
              <Field>
                <label>Username</label>
                <TextInput
                  value={username}
                  onChange={(e: any) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  fullWidth
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  autoFocus
                />
              </Field>
              <Field style={{ marginTop: 8 }}>
                <label>Password</label>
                <TextInput
                  type="password"
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  fullWidth
                  autoComplete="current-password"
                />
              </Field>
            </GroupBox>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <ButtonRow>
              <Button
                type="button"
                onClick={() => setLocation("/register")}
              >
                Create Account
              </Button>
              <Button type="submit" disabled={loading || walletLoading}>
                {loading ? "Opening..." : "Log In"}
              </Button>
            </ButtonRow>

            <Separator />

            <GroupBox label="Wallet sign in">
              <Button
                type="button"
                fullWidth
                disabled={walletLoading || loading}
                onClick={handleWalletLogin}
              >
                {walletLoading ? "Connecting..." : "Connect Tezos Wallet"}
              </Button>
              <WalletInfo>
                If this wallet is new here, {WTFOS_PLATFORM_NAME} will ask for a username and
                finish account setup.
              </WalletInfo>
            </GroupBox>
          </Form>
        </WindowContent>
      </LoginWindow>
    </CenterWrapper>
    </AuthScreenShell>
  );
}
