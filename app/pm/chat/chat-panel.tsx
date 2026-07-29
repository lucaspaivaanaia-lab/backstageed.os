"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { shouldAppendChunk } from "@/lib/chat/stale-response-guard";
import { saveKnowledge, listMessagesForClient } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionTitle } from "@/components/layout/page-shell";

type ClientOption = { id: string; name: string; hasRag: boolean };

type ChatMessage = {
  // `id` is only present once the message is persisted in `public.messages`
  // — an in-progress streaming bubble has no id and therefore renders no
  // curation checkbox (D-04/D-05: only already-persisted messages are
  // eligible for "Salvar como conhecimento").
  id?: string;
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
// Nenhum arquivo de referencia (client_files vazio) -> badge degradado.
const DEGRADED_NOTICE =
  "Nenhum arquivo de referência — respostas usam apenas o briefing do cliente.";
const SAVE_SUCCESS =
  "Conhecimento salvo. As mensagens selecionadas foram enviadas para a base de conhecimento do cliente.";
const SAVE_ERROR = "Não foi possível salvar o conhecimento. Tente novamente.";
const CHECKBOX_LABEL = "Incluir esta mensagem no conhecimento salvo";

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

  // Ephemeral curation selection (D-04) — nothing here is ever persisted
  // until the PM explicitly clicks "Salvar como conhecimento" (CTX-03).
  const [checkedMessageIds, setCheckedMessageIds] = useState<Set<string>>(
    new Set()
  );
  const [isSavingKnowledge, startSaveTransition] = useTransition();

  const activeClientIdRef = useRef<string | null>(activeClientId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");

  useEffect(() => {
    activeClientIdRef.current = activeClientId;
  }, [activeClientId]);

  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;

  async function loadHistory(clientId: string) {
    const rows = await listMessagesForClient(clientId);

    // The PM may have switched again while this resolved — never apply a
    // stale client's history onto the currently-active thread.
    if (activeClientIdRef.current !== clientId) return;
    setMessages(
      rows.map((row) => ({
        id: row.id,
        role: row.role,
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
    // refetch this client's persisted history. Curation selection is
    // ephemeral and never carries across clients either.
    setMessages([]);
    setCheckedMessageIds(new Set());
    void loadHistory(clientId);
  }

  function toggleMessageChecked(messageId: string) {
    setCheckedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  function handleSaveKnowledge() {
    if (!activeClientId || checkedMessageIds.size === 0) return;
    const messageIds = Array.from(checkedMessageIds);

    startSaveTransition(async () => {
      const result = await saveKnowledge(activeClientId, messageIds);
      if ("error" in result) {
        toast.error(SAVE_ERROR);
        return;
      }
      toast.success(SAVE_SUCCESS);
      setCheckedMessageIds(new Set());
    });
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
        } else {
          // The user + assistant turns are now persisted server-side —
          // refetch so both carry a real DB id and become eligible for a
          // curation checkbox (D-04/D-05: only persisted messages are
          // eligible, never an in-progress streaming bubble).
          await loadHistory(clientId);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      if (isStillActive()) {
        setSendError(SEND_ERROR);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.streaming) {
            if (last.content === "") {
              next.pop();
            } else {
              next[next.length - 1] = { ...last, streaming: false };
            }
          }
          return next;
        });
      }
    } finally {
      // isSending reflects "a request currently owned by this component is
      // in flight" — not scoped per-client. A client switch always
      // terminates that ownership (via the abort above), so this must
      // reset unconditionally; gating it on isStillActive() would leave
      // isSending permanently stuck after any mid-stream client switch.
      setIsSending(false);
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
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col">
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
            <SectionTitle>Nenhum cliente selecionado</SectionTitle>
            <p className="text-sm text-muted-foreground">
              Selecione um cliente acima para começar a conversar.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!activeClient.hasRag ? (
              <Badge
                variant="outline"
                className="w-fit border-accent-foreground/20 bg-accent text-accent-foreground"
              >
                {DEGRADED_NOTICE}
              </Badge>
            ) : null}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <SectionTitle>Nenhuma mensagem ainda</SectionTitle>
                <p className="text-sm text-muted-foreground">
                  Faça uma pergunta sobre {activeClient.name} para começar.
                </p>
              </div>
            ) : (
              messages.map((message, index) => {
                const isUser = message.role === "user";
                const bubble = (
                  <div
                    className={
                      isUser
                        ? "max-w-[80%] rounded-2xl bg-secondary px-4 py-2 text-sm text-secondary-foreground"
                        : "max-w-[80%] rounded-2xl border bg-card px-4 py-2 text-sm text-card-foreground"
                    }
                  >
                    {message.content}
                    {message.streaming ? (
                      <span className="ml-1 inline-flex gap-1 align-middle">
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                      </span>
                    ) : null}
                  </div>
                );
                // Only an already-persisted message (has a DB id) is
                // eligible for curation — a streaming/ephemeral bubble
                // never renders a checkbox (D-04/D-05).
                const checkbox = message.id ? (
                  <Checkbox
                    aria-label={CHECKBOX_LABEL}
                    checked={checkedMessageIds.has(message.id)}
                    onCheckedChange={() => toggleMessageChecked(message.id!)}
                  />
                ) : null;

                return (
                  <div
                    key={message.id ?? index}
                    className={
                      isUser
                        ? "flex items-center justify-end gap-2"
                        : "flex items-center justify-start gap-2"
                    }
                  >
                    {isUser ? (
                      <>
                        {checkbox}
                        {bubble}
                      </>
                    ) : (
                      <>
                        {bubble}
                        {checkbox}
                      </>
                    )}
                  </div>
                );
              })
            )}

            {interrupted ? (
              <div className="flex flex-col items-start gap-2 rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {INTERRUPTED_ERROR}
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-destructive"
                  onClick={handleRetry}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-background px-6 py-4">
        {checkedMessageIds.size > 0 ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-accent-foreground/15 bg-accent/50 px-3 py-2">
            <p className="text-sm text-muted-foreground">
              {checkedMessageIds.size}{" "}
              {checkedMessageIds.size === 1
                ? "mensagem selecionada"
                : "mensagens selecionadas"}
            </p>
            <Button
              type="button"
              disabled={isSavingKnowledge}
              onClick={handleSaveKnowledge}
            >
              {isSavingKnowledge ? "Salvando..." : "Salvar como conhecimento"}
            </Button>
          </div>
        ) : null}
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
