import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import { MessageList } from "@/features/chat/message/MessageList";
import { useSessionInfra } from "@/features/session/SessionShellContext";
import styles from "./DraftComposer.module.css";

type Props = {
  onSend: (text: string) => Promise<number>;
};

export function DraftComposer({ onSend }: Props) {
  const { workspaceId, onAttachExcel, referenceCacheRevision } = useSessionInfra();

  return (
    <div className={styles.container}>
      <MessageList messages={[]} isStreaming={false} />
      <ChatComposer
        isStreaming={false}
        onSend={(text) => { void onSend(text); }}
        onStop={() => {}}
        onAttachExcel={onAttachExcel}
        referenceCacheRevision={referenceCacheRevision}
        workspaceId={workspaceId}
      />
    </div>
  );
}