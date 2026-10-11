"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Archive, ArchiveRestore, Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@lib/utils";
import { useConversationAction } from "@hooks/use-conversations";
import type { ConversationListItem } from "@modules/conversations/application/list-conversations.use-case";

interface Props {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** true = se está viendo la pestaña de archivadas. */
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  /** Se llama al archivar o desarchivar, para soltar la conversación seleccionada. */
  onArchived: (id: string) => void;
}

export function ConversationList({
  items,
  selectedId,
  onSelect,
  showArchived,
  onShowArchivedChange,
  onArchived,
}: Props): React.ReactElement {
  const [q, setQ] = useState("");
  const action = useConversationAction();
  const filtered = q
    ? items.filter(
        (c) =>
          c.clientName.toLowerCase().includes(q.toLowerCase()) ||
          c.clientLabel.includes(q),
      )
    : items;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs font-medium">
          {[
            { value: false, label: "Activas" },
            { value: true, label: "Archivadas" },
          ].map((tab) => (
            <button
              key={tab.label}
              onClick={() => onShowArchivedChange(tab.value)}
              className={cn(
                "rounded px-2 py-1 transition-colors",
                showArchived === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar chat…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {showArchived ? (
              <>
                No hay conversaciones archivadas.
                <br />
                Archivá un chat para sacarlo del panel principal.
              </>
            ) : (
              <>
                No hay conversaciones todavía.
                <br />
                Cuando llegue un mensaje a tu WhatsApp aparecerá acá.
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => {
              const initials = c.clientName
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const time = c.lastMessageAt
                ? formatDistanceToNow(new Date(c.lastMessageAt), { locale: es, addSuffix: false })
                : "";
              const isSelected = c.id === selectedId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 border-l-4 border-transparent px-3 py-3 text-left transition-colors hover:bg-accent/40",
                      isSelected && "bg-accent",
                      c.needsHuman && "border-destructive bg-destructive/5",
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {initials || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.clientName}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground group-hover:invisible">
                          {time}
                        </span>
                      </div>
                      {c.needsHuman && (
                        <span className="my-0.5 inline-block animate-pulse rounded bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                          Pide una persona
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                          {c.lastMessageDirection === "OUTBOUND" && (
                            <span className="text-muted-foreground/70">Tú: </span>
                          )}
                          {c.lastMessagePreview || "Sin mensajes"}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 rounded-full bg-wa px-1.5 text-[10px] font-semibold text-wa-foreground">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      action.mutate({ id: c.id, action: showArchived ? "unarchive" : "archive" });
                      onArchived(c.id);
                    }}
                    disabled={action.isPending}
                    title={showArchived ? "Desarchivar" : "Archivar"}
                    aria-label={showArchived ? "Desarchivar" : "Archivar"}
                    className="invisible absolute right-2 top-2 rounded-md border border-border bg-background p-1 text-muted-foreground shadow-sm hover:text-foreground group-hover:visible"
                  >
                    {showArchived ? (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
