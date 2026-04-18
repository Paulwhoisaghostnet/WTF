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

const CenterWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
`;

const LoginWindow = styled(Window)`
  width: 360px;
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

const WalletInfo = styled.p`
  font-size: 11px;
  margin: 4px 0 0;
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

  if (user) return <Redirect to="/dashboard" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      setLocation("/dashboard");
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
        setLocation("/dashboard");
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
    <CenterWrapper>
      <LoginWindow>
        <WindowHeader>
          <span>Log In - WTF Gameshow</span>
        </WindowHeader>
        <WindowContent>
          <Form onSubmit={handleSubmit}>
            <GroupBox label="Credentials">
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
                Register
              </Button>
              <Button type="submit" disabled={loading || walletLoading}>
                {loading ? "Logging in..." : "Log In"}
              </Button>
            </ButtonRow>

            <Separator />

            <Button
              type="button"
              fullWidth
              disabled={walletLoading || loading}
              onClick={handleWalletLogin}
            >
              {walletLoading ? "Connecting..." : "Connect Wallet"}
            </Button>
            <WalletInfo>
              Sign in with your Tezos wallet. If no account is linked, you'll be
              asked to pick a username.
            </WalletInfo>
          </Form>
        </WindowContent>
      </LoginWindow>
    </CenterWrapper>
  );
}
