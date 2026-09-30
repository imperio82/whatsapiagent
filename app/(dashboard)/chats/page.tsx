"use client";

import { useState } from "react";
import { ConversationList } from "@components/features/chats/conversation-list";
import { MessageThread } from "@components/features/chats/message-thread";
import { ClientPanel } from "@components/features/chats/client-panel";
import { useConversations } from "@hooks/use-conversations";

export default function ChatsPage(): React.ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: conversations } = useConversations();

  return (
    <div className="-mx-6 -my-6 grid h-[calc(100vh-3.5rem)] grid-cols-[320px_1fr_320px] grid-rows-1 overflow-hidden border-t border-border">
      <aside className="border-r border-border bg-card">
        <ConversationList
          items={conversations ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
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
