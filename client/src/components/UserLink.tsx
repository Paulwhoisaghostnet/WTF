import { Link } from "wouter";
import styled from "styled-components";

const StyledLink = styled(Link)`
  color: #000080;
  text-decoration: underline;
  cursor: pointer;
  &:hover { color: #0000cc; }
`;

interface UserLinkProps {
  username?: string | null;
  displayName?: string | null;
  fallback?: string;
}

export function UserLink({ username, displayName, fallback = "Unknown" }: UserLinkProps) {
  const label = displayName || username || fallback;
  if (!username) return <span>{label}</span>;
  return <StyledLink href={`/user/${encodeURIComponent(username)}`}>{label}</StyledLink>;
}
