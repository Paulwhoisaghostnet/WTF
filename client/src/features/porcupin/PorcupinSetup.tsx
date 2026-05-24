import { useState, type ReactElement } from "react";
import { Button, GroupBox, TextInput } from "react95";
import styled from "styled-components";
import { usePorcupinRemote } from "./usePorcupinRemote";

const Stack = styled.div`
  display: grid;
  gap: 12px;
  padding: 8px;
`;

const STEPS = [
  "What is Porcupin?",
  "Choose platform",
  "Install",
  "Configure wallets",
  "Enable remote access",
  "Connect to WTF",
  "Live",
] as const;

export function PorcupinSetup(): ReactElement {
  const [step, setStep] = useState(0);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const { connectM, statusQ } = usePorcupinRemote();

  return (
    <Stack>
      <p style={{ margin: 0, fontSize: 11 }}>
        Powered by Porcupin — Created by <a href="/user/skllzrmy">skllzrmy</a> (FAFOlab).
        WTF guides setup for <strong>your</strong> node; platform-wide pinning is premium-gated.
      </p>
      <GroupBox label={`Setup — ${STEPS[step]}`}>
        <Stack>
          {step === 0 ? (
            <p style={{ fontSize: 12 }}>
              Porcupin pins Tezos NFTs to your IPFS node. Download from porcupin.xyz, enable remote API, then connect here.
            </p>
          ) : null}
          {step === 1 ? (
            <ul style={{ fontSize: 11, margin: 0, paddingLeft: 18 }}>
              <li>macOS / Windows / Linux installers</li>
              <li>Docker: <code>docker pull porcupin/porcupin</code></li>
              <li>Raspberry Pi image (community)</li>
            </ul>
          ) : null}
          {step === 5 ? (
            <>
              <label style={{ fontSize: 12 }}>
                Remote URL
                <TextInput value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} />
              </label>
              <label style={{ fontSize: 12 }}>
                Auth token
                <TextInput value={authToken} onChange={(e) => setAuthToken(e.target.value)} type="password" />
              </label>
            </>
          ) : null}
          {step === 6 && statusQ.data ? (
            <pre style={{ fontSize: 10, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(statusQ.data, null, 2)}
            </pre>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <Button disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            {step < 5 ? (
              <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Next</Button>
            ) : step === 5 ? (
              <Button
                disabled={connectM.isPending}
                onClick={() =>
                  connectM.mutate(
                    { remoteUrl, authToken },
                    { onSuccess: () => setStep(6) }
                  )
                }
              >
                Connect
              </Button>
            ) : (
              <Button onClick={() => void statusQ.refetch()}>Check health</Button>
            )}
          </div>
        </Stack>
      </GroupBox>
    </Stack>
  );
}
