import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Variant = "default" | "primary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({ variant = "default", className, ...props }: Props) {
  const classNames = [styles.btn, styles[variant], className].filter(Boolean).join(" ");
  return <button className={classNames} {...props} />;
}