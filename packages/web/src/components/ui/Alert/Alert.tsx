import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Alert.module.css";

type AlertVariant = "info" | "warning" | "error" | "success";

type Props = HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  children: ReactNode;
};

export function Alert({ variant = "info", className, children, ...props }: Props) {
  const classNames = [styles.alert, styles[variant], className].filter(Boolean).join(" ");
  return (
    <div className={classNames} role={variant === "error" ? "alert" : "status"} {...props}>
      {children}
    </div>
  );
}
