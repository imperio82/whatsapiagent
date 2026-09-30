"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@lib/utils";
import type { ConversationListItem } from "@modules/conversations/application/list-conversations.use-case";

interface Props {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ items, selectedId, onSelect }: Props): React.ReactElement {
  const [q, setQ] = useState("");
  const filtered = q
    ? items.filter(
        (c) =>
          c.clientName.toLowerCase().includes(q.toLowerCase()) ||
          c.clientLabel.includes(q),
      )
    : items;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
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
            No hay conversaciones todavía.
            <br />
            Cuando llegue un mensaje a tu WhatsApp aparecerá acá.
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
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/40",
                      isSelected && "bg-accent",
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {initials || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.clientName}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{time}</span>
                      </div>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
