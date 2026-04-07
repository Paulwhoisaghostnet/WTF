import { useState } from "react";
import styled from "styled-components";
import {
  Window,
  WindowHeader,
  WindowContent,
  TextInput,
  Button,
  GroupBox,
} from "react95";
import { useLocation, Redirect } from "wouter";
import { useAuth } from "../lib/auth-context";

const CenterWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
`;

const RegWindow = styled(Window)`
  width: 400px;
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

export function Register() {
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, register } = useAuth();
  const [, setLocation] = useLocation();

  if (user) return <Redirect to="/dashboard" />;

  const update = (field: string) => (e: any) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await register({
        username: form.username,
        password: form.password,
      });
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

            <GroupBox label="Password">
              <Field>
                <label>Password *</label>
                <TextInput
                  type="password"
                  value={form.password}
                  onChange={update("password")}
                  placeholder="Min 6 characters"
                  fullWidth
                  autoComplete="new-password"
                />
              </Field>
              <Field style={{ marginTop: 8 }}>
                <label>Confirm Password *</label>
                <TextInput
                  type="password"
                  value={form.confirmPassword}
                  onChange={update("confirmPassword")}
                  fullWidth
                  autoComplete="new-password"
                />
              </Field>
            </GroupBox>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <ButtonRow>
              <Button type="button" onClick={() => setLocation("/login")}>
                Back to Login
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Register"}
              </Button>
            </ButtonRow>
          </Form>
        </WindowContent>
      </RegWindow>
    </CenterWrapper>
  );
}
