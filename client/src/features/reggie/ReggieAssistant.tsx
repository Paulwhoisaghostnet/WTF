import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled, { keyframes } from "styled-components";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { HamsterPixelSprite } from "../../components/layout/HamsterPixelSprite";
import {
  greeting,
  nag,
  questCompleteLine,
  stepLine,
} from "./reggie-dialogue";
import { answerQuestion } from "./reggie-knowledge";
import {
  availableSteps,
  checkpointsForRoute,
  progressPercent,
  recommendedStep,
  selectorsForAnchor,
  shouldShowReggie,
  type ReggieAccountSnapshot,
  type ReggieQuestState,
  type ReggieQuestStepState,
} from "./reggie-quest-model";

const REGGIE_Z_INDEX = 9100;
const SNOOZE_STORAGE_KEY = "wtf.reggie.snoozedUntil";
const SNOOZE_MS = 10 * 60 * 1000;
const NAG_INTERVAL_MS = 4 * 60 * 1000;
const SPRITE_W = 72;
const SPRITE_H = 50;

/** Reggie's signature golden-caramel palette — distinct from adopted pets. */
const REGGIE_SCHEME = {
  fur: "#e8a33c",
  belly: "#ffe9c4",
  ear: "#d98b2b",
  spot: "#8a5a1b",
  accent: "#2f6fd6",
};

const bubblePop = keyframes`
  from { transform: translateY(6px) scale(0.96); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
`;

const ReggieRoot = styled.div`
  position: fixed;
  z-index: ${REGGIE_Z_INDEX};
  transition: left 1.4s ease-in-out, top 1.4s ease-in-out;
  pointer-events: none;
`;

const SpriteButton = styled.button<{ $flip: boolean }>`
  all: unset;
  cursor: pointer;
  display: block;
  pointer-events: auto;
  transform: ${({ $flip }) => ($flip ? "scaleX(-1)" : "none")};
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35));

  &:focus-visible {
    outline: 2px dashed #2f6fd6;
    outline-offset: 2px;
  }
`;

const NameTag = styled.div`
  pointer-events: none;
  text-align: center;
  font-family: var(--wtf-shell-font, "MS Sans Serif", sans-serif);
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #2f6fd6;
  border: 1px solid #0f0f0f;
  padding: 0 4px;
  width: fit-content;
  margin: -2px auto 0;
`;

const Bubble = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  right: -8px;
  width: 300px;
  max-width: min(300px, calc(100vw - 24px));
  background: #fffbe8;
  border: 2px solid #0f0f0f;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.35);
  padding: 10px;
  font-family: var(--wtf-shell-font, "MS Sans Serif", sans-serif);
  font-size: 12px;
  color: #141414;
  pointer-events: auto;
  animation: ${bubblePop} 0.16s ease-out;

  &::after {
    content: "";
    position: absolute;
    bottom: -8px;
    right: 28px;
    width: 12px;
    height: 12px;
    background: #fffbe8;
    border-right: 2px solid #0f0f0f;
    border-bottom: 2px solid #0f0f0f;
    transform: rotate(45deg);
  }
`;

const BubbleHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-weight: 700;
`;

const HeaderButtons = styled.div`
  display: flex;
  gap: 4px;
`;

const TinyButton = styled.button`
  all: unset;
  cursor: pointer;
  border: 1px solid #0f0f0f;
  background: #e8e8e8;
  padding: 0 5px;
  font-size: 11px;
  line-height: 16px;

  &:hover {
    background: #d6d6d6;
  }
`;

const BubbleText = styled.p`
  margin: 0 0 8px;
  line-height: 1.45;
  white-space: pre-wrap;
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const ActionButton = styled.button`
  all: unset;
  cursor: pointer;
  border: 2px solid #0f0f0f;
  background: #ffd876;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);

  &:hover {
    background: #ffcb4d;
  }

  &:active {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
  }
`;

const QuestList = styled.div`
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid #0f0f0f;
  background: #ffffff;
  margin-bottom: 8px;
`;

const QuestRow = styled.button<{ $status: string }>`
  all: unset;
  cursor: ${({ $status }) => ($status === "locked" ? "not-allowed" : "pointer")};
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border-bottom: 1px solid #e2e2e2;
  opacity: ${({ $status }) => ($status === "locked" ? 0.55 : 1)};

  &:hover {
    background: ${({ $status }) => ($status === "locked" ? "transparent" : "#fff3c8")};
  }
`;

const QuestStatusGlyph = styled.span`
  width: 14px;
  text-align: center;
  flex: none;
`;

const QuestTitle = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const QuestReward = styled.span`
  flex: none;
  font-size: 10px;
  color: #555;
`;

const ProgressTrack = styled.div`
  height: 12px;
  border: 1px solid #0f0f0f;
  background: #ffffff;
  margin-bottom: 8px;
`;

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: repeating-linear-gradient(
    90deg,
    #2f6fd6 0px,
    #2f6fd6 8px,
    #5b93ea 8px,
    #5b93ea 16px
  );
  transition: width 0.4s ease;
`;

const AskForm = styled.form`
  display: flex;
  gap: 4px;
  margin-top: 8px;
`;

const AskInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 2px inset #d6d6d6;
  background: #ffffff;
  font-family: inherit;
  font-size: 11px;
  padding: 2px 4px;
`;

type BubbleMode = "message" | "quests" | "ask";

function reportReggieEvent(
  eventType: string,
  objectId: string,
  metadata: Record<string, string | number | boolean> = {}
) {
  void api
    .post<{ ok: true }>("/api/desktop/events", {
      eventType,
      objectId,
      objectKind: "reggie",
      action: "interact",
      metadata,
    })
    .catch(() => {
      // Reggie stays chatty even when telemetry naps.
    });
}

function readSnoozedUntil(): number | null {
  try {
    const raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY);
    const value = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function statusGlyph(status: string): string {
  if (status === "completed") return "✔";
  if (status === "available") return "▶";
  return "🔒";
}

export function ReggieAssistant() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [locationPath, navigate] = useLocation();

  const questQuery = useQuery<ReggieQuestState>({
    queryKey: ["/api/reggie/quest"],
    queryFn: () => api.get<ReggieQuestState>("/api/reggie/quest"),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchInterval: 90_000,
  });
  const quest = questQuery.data ?? null;

  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(readSnoozedUntil);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubbleMode, setBubbleMode] = useState<BubbleMode>("message");
  const [message, setMessage] = useState("");
  const [focusedStep, setFocusedStep] = useState<ReggieQuestStepState | null>(null);
  const [question, setQuestion] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({
    x: typeof window === "undefined" ? 600 : window.innerWidth - SPRITE_W - 28,
    y: typeof window === "undefined" ? 400 : window.innerHeight - SPRITE_H - 72,
  }));
  const [walking, setWalking] = useState(false);
  const [flip, setFlip] = useState(false);

  const lastReplyRef = useRef<string>("");
  const messageCountRef = useRef(0);
  const emittedCheckpointsRef = useRef(new Set<string>());
  const celebratedRef = useRef(false);
  const greetedRef = useRef(false);

  const seedBase = user ? `${user.id}:${user.username}` : "anon";

  const account: ReggieAccountSnapshot | null = useMemo(() => {
    if (!user) return null;
    return {
      username: user.username,
      displayName: user.displayName ?? null,
      bio: user.bio ?? null,
      avatarUrl: user.avatarUrl ?? null,
      pfpImageUrl: user.pfpImageUrl ?? null,
      twitterHandle: user.twitterHandle ?? null,
      twitterVerified: Boolean(user.twitterVerified),
      experiencePoints: user.experiencePoints ?? 0,
    };
  }, [user]);

  const visible = shouldShowReggie({
    hasUser: Boolean(user),
    questState: quest,
    dismissedUntil: snoozedUntil,
  });

  const speak = useCallback((text: string) => {
    messageCountRef.current += 1;
    lastReplyRef.current = text;
    setMessage(text);
    setBubbleMode("message");
    setBubbleOpen(true);
  }, []);

  const homePosition = useCallback(() => {
    setPosition({
      x: window.innerWidth - SPRITE_W - 28,
      y: window.innerHeight - SPRITE_H - 72,
    });
  }, []);

  const walkToAnchor = useCallback(
    (anchorId: string) => {
      const selectors = selectorsForAnchor(anchorId);
      let rect: DOMRect | null = null;
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          rect = element.getBoundingClientRect();
          break;
        }
      }
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        homePosition();
        return;
      }
      const targetX = Math.max(
        8,
        Math.min(window.innerWidth - SPRITE_W - 8, rect.left + rect.width / 2 - SPRITE_W / 2)
      );
      const targetY = Math.max(
        8,
        Math.min(window.innerHeight - SPRITE_H - 8, rect.top - SPRITE_H - 10)
      );
      setFlip(targetX < position.x);
      setWalking(true);
      setPosition({ x: targetX, y: targetY });
      window.setTimeout(() => setWalking(false), 1500);
    },
    [homePosition, position.x]
  );

  const focusStep = useCallback(
    (step: ReggieQuestStepState) => {
      if (step.status === "locked") {
        speak(
          `"${step.title}" is still locked. Finish its prerequisites first — check the quest list and I'll point the way.`
        );
        return;
      }
      setFocusedStep(step);
      const kind = step.status === "completed" ? "congrats" : "intro";
      speak(stepLine(step.stepKey, kind, `${seedBase}:${messageCountRef.current}`, lastReplyRef.current));
      walkToAnchor(step.anchorId);
    },
    [seedBase, speak, walkToAnchor]
  );

  const suggestNext = useCallback(() => {
    if (!quest) {
      speak("Give me a second to load your quest state. Even hamsters have latency.");
      return;
    }
    const next = recommendedStep(quest);
    if (quest.questComplete) {
      speak(questCompleteLine(seedBase));
      return;
    }
    if (!next) {
      speak(
        "Nothing is available right now, which should be impossible. Try 'Check progress' and I'll re-run the books."
      );
      return;
    }
    focusStep(next);
    reportReggieEvent("reggie.hint.shown", `reggie.hint.${next.stepKey}`, {
      stepKey: next.stepKey,
    });
  }, [focusStep, quest, seedBase, speak]);

  const checkProgress = useCallback(() => {
    reportReggieEvent("reggie.progress.checked", "reggie.progress", {
      path: locationPath,
    });
    window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ["/api/reggie/quest"] });
    }, 1200);
    speak(
      quest
        ? `Running the books... you're at ${quest.completedCount}/${quest.totalCount} (${progressPercent(quest)}%). I've asked the system to re-verify everything — give it a beat and check the quest list.`
        : "Re-checking everything now."
    );
  }, [locationPath, queryClient, quest, speak]);

  const handleAsk = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const asked = question.trim();
      if (!asked) return;
      const result = answerQuestion(asked, {
        account,
        quest,
        seed: `${seedBase}:${messageCountRef.current}`,
        lastReply: lastReplyRef.current,
      });
      reportReggieEvent("reggie.question.asked", "reggie.question", {
        matched: result.matched,
        topic: result.topicId ?? "smartass",
      });
      setQuestion("");
      speak(result.answer);
    },
    [account, quest, question, seedBase, speak]
  );

  const handleSpriteClick = useCallback(() => {
    if (bubbleOpen) {
      setBubbleOpen(false);
      return;
    }
    reportReggieEvent("reggie.assistant.opened", "reggie.sprite", {
      path: locationPath,
    });
    if (!greetedRef.current) {
      greetedRef.current = true;
      speak(greeting(`${seedBase}:${new Date().toISOString().slice(0, 10)}`));
    } else {
      suggestNext();
    }
  }, [bubbleOpen, locationPath, seedBase, speak, suggestNext]);

  const snooze = useCallback(() => {
    const until = Date.now() + SNOOZE_MS;
    setSnoozedUntil(until);
    setBubbleOpen(false);
    try {
      window.localStorage.setItem(SNOOZE_STORAGE_KEY, String(until));
    } catch {
      // Snooze is best-effort; Reggie forgives.
    }
  }, []);

  // Route checkpoints: when the user visits a tour destination while the
  // owning step is not yet complete, emit the proof event the quest engine
  // is listening for.
  useEffect(() => {
    if (!user || !quest) return;
    const checkpoints = checkpointsForRoute(locationPath);
    for (const entry of checkpoints) {
      const step = quest.steps.find((item) => item.stepKey === entry.stepKey);
      if (!step || step.status === "completed") continue;
      if (emittedCheckpointsRef.current.has(entry.checkpoint)) continue;
      emittedCheckpointsRef.current.add(entry.checkpoint);
      reportReggieEvent("reggie.checkpoint.reached", `reggie.visit.${entry.checkpoint}`, {
        checkpoint: entry.checkpoint,
        stepKey: entry.stepKey,
      });
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/reggie/quest"] });
      }, 1500);
    }
  }, [locationPath, quest, queryClient, user]);

  // Celebrate the finale exactly once, then Reggie retires.
  useEffect(() => {
    if (!quest?.questComplete || celebratedRef.current) return;
    celebratedRef.current = true;
    reportReggieEvent("reggie.quest.completed", "reggie.finale", {});
    speak(questCompleteLine(seedBase));
  }, [quest?.questComplete, seedBase, speak]);

  // Friendly nag loop.
  useEffect(() => {
    if (!visible || !quest || quest.questComplete) return;
    const timer = window.setInterval(() => {
      if (document.hidden || bubbleOpen) return;
      const next = recommendedStep(quest);
      const line = next
        ? `${nag(`${seedBase}:${Date.now()}`, lastReplyRef.current)} Might I suggest "${next.title}"?`
        : nag(`${seedBase}:${Date.now()}`, lastReplyRef.current);
      speak(line);
      reportReggieEvent("reggie.hint.shown", "reggie.nag", {
        stepKey: next?.stepKey ?? "none",
      });
    }, NAG_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [bubbleOpen, quest, seedBase, speak, visible]);

  // Keep Reggie on screen when the window resizes.
  useEffect(() => {
    const onResize = () => {
      setPosition((current) => ({
        x: Math.min(current.x, window.innerWidth - SPRITE_W - 8),
        y: Math.min(current.y, window.innerHeight - SPRITE_H - 8),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!visible) return null;

  const pct = quest ? progressPercent(quest) : 0;
  const open = availableSteps(quest ?? { questComplete: false, completedCount: 0, totalCount: 0, steps: [], finale: null });

  return (
    <ReggieRoot style={{ left: position.x, top: position.y }} data-reggie-assistant="true">
      {bubbleOpen ? (
        <Bubble role="dialog" aria-label="Reggie the wtfOS assistant">
          <BubbleHeader>
            <span>Reggie</span>
            <HeaderButtons>
              <TinyButton
                type="button"
                title="Quest log"
                onClick={() => setBubbleMode(bubbleMode === "quests" ? "message" : "quests")}
              >
                ☰
              </TinyButton>
              <TinyButton type="button" title="Snooze Reggie for 10 minutes" onClick={snooze}>
                zZ
              </TinyButton>
              <TinyButton type="button" title="Close" onClick={() => setBubbleOpen(false)}>
                ×
              </TinyButton>
            </HeaderButtons>
          </BubbleHeader>

          {quest ? (
            <ProgressTrack title={`${quest.completedCount}/${quest.totalCount} side quests complete`}>
              <ProgressFill $pct={pct} />
            </ProgressTrack>
          ) : null}

          {bubbleMode === "quests" && quest ? (
            <QuestList>
              {[...quest.steps]
                .sort((a, b) => {
                  const rank = (status: string) =>
                    status === "available" ? 0 : status === "locked" ? 1 : 2;
                  return rank(a.status) - rank(b.status) || a.order - b.order;
                })
                .map((step) => (
                  <QuestRow
                    key={step.stepKey}
                    $status={step.status}
                    onClick={() => focusStep(step)}
                    title={step.description}
                  >
                    <QuestStatusGlyph>{statusGlyph(step.status)}</QuestStatusGlyph>
                    <QuestTitle>{step.title}</QuestTitle>
                    <QuestReward>
                      {step.rewards.xp}xp{step.rewards.wtf ? ` +${step.rewards.wtf}wtf` : ""}
                    </QuestReward>
                  </QuestRow>
                ))}
            </QuestList>
          ) : (
            <BubbleText>{message}</BubbleText>
          )}

          <ActionRow>
            <ActionButton type="button" onClick={suggestNext}>
              What's next?
            </ActionButton>
            {focusedStep && focusedStep.status !== "completed" ? (
              <ActionButton
                type="button"
                onClick={() => {
                  navigate(focusedStep.route);
                  speak(
                    stepLine(
                      focusedStep.stepKey,
                      "nudge",
                      `${seedBase}:${messageCountRef.current}`,
                      lastReplyRef.current
                    )
                  );
                }}
              >
                Take me there
              </ActionButton>
            ) : null}
            <ActionButton type="button" onClick={checkProgress}>
              Check progress
            </ActionButton>
            <ActionButton type="button" onClick={() => navigate("/side-quests")}>
              Quest HQ
            </ActionButton>
          </ActionRow>

          <AskForm onSubmit={handleAsk}>
            <AskInput
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask Reggie anything…"
              aria-label="Ask Reggie a question"
            />
            <ActionButton type="submit">Ask</ActionButton>
          </AskForm>

          {open.length > 0 && bubbleMode !== "quests" ? (
            <BubbleText style={{ margin: "8px 0 0", fontSize: 10, color: "#666" }}>
              {open.length} side quest{open.length === 1 ? "" : "s"} available right now.
            </BubbleText>
          ) : null}
        </Bubble>
      ) : null}

      <SpriteButton
        type="button"
        onClick={handleSpriteClick}
        $flip={flip}
        aria-label="Reggie the wtfOS assistant hamster"
        title="Reggie — click for help"
      >
        <HamsterPixelSprite
          alive
          moving={walking}
          scheme={REGGIE_SCHEME}
          width={SPRITE_W}
          height={SPRITE_H}
        />
      </SpriteButton>
      <NameTag>REGGIE</NameTag>
    </ReggieRoot>
  );
}
