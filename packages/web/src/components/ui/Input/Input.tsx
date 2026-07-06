import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

type Props = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: Props) {
  const classNames = [styles.input, className].filter(Boolean).join(" ");
  return <input className={classNames} {...props} />;
}