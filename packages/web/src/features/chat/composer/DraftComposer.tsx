import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import { MessageList } from "@/features/chat/message/MessageList";
import styles from "./DraftComposer.module.css";

type Props = {
  workspaceId: number;
  onSend: (text: string) => Promise<number>;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
};

export function DraftComposer({ workspaceId, onSend, onAttachExcel, referenceCacheRevision }: Props) {
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