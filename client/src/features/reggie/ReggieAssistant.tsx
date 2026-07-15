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
  assistantStateLine,
  greeting,
  nag,
  questCompleteLine,
  stepLine,
} from "./reggie-dialogue";
import { answerQuestion } from "./reggie-knowledge";
import {
  availableSteps,
  checkpointsForRoute,
  normalizeReggieQuestState,
  progressPercent,
  REGGIE_SUMMON_EVENT,
  recommendedStep,
  selectorsForAnchor,
  shouldShowReggie,
  type ReggieAccountSnapshot,
  type ReggieQuestState,
  type ReggieQuestStepState,
  type ReggieSummonEventDetail,
} from "./reggie-quest-model";
import {
  homePlacement,
  placementForAnchor,
  REGGIE_SPRITE_HEIGHT,
  REGGIE_SPRITE_WIDTH,
  type ReggieBubbleSide,
} from "./reggie-placement";

const REGGIE_Z_INDEX = 9100;
const SNOOZE_STORAGE_KEY = "wtf.reggie.snoozedUntil";
const SNOOZE_MS = 10 * 60 * 1000;
const NAG_INTERVAL_MS = 4 * 60 * 1000;
const TRANSIENT_BUBBLE_MS = 9 * 1000;
const SPRITE_W = REGGIE_SPRITE_WIDTH;
const SPRITE_H = REGGIE_SPRITE_HEIGHT;

/** Reggie's signature golden-caramel palette — distinct from adopted pets. */
const REGGIE_SCHEME = {
  fur: "#e8a33c",
  belly: "#ffe9c4",
  ear: "#d98b2b",
  spot: "#8a5a1b",
  accent: "#2f6fd6",
};

const bubblePop = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const assistantPopIn = keyframes`
  from { transform: translateY(18px) scale(0.86); opacity: 0; }
  70% { transform: translateY(-3px) scale(1.04); opacity: 1; }
  to { transform: translateY(0) scale(1); opacity: 1; }
`;

const assistantIdle = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
`;

const ReggieRoot = styled.div`
  position: fixed;
  z-index: ${REGGIE_Z_INDEX};
  transition: left 1.4s ease-in-out, top 1.4s ease-in-out;
  pointer-events: none;
  animation: ${assistantPopIn} 0.28s ease-out;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    animation: none;
  }
`;

const SpriteButton = styled.button<{ $flip: boolean }>`
  all: unset;
  cursor: pointer;
  display: block;
  pointer-events: auto;
  transform: ${({ $flip }) => ($flip ? "scaleX(-1)" : "none")};
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35));
  animation: ${assistantIdle} 2.8s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

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

const Bubble = styled.div<{ $side: ReggieBubbleSide }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => ($side === "right" ? "left: calc(100% + 16px);" : "right: calc(100% + 16px);")}
  transform: translateY(-50%);
  width: 300px;
  max-width: min(300px, calc(100vw - 24px));
  max-height: min(320px, calc(100vh - 24px));
  box-sizing: border-box;
  overflow-y: auto;
  background: #fffbe8;
  border: 2px solid #0f0f0f;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.35);
  padding: 10px;
  font-family: var(--wtf-shell-font, "MS Sans Serif", sans-serif);
  font-size: 12px;
  color: #141414;
  pointer-events: auto;
  animation: ${bubblePop} 0.16s ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    ${({ $side }) => ($side === "right" ? "left: -8px;" : "right: -8px;")}
    width: 12px;
    height: 12px;
    background: #fffbe8;
    border-right: 2px solid #0f0f0f;
    border-bottom: 2px solid #0f0f0f;
    transform: translateY(-50%) rotate(45deg);
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

type ReggieSpeakOptions = {
  source?: string;
  context?: Record<string, string | number | boolean | null>;
  persist?: boolean;
  transient?: boolean;
  hideAfter?: boolean;
};

type BubbleAutoClose = {
  ms: number;
  hideSprite: boolean;
};

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

function currentViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
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
  const quest = normalizeReggieQuestState(questQuery.data);

  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(readSnoozedUntil);
  const [dismissed, setDismissed] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [bubbleMode, setBubbleMode] = useState<BubbleMode>("message");
  const [bubbleAutoClose, setBubbleAutoClose] = useState<BubbleAutoClose | null>(null);
  const [message, setMessage] = useState("");
  const [focusedStep, setFocusedStep] = useState<ReggieQuestStepState | null>(null);
  const [question, setQuestion] = useState("");
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({
    x: typeof window === "undefined" ? 600 : homePlacement(currentViewport()).x,
    y: typeof window === "undefined" ? 400 : homePlacement(currentViewport()).y,
  }));
  const [bubbleSide, setBubbleSide] = useState<ReggieBubbleSide>("left");
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

  const assistantAvailable = shouldShowReggie({
    hasUser: Boolean(user),
    questState: quest,
    dismissedUntil: snoozedUntil,
  });
  const spriteVisible = assistantAvailable && !dismissed;

  const persistReggieMessage = useCallback(
    (text: string, options: ReggieSpeakOptions) => {
      if (!user) return;
      const source = options.source ?? "desktop-assistant";
      void api
        .post<{ ok: true; conversationId: number }>("/api/reggie/messages", {
          content: text,
          source,
          context: {
            path: locationPath,
            ...(options.context ?? {}),
          },
        })
        .then((result) => {
          reportReggieEvent("reggie.message.sent", "reggie.message", {
            source,
            conversationId: result.conversationId,
          });
          void queryClient.invalidateQueries({ queryKey: ["wim", "conversations"] });
          void queryClient.invalidateQueries({
            queryKey: ["wim", "messages", result.conversationId],
          });
          void queryClient.invalidateQueries({ queryKey: ["messages", "dms"] });
          void queryClient.invalidateQueries({
            queryKey: ["messages", "dms", result.conversationId],
          });
        })
        .catch(() => {
          // The speech bubble is the foreground path; WIM persistence retries on the next line.
        });
    },
    [locationPath, queryClient, user]
  );

  const speak = useCallback(
    (text: string, options: ReggieSpeakOptions = {}) => {
      messageCountRef.current += 1;
      lastReplyRef.current = text;
      setDismissed(false);
      setMessage(text);
      setBubbleMode("message");
      setBubbleOpen(true);
      setBubbleAutoClose(
        options.transient
          ? {
              ms: TRANSIENT_BUBBLE_MS,
              hideSprite: Boolean(options.hideAfter),
            }
          : null
      );
      if (options.persist !== false) {
        persistReggieMessage(text, options);
      }
    },
    [persistReggieMessage]
  );

  const homePosition = useCallback(() => {
    const placement = homePlacement(currentViewport());
    setPosition(placement);
    setBubbleSide(placement.bubbleSide);
  }, []);

  const positionNearPoint = useCallback((x: number, y: number) => {
    const placement = placementForAnchor(
      { left: x, right: x, top: y, height: 0 },
      currentViewport()
    );
    setPosition(placement);
    setBubbleSide(placement.bubbleSide);
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
      const placement = placementForAnchor(rect, currentViewport());
      setFlip(placement.x < position.x);
      setWalking(true);
      setPosition(placement);
      setBubbleSide(placement.bubbleSide);
      window.setTimeout(() => setWalking(false), 1500);
    },
    [homePosition, position.x]
  );

  const focusStep = useCallback(
    (step: ReggieQuestStepState) => {
      if (step.status === "locked") {
        speak(
          assistantStateLine(
            "locked",
            `${seedBase}:${messageCountRef.current}`,
            { title: step.title },
            lastReplyRef.current
          ),
          { source: "quest-locked", context: { stepKey: step.stepKey } }
        );
        return;
      }
      setFocusedStep(step);
      const kind = step.status === "completed" ? "congrats" : "intro";
      speak(
        stepLine(step.stepKey, kind, `${seedBase}:${messageCountRef.current}`, lastReplyRef.current),
        { source: "quest-step", context: { stepKey: step.stepKey, status: step.status } }
      );
      walkToAnchor(step.anchorId);
    },
    [seedBase, speak, walkToAnchor]
  );

  const suggestNext = useCallback(() => {
    if (!quest) {
      speak(
        assistantStateLine(
          "loading",
          `${seedBase}:${messageCountRef.current}`,
          {},
          lastReplyRef.current
        ),
        { source: "quest-loading" }
      );
      return;
    }
    const next = recommendedStep(quest);
    if (quest.questComplete) {
      speak(questCompleteLine(seedBase), { source: "quest-complete" });
      return;
    }
    if (!next) {
      speak(
        assistantStateLine(
          "empty",
          `${seedBase}:${messageCountRef.current}`,
          {},
          lastReplyRef.current
        ),
        { source: "quest-empty" }
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
        ? assistantStateLine(
            "progress",
            `${seedBase}:${messageCountRef.current}`,
            {
              completed: quest.completedCount,
              total: quest.totalCount,
              percent: progressPercent(quest),
            },
            lastReplyRef.current
          )
        : assistantStateLine(
            "progressUnknown",
            `${seedBase}:${messageCountRef.current}`,
            {},
            lastReplyRef.current
          ),
      { source: "progress-check" }
    );
  }, [locationPath, queryClient, quest, seedBase, speak]);

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
      speak(result.answer, {
        source: "question-answer",
        context: {
          matched: result.matched,
          topic: result.topicId ?? "smartass",
        },
      });
    },
    [account, quest, question, seedBase, speak]
  );

  const handleSpriteClick = useCallback(() => {
    if (bubbleOpen) {
      setBubbleOpen(false);
      setBubbleAutoClose(null);
      return;
    }
    reportReggieEvent("reggie.assistant.opened", "reggie.sprite", {
      path: locationPath,
    });
    if (!greetedRef.current) {
      greetedRef.current = true;
      speak(greeting(`${seedBase}:${new Date().toISOString().slice(0, 10)}`), {
        source: "greeting",
      });
    } else {
      suggestNext();
    }
  }, [bubbleOpen, locationPath, seedBase, speak, suggestNext]);

  const snooze = useCallback(() => {
    const until = Date.now() + SNOOZE_MS;
    setSnoozedUntil(until);
    setDismissed(true);
    setBubbleOpen(false);
    setBubbleAutoClose(null);
    reportReggieEvent("reggie.assistant.dismissed", "reggie.sprite", {
      source: "snooze",
      minutes: 10,
    });
    try {
      window.localStorage.setItem(SNOOZE_STORAGE_KEY, String(until));
    } catch {
      // Snooze is best-effort; Reggie forgives.
    }
  }, []);

  const dismissReggie = useCallback(() => {
    setDismissed(true);
    setBubbleOpen(false);
    setBubbleAutoClose(null);
    reportReggieEvent("reggie.assistant.dismissed", "reggie.sprite", {
      source: "dismiss",
      path: locationPath,
    });
  }, [locationPath]);

  const summonReggie = useCallback(
    (detail: ReggieSummonEventDetail = {}) => {
      if (!user || quest?.questComplete) return;
      setSnoozedUntil(null);
      setDismissed(false);
      setBubbleOpen(false);
      setBubbleAutoClose(null);
      try {
        window.localStorage.removeItem(SNOOZE_STORAGE_KEY);
      } catch {
        // Summon still works without localStorage.
      }
      if (Number.isFinite(detail.x) && Number.isFinite(detail.y)) {
        positionNearPoint(Number(detail.x), Number(detail.y));
      } else {
        homePosition();
      }
      const source = detail.source ?? "summon";
      reportReggieEvent("reggie.assistant.summoned", "reggie.sprite", {
        source,
        path: locationPath,
      });
      reportReggieEvent("reggie.assistant.opened", "reggie.sprite", {
        path: locationPath,
        source,
      });
      speak(
        detail.message ||
          assistantStateLine("summon", `${seedBase}:${source}`, {}, lastReplyRef.current),
        {
          source,
          context: { summoned: true },
        }
      );
    },
    [homePosition, locationPath, positionNearPoint, quest?.questComplete, seedBase, speak, user]
  );

  useEffect(() => {
    const onSummon = (event: Event) => {
      summonReggie((event as CustomEvent<ReggieSummonEventDetail>).detail ?? {});
    };
    window.addEventListener(REGGIE_SUMMON_EVENT, onSummon);
    return () => window.removeEventListener(REGGIE_SUMMON_EVENT, onSummon);
  }, [summonReggie]);

  useEffect(() => {
    if (!snoozedUntil) return;
    const ms = snoozedUntil - Date.now();
    if (ms <= 0) {
      setSnoozedUntil(null);
      setDismissed(false);
      try {
        window.localStorage.removeItem(SNOOZE_STORAGE_KEY);
      } catch {
        // Waking is visual; storage cleanup is best-effort.
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setSnoozedUntil(null);
      setDismissed(false);
      try {
        window.localStorage.removeItem(SNOOZE_STORAGE_KEY);
      } catch {
        // Waking is visual; storage cleanup is best-effort.
      }
    }, ms);
    return () => window.clearTimeout(timer);
  }, [snoozedUntil]);

  useEffect(() => {
    if (!bubbleOpen || !bubbleAutoClose) return;
    const timer = window.setTimeout(() => {
      setBubbleOpen(false);
      setBubbleAutoClose(null);
      if (bubbleAutoClose.hideSprite) {
        setDismissed(true);
      }
    }, bubbleAutoClose.ms);
    return () => window.clearTimeout(timer);
  }, [bubbleAutoClose, bubbleOpen]);

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
    speak(questCompleteLine(seedBase), { source: "quest-complete" });
  }, [quest?.questComplete, seedBase, speak]);

  // Friendly nag loop.
  useEffect(() => {
    if (!assistantAvailable || !quest || quest.questComplete) return;
    const timer = window.setInterval(() => {
      if (document.hidden || bubbleOpen) return;
      const next = recommendedStep(quest);
      const line = next
        ? `${nag(`${seedBase}:${Date.now()}`, lastReplyRef.current)} Might I suggest "${next.title}"?`
        : nag(`${seedBase}:${Date.now()}`, lastReplyRef.current);
      speak(line, {
        source: "nag",
        transient: true,
        hideAfter: true,
        context: { stepKey: next?.stepKey ?? "none" },
      });
      reportReggieEvent("reggie.hint.shown", "reggie.nag", {
        stepKey: next?.stepKey ?? "none",
      });
    }, NAG_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [assistantAvailable, bubbleOpen, quest, seedBase, speak]);

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

  if (!spriteVisible) return null;

  const pct = quest ? progressPercent(quest) : 0;
  const open = availableSteps(quest ?? { questComplete: false, completedCount: 0, totalCount: 0, steps: [], finale: null });

  return (
    <ReggieRoot style={{ left: position.x, top: position.y }} data-reggie-assistant="true">
      {bubbleOpen ? (
        <Bubble $side={bubbleSide} role="dialog" aria-label="Reggie the wtfOS assistant">
          <BubbleHeader>
            <span>Reggie</span>
            <HeaderButtons>
              <TinyButton
                type="button"
                title="Quest log"
                onClick={() => {
                  setBubbleAutoClose(null);
                  setBubbleMode(bubbleMode === "quests" ? "message" : "quests");
                }}
              >
                ☰
              </TinyButton>
              <TinyButton type="button" title="Hide Reggie until summoned" onClick={dismissReggie}>
                hide
              </TinyButton>
              <TinyButton type="button" title="Snooze Reggie for 10 minutes" onClick={snooze}>
                zZ
              </TinyButton>
              <TinyButton
                type="button"
                title="Close"
                onClick={() => {
                  setBubbleOpen(false);
                  setBubbleAutoClose(null);
                }}
              >
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
                    ),
                    {
                      source: "take-me-there",
                      context: { stepKey: focusedStep.stepKey },
                    }
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
