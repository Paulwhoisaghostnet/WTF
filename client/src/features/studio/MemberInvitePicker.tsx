import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, TextInput } from "react95";
import { api } from "../../lib/api";
import {
  InviteChipClear,
  InviteDropdown,
  InviteEmpty,
  InviteInputRow,
  InviteItem,
  InviteItemHandle,
  InviteItemPrimary,
  InviteItemRole,
  InvitePicker,
  InviteSelectedChip,
} from "./StudioChrome";
import type { InviteSearchUser } from "./types";

interface MemberInvitePickerProps {
  excludeUserIds: Set<number>;
  isPending: boolean;
  onInvite: (userId: number) => void;
}

export function MemberInvitePicker({
  excludeUserIds,
  isPending,
  onInvite,
}: MemberInvitePickerProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<InviteSearchUser | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Debounce the search input so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["studio", "invite-search", debouncedQuery],
    queryFn: () =>
      api.get<InviteSearchUser[]>(
        `/api/messages/users?q=${encodeURIComponent(debouncedQuery)}&limit=10`,
      ),
    enabled: open && debouncedQuery.length >= 1,
    staleTime: 30_000,
  });

  // Drop the current user + anyone already in the project so we don't
  // suggest people who can't actually be invited.
  const suggestions = useMemo(() => {
    const raw = searchQuery.data ?? [];
    return raw.filter((user) => !excludeUserIds.has(user.id));
  }, [searchQuery.data, excludeUserIds]);

  // Reset highlight when the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, suggestions.length]);

  // Click-outside collapses the dropdown without losing the picked user.
  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const choose = (user: InviteSearchUser) => {
    setSelected(user);
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    setActiveIndex(0);
  };

  const submit = () => {
    if (selected && !isPending) onInvite(selected.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActiveIndex(
        (index) => (index - 1 + suggestions.length) % suggestions.length
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && suggestions.length > 0) {
        choose(suggestions[activeIndex]);
      } else if (selected) {
        submit();
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const placeholder = selected
    ? `${selected.displayName || selected.username} selected`
    : "search by username…";

  const showDropdown = open && debouncedQuery.length >= 1;

  return (
    <InvitePicker ref={containerRef}>
      <InviteInputRow>
        <TextInput
          placeholder={placeholder}
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value);
            // Typing implies the user is choosing again, so clear any stale pick.
            if (selected) setSelected(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          style={{ flex: 1 }}
        />
        <Button size="sm" onClick={submit} disabled={!selected || isPending}>
          Invite
        </Button>
      </InviteInputRow>

      {selected ? (
        <InviteSelectedChip>
          <span>
            ✓ <strong>{selected.displayName || selected.username}</strong>{" "}
            <InviteItemHandle>@{selected.username}</InviteItemHandle>
          </span>
          <InviteChipClear
            type="button"
            aria-label="Clear selection"
            onClick={() => setSelected(null)}
          >
            ×
          </InviteChipClear>
        </InviteSelectedChip>
      ) : null}

      {showDropdown ? (
        <InviteDropdown role="listbox">
          {searchQuery.isLoading ? (
            <InviteEmpty>Searching…</InviteEmpty>
          ) : suggestions.length === 0 ? (
            <InviteEmpty>No matches for "{debouncedQuery}"</InviteEmpty>
          ) : (
            suggestions.map((user, index) => (
              <InviteItem
                key={user.id}
                role="option"
                aria-selected={index === activeIndex}
                $active={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(user);
                }}
              >
                <InviteItemPrimary>
                  <span>{user.displayName || user.username}</span>
                  <InviteItemHandle>@{user.username}</InviteItemHandle>
                </InviteItemPrimary>
                <InviteItemRole>{user.role}</InviteItemRole>
              </InviteItem>
            ))
          )}
        </InviteDropdown>
      ) : null}
    </InvitePicker>
  );
}
