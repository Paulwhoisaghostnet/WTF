import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import styled, { keyframes } from "styled-components";
import { loadGameFromZip, type GameBundle } from "../lib/zip-loader";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Cartridge = {
  id: string;
  title: string;
  description: string;
  mimeType: string;
  thumbnailUri: string | null;
  artifactUri: string;
  tokenContract: string;
  tokenId: string;
  isDemo: boolean;
};

/* ------------------------------------------------------------------ */
/*  Styled Components                                                  */
/* ------------------------------------------------------------------ */

const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  overflow: hidden;
`;

const Chassis = styled.div`
  width: 100%;
  max-width: 800px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #1e1e3a 0%, #12122a 60%, #0e0e22 100%);
  border: 2px solid #0a0a18;
  border-radius: 12px 12px 6px 6px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 4px 20px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  position: relative;
`;

const TopStrip = styled.div`
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: linear-gradient(180deg, #2a2a50 0%, #1e1e3a 100%);
  border-bottom: 2px solid #0a0a18;
  gap: 8px;
`;

const ConsoleName = styled.span`
  font-family: "Courier New", monospace;
  font-weight: bold;
  font-size: 14px;
  color: #7b8fff;
  letter-spacing: 3px;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(123, 143, 255, 0.4);
`;

const CartSlot = styled.div`
  margin-left: auto;
  width: 60px;
  height: 10px;
  background: #0a0a18;
  border-radius: 2px;
  border: 1px solid #2a2a50;
  position: relative;
  overflow: hidden;
`;

const CartSlotFill = styled.div<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  background: ${(p) =>
    p.$active
      ? "linear-gradient(90deg, #44ff88 0%, #00ccff 100%)"
      : "transparent"};
  transition: background 0.3s;
`;

const ScreenArea = styled.div`
  flex: 1;
  margin: 8px 12px;
  border-radius: 4px;
  overflow: hidden;
  background: #08081a;
  border: 2px solid #0a0a18;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
  position: relative;
  display: flex;
  flex-direction: column;
`;

const GameIframe = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
`;

const bootGlow = keyframes`
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
`;

const LoadingScreen = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #08081a;
  color: #7b8fff;
  font-family: "Courier New", monospace;
  z-index: 5;
`;

const LoadDot = styled.span`
  animation: ${bootGlow} 1.2s ease-in-out infinite;
  font-size: 24px;
`;

/* ── Library Screen ────────────────────────────────── */

const LibraryScreen = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const LibHeader = styled.div`
  padding: 12px 16px 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

const LibTitle = styled.h2`
  font-family: "Courier New", monospace;
  font-size: 16px;
  color: #7b8fff;
  letter-spacing: 2px;
  text-shadow: 0 0 6px rgba(123, 143, 255, 0.3);
  margin: 0;
`;

const TabBtn = styled.button<{ $active?: boolean }>`
  font-family: "Courier New", monospace;
  font-size: 11px;
  padding: 4px 10px;
  border: 1px solid ${(p) => (p.$active ? "#7b8fff" : "#2a2a50")};
  background: ${(p) => (p.$active ? "rgba(123,143,255,0.15)" : "transparent")};
  color: ${(p) => (p.$active ? "#aabbff" : "#555580")};
  cursor: pointer;
  border-radius: 3px;
  &:hover {
    border-color: #7b8fff;
  }
`;

const CartGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, 140px);
  justify-content: center;
  grid-auto-rows: min-content;
  gap: 10px;
  padding: 8px 16px 16px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2a50 #08081a;
`;

const CartCard = styled.div`
  width: 140px;
  border: 1px solid #2a2a50;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: linear-gradient(180deg, #16163a 0%, #10102a 100%);
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover {
    border-color: #7b8fff;
    box-shadow: 0 0 10px rgba(123, 143, 255, 0.2);
  }
`;

const CartArt = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 40%, #1a1a3e 0%, #0a0a1a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #1a1a3e;
`;

const CartArtImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
`;

const CartArtFallback = styled.div`
  font-size: 36px;
  opacity: 0.4;
`;

const CartTitle = styled.div`
  font-family: "Courier New", monospace;
  font-size: 11px;
  font-weight: bold;
  color: #aabbff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CartDesc = styled.div`
  font-family: "Courier New", monospace;
  font-size: 9px;
  color: #555580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DemoBadge = styled.span`
  font-family: "Courier New", monospace;
  font-size: 8px;
  color: #44ff88;
  letter-spacing: 1px;
  text-transform: uppercase;
`;

const EmptyMsg = styled.div`
  font-family: "Courier New", monospace;
  font-size: 13px;
  color: #555580;
  text-align: center;
  padding: 40px 20px;
`;

/* ── Control Bar ────────────────────────────────── */

const ControlBar = styled.div`
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 0 16px;
  background: linear-gradient(180deg, #1e1e3a 0%, #16163a 100%);
  border-top: 2px solid #0a0a18;
`;

const CtrlBtn = styled.button<{ $color?: string; $size?: string }>`
  width: ${(p) => (p.$size === "large" ? "48px" : "36px")};
  height: ${(p) => (p.$size === "large" ? "48px" : "36px")};
  border-radius: 50%;
  border: 2px solid #0a0a18;
  background: ${(p) => p.$color || "#2a2a50"};
  color: #fff;
  font-family: "Courier New", monospace;
  font-size: ${(p) => (p.$size === "large" ? "10px" : "8px")};
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    0 2px 4px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s;
  &:active {
    transform: scale(0.92);
  }
`;

const DPad = styled.div`
  display: grid;
  grid-template:
    ". u ." 12px
    "l c r" 12px
    ". d ." 12px
    / 12px 12px 12px;
  gap: 1px;
`;

const DPadBtn = styled.div<{ $area: string }>`
  grid-area: ${(p) => p.$area};
  background: #1e1e3a;
  border-radius: 2px;
  border: 1px solid #0a0a18;
`;

const BottomStrip = styled.div`
  height: 8px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #12122a 0%, #0a0a18 100%);
  border-radius: 0 0 6px 6px;
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Console() {
  const { user } = useAuth();
  const [view, setView] = useState<"library" | "playing">("library");
  const [tab, setTab] = useState<"all" | "demos" | "wallet">("all");
  const [selectedCart, setSelectedCart] = useState<Cartridge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gameBundleRef = useRef<GameBundle | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const demosQuery = useQuery({
    queryKey: ["console", "demos"],
    queryFn: () => api.get<Cartridge[]>("/api/console/demo-cartridges"),
    staleTime: 600_000,
  });

  const walletQuery = useQuery({
    queryKey: ["console", "cartridges"],
    queryFn: () => api.get<Cartridge[]>("/api/console/cartridges"),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const demos = demosQuery.data || [];
  const walletCarts = walletQuery.data || [];
  const allCarts =
    tab === "demos"
      ? demos
      : tab === "wallet"
        ? walletCarts
        : [...demos, ...walletCarts];

  const launchGame = useCallback(
    async (cart: Cartridge) => {
      setSelectedCart(cart);
      setView("playing");
      setLoading(true);
      setError(null);

      if (gameBundleRef.current) {
        gameBundleRef.current.revoke();
        gameBundleRef.current = null;
      }

      try {
        let zipUrl = cart.artifactUri;
        if (
          !cart.isDemo &&
          !zipUrl.startsWith("/") &&
          !zipUrl.startsWith("blob:")
        ) {
          zipUrl = `/api/cache/media?url=${encodeURIComponent(zipUrl)}`;
        }

        const resp = await fetch(zipUrl);
        if (!resp.ok) throw new Error(`Failed to fetch cartridge (${resp.status})`);
        const buffer = await resp.arrayBuffer();
        const bundle = await loadGameFromZip(buffer);
        gameBundleRef.current = bundle;

        if (iframeRef.current) {
          iframeRef.current.src = bundle.entryUrl;
        }
        setLoading(false);
      } catch (err: any) {
        console.error("[console] failed to load game:", err);
        setError(err.message || "Failed to load game");
        setLoading(false);
      }
    },
    []
  );

  const exitGame = useCallback(() => {
    if (gameBundleRef.current) {
      gameBundleRef.current.revoke();
      gameBundleRef.current = null;
    }
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
    }
    setView("library");
    setSelectedCart(null);
    setError(null);
  }, []);

  const resetGame = useCallback(() => {
    if (selectedCart) {
      launchGame(selectedCart);
    }
  }, [selectedCart, launchGame]);

  useEffect(() => {
    return () => {
      if (gameBundleRef.current) {
        gameBundleRef.current.revoke();
      }
    };
  }, []);

  function buildCacheUrl(uri: string | null | undefined): string | null {
    const v = String(uri || "").trim();
    if (!v) return null;
    if (v.startsWith("/")) return v;
    return `/api/cache/media?url=${encodeURIComponent(v)}`;
  }

  return (
    <AppWindow>
      <Wrapper>
        <Chassis>
          <TopStrip>
            <ConsoleName>WTF CONSOLE</ConsoleName>
            <CartSlot>
              <CartSlotFill $active={view === "playing"} />
            </CartSlot>
          </TopStrip>

          <ScreenArea>
            {view === "library" && (
              <LibraryScreen>
                <LibHeader>
                  <LibTitle>GAME LIBRARY</LibTitle>
                  <TabBtn $active={tab === "all"} onClick={() => setTab("all")}>
                    ALL
                  </TabBtn>
                  <TabBtn
                    $active={tab === "demos"}
                    onClick={() => setTab("demos")}
                  >
                    DEMOS
                  </TabBtn>
                  <TabBtn
                    $active={tab === "wallet"}
                    onClick={() => setTab("wallet")}
                  >
                    MY WALLET
                  </TabBtn>
                </LibHeader>

                {allCarts.length === 0 ? (
                  <EmptyMsg>
                    {tab === "wallet"
                      ? user
                        ? "No game cartridge tokens found in your wallet.\nLook for tokens with .zip artifacts on the marketplace."
                        : "Log in to scan your wallet for game cartridges."
                      : "No cartridges available."}
                  </EmptyMsg>
                ) : (
                  <CartGrid>
                    {allCarts.map((cart) => (
                      <CartCard
                        key={cart.id}
                        onClick={() => launchGame(cart)}
                      >
                        <CartArt>
                          {cart.thumbnailUri ? (
                            <CartArtImg
                              src={buildCacheUrl(cart.thumbnailUri) || cart.thumbnailUri}
                              alt={cart.title}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <CartArtFallback>
                              {cart.isDemo ? "🕹️" : "🎮"}
                            </CartArtFallback>
                          )}
                        </CartArt>
                        <CartTitle>{cart.title}</CartTitle>
                        <CartDesc>{cart.description}</CartDesc>
                        {cart.isDemo && <DemoBadge>DEMO</DemoBadge>}
                      </CartCard>
                    ))}
                  </CartGrid>
                )}
              </LibraryScreen>
            )}

            {view === "playing" && (
              <>
                {loading && (
                  <LoadingScreen>
                    <LoadDot>&#9632;</LoadDot>
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 12,
                        letterSpacing: 2,
                      }}
                    >
                      LOADING CARTRIDGE...
                    </div>
                  </LoadingScreen>
                )}
                {error && (
                  <LoadingScreen>
                    <div style={{ color: "#ff4444", fontSize: 14 }}>
                      ERROR
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: "#aa4444",
                        maxWidth: 300,
                        textAlign: "center",
                      }}
                    >
                      {error}
                    </div>
                    <CtrlBtn
                      $color="#444"
                      style={{ marginTop: 16, width: "auto", borderRadius: 4, padding: "6px 16px", fontSize: 11 }}
                      onClick={exitGame}
                    >
                      BACK
                    </CtrlBtn>
                  </LoadingScreen>
                )}
                <GameIframe
                  ref={iframeRef}
                  sandbox="allow-scripts allow-same-origin"
                  title={selectedCart?.title || "Game"}
                  style={{ display: loading || error ? "none" : "block" }}
                />
              </>
            )}
          </ScreenArea>

          <ControlBar>
            <DPad>
              <DPadBtn $area="u" />
              <DPadBtn $area="l" />
              <DPadBtn $area="c" />
              <DPadBtn $area="r" />
              <DPadBtn $area="d" />
            </DPad>

            {view === "playing" ? (
              <>
                <CtrlBtn $color="#cc3344" onClick={resetGame} title="Reset">
                  RST
                </CtrlBtn>
                <CtrlBtn $color="#3344cc" onClick={exitGame} title="Eject">
                  ⏏
                </CtrlBtn>
              </>
            ) : (
              <div
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: 10,
                  color: "#555580",
                  letterSpacing: 1,
                }}
              >
                SELECT A CARTRIDGE
              </div>
            )}

            <CtrlBtn
              $color="#44aa44"
              style={{ width: 24, height: 24, fontSize: 7 }}
            >
              A
            </CtrlBtn>
            <CtrlBtn
              $color="#cc8800"
              style={{ width: 24, height: 24, fontSize: 7 }}
            >
              B
            </CtrlBtn>
          </ControlBar>

          <BottomStrip />
        </Chassis>
      </Wrapper>
    </AppWindow>
  );
}
