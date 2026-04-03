import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  TextInput,
  GroupBox,
  Hourglass,
  Separator,
  Panel,
} from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";

const Layout = styled.div`
  display: flex;
  gap: 8px;
  height: 100%;
  min-height: 400px;
`;

const ChannelList = styled.div`
  width: 180px;
  flex-shrink: 0;
  overflow-y: auto;
`;

const ChannelButton = styled(Button)<{ $active?: boolean }>`
  width: 100%;
  text-align: left;
  margin-bottom: 2px;
  ${(p) => p.$active && "font-weight: bold;"}
`;

const ChatArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const MessageList = styled(Panel).attrs({ variant: "well" })`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 200px;
`;

const MessageRow = styled.div`
  margin-bottom: 8px;
`;

const MsgAuthor = styled.span`
  font-weight: bold;
  font-size: 12px;
  color: #000080;
`;

const MsgTime = styled.span`
  font-size: 10px;
  color: #808080;
  margin-left: 6px;
`;

const MsgContent = styled.div`
  font-size: 13px;
  word-break: break-word;
`;

const InputRow = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 4px;
`;

export function Messages() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<any[]>("/api/channels"),
  });

  const { data: msgs } = useQuery({
    queryKey: ["messages", activeChannel],
    queryFn: () =>
      api.get<any[]>(`/api/channels/${activeChannel}/messages?limit=100`),
    enabled: !!activeChannel,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (channels && channels.length > 0 && !activeChannel) {
      setActiveChannel(channels[0].id);
    }
  }, [channels, activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    if (!user || !activeChannel) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", userId: user.id, username: user.username }));
      ws.send(JSON.stringify({ type: "join_channel", channelId: activeChannel }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "new_message" && msg.channelId === activeChannel) {
        qc.invalidateQueries({ queryKey: ["messages", activeChannel] });
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [user, activeChannel, qc]);

  const sendMutation = useMutation({
    mutationFn: (data: { content: string }) =>
      api.post(`/api/channels/${activeChannel}/messages`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", activeChannel] });
      setInput("");
    },
  });

  const handleSend = () => {
    if (!input.trim() || !activeChannel) return;
    sendMutation.mutate({ content: input.trim() });
  };

  if (isLoading)
    return (
      <AppWindow title="Messages">
        <Hourglass size={32} />
      </AppWindow>
    );

  return (
    <AppWindow title="Message Board">
      <Layout>
        <ChannelList>
          <GroupBox label="Channels">
            {channels?.map((ch: any) => (
              <ChannelButton
                key={ch.id}
                size="sm"
                $active={ch.id === activeChannel}
                onClick={() => setActiveChannel(ch.id)}
              >
                # {ch.name}
              </ChannelButton>
            ))}
            {(!channels || channels.length === 0) && (
              <p style={{ fontSize: 11 }}>No channels yet</p>
            )}
          </GroupBox>
        </ChannelList>

        <ChatArea>
          <MessageList>
            {msgs?.map((msg: any) => (
              <MessageRow key={msg.id}>
                <div>
                  <MsgAuthor>
                    {msg.displayName || msg.username || "Unknown"}
                  </MsgAuthor>
                  <MsgTime>
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </MsgTime>
                </div>
                <MsgContent>{msg.content}</MsgContent>
              </MessageRow>
            ))}
            <div ref={messagesEndRef} />
          </MessageList>

          <InputRow>
            <TextInput
              value={input}
              onChange={(e: any) => setInput(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              fullWidth
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
            >
              Send
            </Button>
          </InputRow>
        </ChatArea>
      </Layout>
    </AppWindow>
  );
}
