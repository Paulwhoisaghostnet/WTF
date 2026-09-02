import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GroupBox, Hourglass, Button } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { CLASSIC_TASK_WAYFINDER } from "../features/onboarding/classic-task-wayfinder";
import { api } from "../lib/api";
import { logClientSystemEvent } from "../lib/system-log";
import { FaqTutorials } from "../features/faq/FaqTutorials";
import { FaqPromos } from "../features/faq/FaqPromos";

const StartPanel = styled.section`
  margin-bottom: 16px;
  padding: 12px;
  border: 2px inset #fff;
  background: #e7f5ff;

  h2,
  p {
    margin: 0 0 8px;
  }
`;

const TaskGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const TaskCard = styled(Button)`
  && {
    min-height: 92px;
    height: auto;
    padding: 10px;
    display: grid;
    align-content: center;
    justify-items: start;
    gap: 4px;
    text-align: left;
    white-space: normal;
  }

  strong {
    font-size: 14px;
  }

  small {
    line-height: 1.35;
  }
`;

const FaqItem = styled.div`
  margin-bottom: 4px;
`;

const Question = styled(Button)<{ $expanded: boolean }>`
  width: 100%;
  text-align: left;
  font-weight: bold;
  ${(p) => p.$expanded && "background: #000080; color: white;"}
`;

const Answer = styled.div`
  padding: 8px 12px;
  background: #fffff0;
  border: 1px solid #c0c0c0;
  border-top: none;
  font-size: 13px;
  line-height: 1.5;
`;

export function Faq() {
  const [, setLocation] = useLocation();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    void logClientSystemEvent({ eventType: "faq.viewed" });
  }, []);

  const { data: faqItems, isLoading } = useQuery({
    queryKey: ["faq"],
    queryFn: () => api.get<any[]>("/api/faq"),
  });

  if (isLoading)
    return (
      <AppWindow title="Help & Start Here">
        <Hourglass size={32} />
      </AppWindow>
    );

  const toggle = (id: number) =>
    setExpandedId(expandedId === id ? null : id);

  const categories = [
    ...new Set(faqItems?.map((f: any) => f.category).filter(Boolean)),
  ];

  const renderItems = (items: any[]) =>
    items.map((item: any) => (
      <FaqItem key={item.id}>
        <Question
          onClick={() => toggle(item.id)}
          $expanded={expandedId === item.id}
        >
          Q: {item.question}
        </Question>
        {expandedId === item.id && <Answer>{item.answer}</Answer>}
      </FaqItem>
    ));

  return (
    <AppWindow title="Help & Start Here">
      <StartPanel aria-labelledby="start-here-title">
        <h2 id="start-here-title">What do you want to do?</h2>
        <p>Choose a task. The same five choices stay available in the Start menu.</p>
        <TaskGrid>
          {CLASSIC_TASK_WAYFINDER.map((task) => (
            <TaskCard key={task.id} type="button" onClick={() => setLocation(task.route)}>
              <strong>{task.icon} {task.label}</strong>
              <small>{task.description}</small>
            </TaskCard>
          ))}
        </TaskGrid>
      </StartPanel>
      <FaqPromos />
      <FaqTutorials />
      {categories.length > 0
        ? categories.map((cat) => (
            <GroupBox
              key={cat as string}
              label={cat as string}
              style={{ marginBottom: 12 }}
            >
              {renderItems(
                faqItems?.filter((f: any) => f.category === cat) || []
              )}
            </GroupBox>
          ))
        : renderItems(faqItems || [])}

      {(!faqItems || faqItems.length === 0) && (
        <p>More help articles are being prepared. The task buttons above are ready now.</p>
      )}
    </AppWindow>
  );
}
