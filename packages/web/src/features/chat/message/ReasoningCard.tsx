import { useState } from "react";
import styles from "./ReasoningCard.module.css";

type Props = {
  reasoning: string;
};

export function ReasoningCard({ reasoning }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`${styles.reasoning} ${open ? styles.open : ""}`}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className={styles.chevron} aria-hidden="true" />
        思考过程
      </button>
      {open && <div className={styles.content}>{reasoning}</div>}
    </div>
  );
}
