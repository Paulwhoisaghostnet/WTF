import { useQuery } from "@tanstack/react-query";
import { GroupBox, Hourglass, Anchor } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";

const LinkCard = styled.div`
  padding: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid #c0c0c0;

  &:last-child {
    border-bottom: none;
  }
`;

const LinkTitle = styled.a`
  font-weight: bold;
  color: #000080;
  text-decoration: underline;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    color: #0000ff;
  }
`;

const LinkDesc = styled.p`
  font-size: 12px;
  margin: 4px 0 0;
  color: #404040;
`;

const Category = styled.span`
  font-size: 10px;
  background: #c0c0c0;
  padding: 1px 6px;
  margin-left: 8px;
`;

export function Links() {
  const { data: links, isLoading } = useQuery({
    queryKey: ["links"],
    queryFn: () => api.get<any[]>("/api/links"),
  });

  if (isLoading)
    return (
      <AppWindow title="Links">
        <Hourglass size={32} />
      </AppWindow>
    );

  const categories = [
    ...new Set(links?.map((l: any) => l.category).filter(Boolean)),
  ];

  return (
    <AppWindow title="Links">
      <p style={{ marginBottom: 12 }}>
        Useful links related to WTF Gameshow and the Tezos community.
      </p>

      {categories.length > 0
        ? categories.map((cat) => (
            <GroupBox key={cat as string} label={cat as string} style={{ marginBottom: 12 }}>
              {links
                ?.filter((l: any) => l.category === cat)
                .map((link: any) => (
                  <LinkCard key={link.id}>
                    <LinkTitle
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.title}
                    </LinkTitle>
                    {link.description && (
                      <LinkDesc>{link.description}</LinkDesc>
                    )}
                  </LinkCard>
                ))}
            </GroupBox>
          ))
        : links?.map((link: any) => (
            <LinkCard key={link.id}>
              <LinkTitle
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.title}
              </LinkTitle>
              {link.category && <Category>{link.category}</Category>}
              {link.description && <LinkDesc>{link.description}</LinkDesc>}
            </LinkCard>
          ))}

      {(!links || links.length === 0) && <p>No links added yet.</p>}
    </AppWindow>
  );
}
