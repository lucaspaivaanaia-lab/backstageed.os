"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { shouldAppendChunk } from "@/lib/chat/stale-response-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClientOption = { id: string; name: string; hasRag: boolean };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

type ChatPanelProps = {
  clients: ClientOption[];
};

const SEND_ERROR =
  "Não foi possível enviar sua mensagem. Verifique sua conexão e tente novamente.";
const INTERRUPTED_ERROR = "A resposta foi interrompida. Tente novamente.";
const DEGRADED_NOTICE =
  "Busca de contexto indisponível — respostas usam apenas o briefing do cliente.";

/**
 * Client switcher + message list + composer (CTX-01, CTX-02). This is the
 * `"use client"` half of app/pm/chat/page.tsx's roster loader; it never
 * reads `process.env` itself — RAG availability arrives ONLY as the
 * server-computed `hasRag` flag on each `clients` entry (T-2-04).
 *
 * T-2-07 (mitigate): every streamed chunk is gated by `shouldAppendChunk`
 * against the currently-active client id, and switching clients aborts any
 * in-flight request via AbortController — a stale response from a
 * previously-selected client can never be appended to the new client's
 * thread.
 */
export function ChatPanel({ clients }: ChatPanelProps) {
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState(false);

  const activeClientIdRef = useRef<string | null>(activeClientId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");

  useEffect(() => {
    activeClientIdRef.current = activeClientId;
  }, [activeClientId]);

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;

  async function loadHistory(clientId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("role, content")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });

    // The PM may have switched again while this resolved — never apply a
    // stale client's history onto the currently-active thread.
    if (activeClientIdRef.current !== clientId) return;
    setMessages(
      (data ?? []).map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      }))
    );
  }

  function handleSwitchClient(clientId: string) {
    abortControllerRef.current?.abort();
    setSendError(null);
    setInterrupted(false);
    setInput("");
    activeClientIdRef.current = clientId;
    setActiveClientId(clientId);
    // Never carry in-memory state across clients — clear immediately, then
    // refetch this client's persisted history.
    setMessages([]);
    void loadHistory(clientId);
  }

  async function streamResponse(clientId: string, content: string) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSending(true);
    setSendError(null);
    setInterrupted(false);

    const isStillActive = () =>
      shouldAppendChunk(clientId, activeClientIdRef.current ?? "");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, content }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      if (isStillActive()) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "", streaming: true },
        ]);
      }

      let streamEndedEarly = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isStillActive()) {
          streamEndedEarly = true;
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.streaming) {
            next[next.length - 1] = {
              ...last,
              content: last.content + chunk,
            };
          }
          return next;
        });
      }

      if (isStillActive()) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.streaming) {
            next[next.length - 1] = { ...last, streaming: false };
          }
          return next;
        });
        if (streamEndedEarly) {
          setInterrupted(true);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      if (isStillActive()) {
        setSendError(SEND_ERROR);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.streaming && last.content === "") {
            next.pop();
          }
          return next;
        });
      }
    } finally {
      if (isStillActive()) {
        setIsSending(false);
      }
    }
  }

  function handleSend() {
    const content = input.trim();
    if (!content || !activeClientId || isSending) return;

    lastUserMessageRef.current = content;
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    void streamResponse(activeClientId, content);
  }

  function handleRetry() {
    if (!activeClientId || !lastUserMessageRef.current) return;
    setInterrupted(false);
    void streamResponse(activeClientId, lastUserMessageRef.current);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 border-b bg-background px-6 py-4">
        <Select
          value={activeClientId ?? undefined}
          onValueChange={handleSwitchClient}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecionar cliente" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!activeClient ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <h2 className="text-xl font-semibold leading-[1.2]">
              Nenhum cliente selecionado
            </h2>
            <p className="text-sm text-muted-foreground">
              Selecione um cliente acima para começar a conversar.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!activeClient.hasRag ? (
              <Badge variant="outline" className="w-fit">
                {DEGRADED_NOTICE}
              </Badge>
            ) : null}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <h2 className="text-xl font-semibold leading-[1.2]">
                  Nenhuma mensagem ainda
                </h2>
                <p className="text-sm text-muted-foreground">
                  Faça uma pergunta sobre {activeClient.name} para começar.
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[80%] rounded-2xl bg-secondary px-4 py-2 text-sm text-secondary-foreground"
                        : "max-w-[80%] rounded-2xl border bg-card px-4 py-2 text-sm text-card-foreground"
                    }
                  >
                    {message.content}
                    {message.streaming ? (
                      <span className="ml-1 inline-flex gap-0.5 align-middle">
                        <span className="size-1 animate-pulse rounded-full bg-muted-foreground" />
                        <span className="size-1 animate-pulse rounded-full bg-muted-foreground" />
                        <span className="size-1 animate-pulse rounded-full bg-muted-foreground" />
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}

            {interrupted ? (
              <div className="flex flex-col items-start gap-2">
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {INTERRUPTED_ERROR}
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={handleRetry}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-background px-6 py-4">
        {sendError ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {sendError}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Escreva uma mensagem..."
            disabled={!activeClientId || isSending}
            className="flex-1"
          />
          <Button
            type="button"
            size="icon"
            className="size-11"
            aria-label="Enviar mensagem"
            disabled={!activeClientId || isSending || !input.trim()}
            onClick={handleSend}
          >
            <SendHorizontal />
          </Button>
        </div>
      </footer>
    </div>
  );
}
