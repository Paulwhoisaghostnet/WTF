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

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, login } = useAuth();
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
              <Button type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Log In"}
              </Button>
            </ButtonRow>

            {process.env.GOOGLE_CLIENT_ID && (
              <>
                <Separator />
                <Button
                  type="button"
                  fullWidth
                  onClick={() =>
                    (window.location.href = "/api/auth/google")
                  }
                >
                  Sign in with Google
                </Button>
              </>
            )}
          </Form>
        </WindowContent>
      </LoginWindow>
    </CenterWrapper>
  );
}
