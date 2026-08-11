"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent,
} from "react";
import {
  SendHorizontal,
  TriangleAlertIcon,
  MessageSquareIcon,
  InboxIcon,
  LayoutDashboardIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { shouldAppendChunk } from "@/lib/chat/stale-response-guard";
import {
  getLastSelectedClientId,
  setLastSelectedClientId,
  subscribeLastSelectedClientId,
  getLastSelectedClientIdServerSnapshot,
} from "@/lib/client-selection";
import { cardFieldsFromChatText } from "@/lib/cards/chat-import";
import { STAGE_ORDER } from "@/lib/cards/stages";
import { createCard } from "@/app/pm/board/actions";
import { saveKnowledge, listMessagesForClient } from "./actions";
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
import { EmptyState } from "@/components/layout/page-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBox } from "@/components/ui/error-box";

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
// Quick task 260805-fuu, Part 2: one-click Chat -> Kanban shortcut.
const SEND_TO_KANBAN_SUCCESS = "Card criado na Produção.";
const SEND_TO_KANBAN_ERROR =
  "Não foi possível criar o card. Tente novamente.";

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
  const router = useRouter();

  // P2 pivot 2026-08-04: `manualClientId` is only set when the PM
  // explicitly picks a client THIS session (handleSwitchClient). Until
  // then, `activeClientId` below falls back to whatever was last selected
  // (here or on /pm/board) via `useSyncExternalStore` — a derived value
  // computed during render, never a setState-in-effect on mount (this
  // project's react-hooks/set-state-in-effect rule blocks that pattern;
  // useSyncExternalStore is also the hydration-safe way to read
  // localStorage, since its getServerSnapshot matches what SSR renders).
  const [manualClientId, setManualClientId] = useState<string | null>(null);
  const lastSelectedClientId = useSyncExternalStore(
    subscribeLastSelectedClientId,
    getLastSelectedClientId,
    getLastSelectedClientIdServerSnapshot
  );
  const activeClientId =
    manualClientId ??
    (lastSelectedClientId && clients.some((c) => c.id === lastSelectedClientId)
      ? lastSelectedClientId
      : null);

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

  // Quick task 260805-fuu, Part 2: separate transition from the curation
  // save above — this one owns "Enviar pro Kanban" only.
  const [isSendingToKanban, startSendToKanbanTransition] = useTransition();

  const activeClientIdRef = useRef<string | null>(activeClientId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>("");

  useEffect(() => {
    activeClientIdRef.current = activeClientId;
  }, [activeClientId]);

  // Client-scoped navigation (P2 pivot 2026-08-04): Chat should never be
  // reachable with no client context — matching the sidebar only exposing
  // this link once a client has been selected at least once (either here
  // or on the board). `activeClientId` already accounts for both the
  // manual pick and the localStorage-restored value (see its derivation
  // above); if it's still null once this effect runs, there's genuinely no
  // usable client — first-ever visit, cleared storage, or a stale id no
  // longer in this PM's roster — so send them to the client list instead
  // of rendering an empty chat. router.push() is a navigation call, not a
  // React setState, so this doesn't trip react-hooks/set-state-in-effect.
  // Fix (quick task 260805-h1n): on a hard reload, `activeClientId` still
  // carries the `null` from `getLastSelectedClientIdServerSnapshot` on the
  // very first post-hydration render (it must match SSR to avoid a
  // hydration mismatch), even though the real id is already sitting in
  // `localStorage`. Trusting `activeClientId` alone here would redirect a
  // PM who genuinely has an active client — so before navigating away we
  // reread the client-only source of truth directly and only redirect if
  // that fresh read also comes up empty or out of this PM's roster.
  useEffect(() => {
    if (activeClientId) return;
    const freshId = getLastSelectedClientId();
    const freshIdInRoster =
      freshId && clients.some((c) => c.id === freshId) ? freshId : null;
    if (!freshIdInRoster) {
      router.push("/pm/clients");
    }
  }, [activeClientId, clients, router]);

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
    setManualClientId(clientId);
    // Never carry in-memory state across clients — clear immediately.
    // History load is handled uniformly by the activeClientId-watching
    // effect below (covers this manual-switch path AND the P2 auto-restore
    // derived value the same way, one place decides "when to load history").
    // Curation selection is ephemeral and never carries across clients.
    setMessages([]);
    setCheckedMessageIds(new Set());
    // P2 pivot 2026-08-04: remember this choice so /pm/board (and a future
    // chat visit) can default back to it — see lib/client-selection.ts.
    setLastSelectedClientId(clientId);
  }

  // Loads history for whichever client is active — covers BOTH the P2
  // auto-restore derived value above and a manual handleSwitchClient call.
  // handleSwitchClient clears messages/checked-ids itself first, so a
  // manual switch never shows a flash of the previous client's messages.
  // The `void loadHistory(...)` call below runs async — its own setState
  // happens after the `await`, not synchronously in this effect body, so
  // it doesn't trip react-hooks/set-state-in-effect the way a bare
  // `setState()` call directly in the effect would.
  useEffect(() => {
    if (activeClientId) {
      void loadHistory(activeClientId);
    }
  }, [activeClientId]);

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

  // Quick task 260805-fuu, Part 2: reuses the same title/description rule
  // as the board's "Colar do chat" tab (lib/cards/chat-import.ts) — the
  // only difference is the source text (the AI's own last reply, not a
  // manual paste) and the target stage (always STAGE_ORDER[0], D-E).
  function handleSendToKanban(message: ChatMessage) {
    const clientId = activeClientId;
    if (!clientId) return;
    const { title, description } = cardFieldsFromChatText(message.content);

    startSendToKanbanTransition(async () => {
      try {
        const result = await createCard({
          clientId,
          title,
          cardType: "single",
          stage: STAGE_ORDER[0],
          description,
          // Item 1, 260811-m0t: chat-to-Kanban always defaults to Conteúdo,
          // no picker -- same reasoning as the board's "Colar do chat" tab
          // (handlePasteImport in board-panel.tsx): text sent from a chat
          // conversation via "Enviar pro Kanban" is definitionally
          // finished content, never a planning document.
          channel: "conteudo",
        });
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        toast.success(SEND_TO_KANBAN_SUCCESS, {
          action: {
            label: "Ver na Produção",
            onClick: () => router.push(`/pm/board?client=${clientId}`),
          },
        });
      } catch {
        toast.error(SEND_TO_KANBAN_ERROR);
      }
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

  // "Enviar pro Kanban" only ever renders next to the LAST assistant
  // message — not `findLastIndex` (unconfirmed support in this build
  // target), a plain reduce over the whole array is safe and O(n).
  const lastAssistantIndex = messages.reduce(
    (lastIndex, message, index) =>
      message.role === "assistant" ? index : lastIndex,
    -1
  );

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-6 py-4">
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
        {activeClientId ? (
          <Button variant="outline" className="shrink-0" asChild>
            <Link href={`/pm/board?client=${activeClientId}`}>
              <LayoutDashboardIcon className="size-4" />
              Produção
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!activeClient ? (
          <EmptyState
            icon={<MessageSquareIcon className="size-5" />}
            title="Nenhum cliente selecionado"
            description="Selecione um cliente acima para começar a conversar."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {!activeClient.hasRag ? (
              <StatusBadge tone="warning" icon={<TriangleAlertIcon />}>
                {DEGRADED_NOTICE}
              </StatusBadge>
            ) : null}

            {messages.length === 0 ? (
              <EmptyState
                icon={<InboxIcon className="size-5" />}
                title="Nenhuma mensagem ainda"
                description={
                  <>Faça uma pergunta sobre {activeClient.name} para começar.</>
                }
              />
            ) : (
              messages.map((message, index) => {
                const isUser = message.role === "user";
                const bubble = (
                  <div
                    className={
                      isUser
                        ? "max-w-[80%] rounded-2xl bg-secondary px-4 py-2 text-body text-secondary-foreground"
                        : "max-w-[80%] rounded-2xl border bg-card px-4 py-2 text-body text-card-foreground whitespace-pre-wrap"
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

                // Quick task 260805-fuu, Part 2: only the last, fully
                // streamed assistant reply — with a client active — ever
                // shows this button. Every other message (user turns,
                // earlier AI replies, an in-progress stream) renders
                // nothing here, not a disabled button.
                const showSendToKanban =
                  index === lastAssistantIndex &&
                  message.role === "assistant" &&
                  !message.streaming &&
                  message.content.trim().length > 0 &&
                  activeClientId !== null;
                const sendToKanbanButton = showSendToKanban ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Enviar pro Kanban"
                    disabled={isSendingToKanban}
                    onClick={() => handleSendToKanban(message)}
                  >
                    <LayoutDashboardIcon className="size-4" />
                    {isSendingToKanban ? "Enviando..." : "Enviar pro Kanban"}
                  </Button>
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
                        {sendToKanbanButton}
                      </>
                    )}
                  </div>
                );
              })
            )}

            {interrupted ? (
              <ErrorBox
                action={
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-destructive"
                    onClick={handleRetry}
                  >
                    Tentar novamente
                  </Button>
                }
              >
                {INTERRUPTED_ERROR}
              </ErrorBox>
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
        {sendError ? <ErrorBox>{sendError}</ErrorBox> : null}
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
