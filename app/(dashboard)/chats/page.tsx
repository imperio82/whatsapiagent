"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConversationList } from "@components/features/chats/conversation-list";
import { MessageThread } from "@components/features/chats/message-thread";
import { ClientPanel } from "@components/features/chats/client-panel";
import { useConversations } from "@hooks/use-conversations";

export default function ChatsPage(): React.ReactElement {
  return (
    <Suspense>
      <Chats />
    </Suspense>
  );
}

function Chats(): React.ReactElement {
  // `?c=<id>` abre esa conversación (lo usan la alerta de "pide una persona" y la campana).
  const requestedId = useSearchParams().get("c");
  const [selectedId, setSelectedId] = useState<string | null>(requestedId);
  const [showArchived, setShowArchived] = useState(false);
  const { data: conversations } = useConversations(showArchived ? "ARCHIVED" : undefined);

  useEffect(() => {
    if (requestedId) setSelectedId(requestedId);
  }, [requestedId]);

  return (
    <div className="-mx-6 -my-6 grid h-[calc(100vh-3.5rem)] grid-cols-[320px_1fr_320px] grid-rows-1 overflow-hidden border-t border-border">
      <aside className="border-r border-border bg-card">
        <ConversationList
          items={conversations ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showArchived={showArchived}
          onShowArchivedChange={(value) => {
            setShowArchived(value);
            setSelectedId(null);
          }}
          onArchived={(id) => {
            if (id === selectedId) setSelectedId(null);
          }}
        />
      </aside>
      <section className="bg-background">
        <MessageThread conversationId={selectedId} />
      </section>
      <aside className="border-l border-border bg-card">
        <ClientPanel conversationId={selectedId} />
      </aside>
    </div>
  );
}
