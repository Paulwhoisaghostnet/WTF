import { useState } from "react";
import { Button, GroupBox, ProgressBar, TextInput, Checkbox } from "react95";
import styled from "styled-components";
import { useConnectPorcupin, usePorcupinEligibility } from "./usePorcupin";
import { useWallet } from "../../lib/wallet-context";

const TOTAL_STEPS = 7;

const STEP_TITLES = [
  "Welcome to Porcupin",
  "What is Porcupin?",
  "Connect Your Wallet",
  "Premium Eligibility",
  "Configure Connection",
  "Review & Confirm",
  "Complete",
];

interface Props {
  onComplete?: () => void;
}

export function PorcupinSetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [agreed, setAgreed] = useState(false);
  const { address, connect } = useWallet();
  const eligibilityQ = usePorcupinEligibility();
  const connectMut = useConnectPorcupin();

  const progress = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleConnect = async () => {
    if (!remoteUrl || !authToken) return;
    await connectMut.mutateAsync({ remoteUrl, authToken });
    next();
  };

  const handleFinish = () => {
    onComplete?.();
  };

  return (
    <WizardWrap>
      <StepHeader>
        <StepTitle>{STEP_TITLES[step]}</StepTitle>
        <StepCounter>Step {step + 1} of {TOTAL_STEPS}</StepCounter>
      </StepHeader>

      <ProgressBar value={progress} />

      <StepBody>
        {step === 0 && (
          <StepContent>
            <WelcomeArt>🦔</WelcomeArt>
            <p>Porcupin is your self-hosted pinning service companion for the WTF OS.</p>
            <p>This wizard will help you link your Porcupin instance and verify premium eligibility.</p>
            <p style={{ fontSize: 10, color: "#555" }}>
              Powered by skllzrmy / FAFOlab
            </p>
          </StepContent>
        )}

        {step === 1 && (
          <StepContent>
            <h4>How Porcupin Works</h4>
            <ul>
              <li>Run your own Porcupin instance on any server</li>
              <li>Connect it here using your instance URL and an auth token</li>
              <li>WTF OS acts as a dashboard and proxy for your pins</li>
              <li>Premium features require 3 gates: WTF balance, membership card, and active dues</li>
            </ul>
          </StepContent>
        )}

        {step === 2 && (
          <StepContent>
            <h4>Connect Your Tezos Wallet</h4>
            {address ? (
              <ConnectedBadge>
                ✓ Connected: {address.slice(0, 8)}…{address.slice(-4)}
              </ConnectedBadge>
            ) : (
              <>
                <p>A Tezos wallet is required to verify your WTF token balance.</p>
                <Button onClick={() => connect()}>Connect Wallet</Button>
              </>
            )}
          </StepContent>
        )}

        {step === 3 && (
          <StepContent>
            <h4>Premium Eligibility Check</h4>
            {eligibilityQ.isLoading ? (
              <p>Checking eligibility…</p>
            ) : eligibilityQ.data ? (
              <GroupBox label="Gate Status">
                <GateList>
                  <GateItem $ok={eligibilityQ.data.wtfBalanceOk}>
                    {eligibilityQ.data.wtfBalanceOk ? "✓" : "✗"} 10,000+ WTF balance
                    {!eligibilityQ.data.wtfBalanceOk && (
                      <GateNote>Current: {eligibilityQ.data.wtfBalance.toLocaleString()} WTF</GateNote>
                    )}
                  </GateItem>
                  <GateItem $ok={eligibilityQ.data.membershipCardOk}>
                    {eligibilityQ.data.membershipCardOk ? "✓" : "✗"} WTF AutoPin Membership Card
                  </GateItem>
                  <GateItem $ok={eligibilityQ.data.duesActiveOk}>
                    {eligibilityQ.data.duesActiveOk ? "✓" : "✗"} Active Club Dues
                  </GateItem>
                </GateList>
                {eligibilityQ.data.eligible ? (
                  <EligibleBadge>🎉 Eligible for Premium!</EligibleBadge>
                ) : (
                  <IneligibleNote>
                    {eligibilityQ.data.notes.map((n, i) => <div key={i}>• {n}</div>)}
                  </IneligibleNote>
                )}
              </GroupBox>
            ) : null}
          </StepContent>
        )}

        {step === 4 && (
          <StepContent>
            <h4>Configure Your Porcupin Instance</h4>
            <FieldWrap>
              <label>Instance URL</label>
              <TextInput
                value={remoteUrl}
                onChange={(e) => setRemoteUrl((e.target as HTMLInputElement).value)}
                placeholder="https://porcupin.yourdomain.com"
                style={{ width: "100%" }}
              />
            </FieldWrap>
            <FieldWrap>
              <label>Auth Token</label>
              <TextInput
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken((e.target as HTMLInputElement).value)}
                placeholder="Your Porcupin API token"
                style={{ width: "100%" }}
              />
            </FieldWrap>
          </StepContent>
        )}

        {step === 5 && (
          <StepContent>
            <h4>Review</h4>
            <ReviewTable>
              <tbody>
                <tr><td>Instance URL</td><td>{remoteUrl || "(not set)"}</td></tr>
                <tr><td>Token</td><td>{authToken ? "•••••••" : "(not set)"}</td></tr>
                <tr><td>Wallet</td><td>{address ? `${address.slice(0, 8)}…` : "Not connected"}</td></tr>
                <tr><td>Premium</td><td>{eligibilityQ.data?.eligible ? "Eligible" : "Not eligible"}</td></tr>
              </tbody>
            </ReviewTable>
            <Checkbox
              label="I understand this connects my Porcupin instance to WTF OS"
              checked={agreed}
              onChange={() => setAgreed(!agreed)}
            />
          </StepContent>
        )}

        {step === 6 && (
          <StepContent>
            <WelcomeArt>✅</WelcomeArt>
            <h4>Setup Complete!</h4>
            <p>Your Porcupin instance has been connected. You can now manage it from the Porcupin Dashboard.</p>
          </StepContent>
        )}
      </StepBody>

      <NavBar>
        <Button onClick={back} disabled={step === 0}>← Back</Button>
        {step < 4 && (
          <Button onClick={next}>Next →</Button>
        )}
        {step === 4 && (
          <Button
            onClick={handleConnect}
            disabled={!remoteUrl || !authToken || connectMut.isPending}
          >
            {connectMut.isPending ? "Connecting…" : "Connect →"}
          </Button>
        )}
        {step === 5 && (
          <Button onClick={next} disabled={!agreed || !remoteUrl}>Confirm →</Button>
        )}
        {step === 6 && (
          <Button onClick={handleFinish}>Open Dashboard</Button>
        )}
      </NavBar>
    </WizardWrap>
  );
}

const WizardWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  min-height: 360px;
`;

const StepHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const StepTitle = styled.h3`
  margin: 0;
  font-size: 14px;
`;

const StepCounter = styled.span`
  font-size: 10px;
  color: #555;
`;

const StepBody = styled.div`
  flex: 1;
  padding: 8px;
  border: 2px inset #dfdfdf;
  background: #f4f4f4;
`;

const StepContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;

  h4 { margin: 0 0 6px; font-size: 13px; }
  ul { margin: 0; padding-left: 16px; line-height: 1.6; }
  p { margin: 0; }
`;

const WelcomeArt = styled.div`
  font-size: 48px;
  text-align: center;
  padding: 8px;
`;

const ConnectedBadge = styled.div`
  background: #c8ecc8;
  border: 1px solid #008000;
  padding: 6px 10px;
  font-size: 11px;
`;

const GateList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const GateItem = styled.div<{ $ok: boolean }>`
  font-size: 11px;
  color: ${(p) => (p.$ok ? "#006600" : "#aa0000")};
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const GateNote = styled.span`
  font-size: 10px;
  color: #555;
  padding-left: 14px;
`;

const EligibleBadge = styled.div`
  margin-top: 8px;
  background: #c8ecc8;
  border: 1px solid #008000;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: bold;
`;

const IneligibleNote = styled.div`
  margin-top: 8px;
  background: #fce8e8;
  border: 1px solid #cc0000;
  padding: 6px 10px;
  font-size: 10px;
  color: #880000;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const FieldWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  label { font-size: 11px; font-weight: bold; }
`;

const ReviewTable = styled.table`
  width: 100%;
  font-size: 11px;
  border-collapse: collapse;

  td {
    padding: 3px 6px;
    border-bottom: 1px solid #dfdfdf;
  }
  td:first-child {
    font-weight: bold;
    color: #555;
    width: 120px;
  }
`;

const NavBar = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;
