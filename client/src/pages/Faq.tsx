import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GroupBox, Hourglass, Button } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: faqItems, isLoading } = useQuery({
    queryKey: ["faq"],
    queryFn: () => api.get<any[]>("/api/faq"),
  });

  if (isLoading)
    return (
      <AppWindow title="FAQ">
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
    <AppWindow title="FAQ - Frequently Asked Questions">
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

      {(!faqItems || faqItems.length === 0) && <p>No FAQ items yet.</p>}
    </AppWindow>
  );
}
