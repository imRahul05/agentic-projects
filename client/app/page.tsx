import { ChatPanel } from "@/components/chat/chat-panel";

/**
 * Thin server shell. Everything interactive — the stream, the composer, the
 * capabilities query — lives in `ChatPanel`, the one client boundary.
 */
export default function Page() {
  return (
    <main className="flex min-h-0 flex-1 flex-col" aria-label="Weather agent chat">
      <ChatPanel />
    </main>
  );
}
