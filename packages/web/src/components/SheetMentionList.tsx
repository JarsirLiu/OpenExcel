import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

type SheetItem = { id: string; label: string };

export const MentionList = forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  { items: SheetItem[]; command: (item: SheetItem) => void }
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  const select = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  const upHandler = () => {
    setSelectedIndex((i) => (i + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((i) => (i + 1) % props.items.length);
  };

  const enterHandler = () => {
    select(selectedIndex);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowUp") { upHandler(); return true; }
      if (event.key === "ArrowDown") { downHandler(); return true; }
      if (event.key === "Enter") { enterHandler(); return true; }
      return false;
    },
  }));

  return (
    <div style={{
      background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)", overflow: "hidden", minWidth: 160,
      maxHeight: 200, overflowY: "auto",
    }}>
      {props.items.length === 0 ? (
        <div style={{ padding: "8px 12px", fontSize: 13, color: "#999" }}>无匹配的 Sheet</div>
      ) : (
        props.items.map((item, i) => (
          <div
            key={item.id}
            onClick={() => select(i)}
            style={{
              padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#1f1f1f",
              background: i === selectedIndex ? "#e8f4fd" : "transparent",
              borderBottom: i < props.items.length - 1 ? "1px solid #f0f0f0" : "none",
            }}
          >
            <span style={{ fontWeight: 500 }}>{item.label}</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: "#999" }}>Sheet</span>
          </div>
        ))
      )}
    </div>
  );
});

export function createMentionSuggestion(
  sheets: { id: number; name: string }[],
): Partial<SuggestionOptions> {
  const items: SheetItem[] = sheets.map((s) => ({
    id: `sheet:${s.id}`,
    label: s.name,
  }));

  return {
    char: "@",
    items: ({ query }) =>
      items.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()),
      ),
    render: () => {
      let component: ReactRenderer<{ onKeyDown: (event: KeyboardEvent) => boolean }>;
      let unmount: () => void;

      return {
        onStart: (props: SuggestionProps) => {
          component = new ReactRenderer(MentionList, {
            props: {
              items: props.items as SheetItem[],
              command: (item: SheetItem) => {
                props.command(item);
              },
            },
            editor: props.editor,
          });
          unmount = props.mount(component.element);
        },
        onUpdate: (props: SuggestionProps) => {
          component.updateProps({
            items: props.items as SheetItem[],
            command: (item: SheetItem) => {
              props.command(item);
            },
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            unmount?.();
            return true;
          }
          return component.ref?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
          unmount?.();
          component?.destroy();
        },
      };
    },
  };
}