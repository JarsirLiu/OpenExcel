import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { routePaths } from "@/app/routePaths";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { t } from "@/lib/i18n";
import styles from "./AuthScreen.module.css";
import { MarketingShowcase } from "./MarketingShowcase";

const previewRows = [
  ["材料学院", "¥128,400", "73%", "正常"],
  ["人工智能", "¥96,800", "91%", "关注"],
  ["生命科学", "¥154,200", "64%", "正常"],
  ["经济管理", "¥112,600", "108%", "超预算"],
];

export type AuthMode = "login" | "register";

type Props = {
  mode: AuthMode;
  submitting: boolean;
  error: string | null;
  onLogin: (input: { email: string; password: string }) => Promise<unknown>;
  onRegister: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<unknown>;
  onSwitchMode: () => void;
  showMarketing?: boolean;
};

export function AuthScreen({
  mode,
  submitting,
  error,
  onLogin,
  onRegister,
  onSwitchMode,
  showMarketing = false,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (mode === "login") {
        await onLogin({ email, password });
        return;
      }
      await onRegister({
        email,
        password,
        displayName: displayName.trim() || undefined,
      });
    } catch {
      // The auth hook already stores the message for the UI.
    }
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <Link className={styles.brand} to={routePaths.home}>
          <span className={styles.brandMark}>
            <span className={styles.markLine}></span>
            <span className={styles.markLine}></span>
            <span className={styles.markLine}></span>
          </span>
          OpenExcel
        </Link>
        <Link className={styles.catalogLink} to={routePaths.demos}>
          案例库
        </Link>
      </nav>

      <div className={styles.hero}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            {mode === "login" ? "AI 操控 Excel，表格工作事半功倍" : "从一张表，开始完成整项工作。"}
          </h1>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            {mode === "register" && (
              <label className={styles.field} htmlFor="auth-display-name">
                <span>{t("display_name", "显示名称")}</span>
                <Input
                  id="auth-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="你的姓名"
                  autoComplete="name"
                />
              </label>
            )}

            <label className={styles.field} htmlFor="auth-email">
              <span>{t("email", "邮箱地址")}</span>
              <Input
                id="auth-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@organization.cn"
                type="email"
                autoComplete="email"
                required
              />
            </label>

            <label className={styles.field} htmlFor="auth-password">
              <span>{t("password", "密码")}</span>
              <Input
                id="auth-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入登录密码"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>

            {error && <div className={styles.error}>{error}</div>}

            <Button variant="primary" type="submit" disabled={submitting} className={styles.submit}>
              {submitting
                ? t("processing", "处理中…")
                : mode === "login"
                  ? t("sign_in", "登录")
                  : t("create_account", "创建账号")}
            </Button>
          </form>

          <div className={styles.formFooter}>
            <p className={styles.switch}>
              {mode === "login" ? t("no_account", "还没有账号？") : t("has_account", "已有账号？")}
              <button type="button" className={styles.switchLink} onClick={onSwitchMode}>
                {mode === "login" ? t("sign_up", "注册") : t("sign_in", "登录")}
              </button>
            </p>
          </div>
        </div>

        <div className={styles.visual}>
          <div className={styles.visualHalo} />
          <div className={styles.visualCard}>
            <div className={styles.visualToolbar}>
              <span className={styles.previewMark}>
                <i />
                <i />
                <i />
              </span>
              <span className={styles.previewTitle}>2026 年部门预算执行表.xlsx</span>
              <span className={styles.liveStatus}>
                <i /> AI 正在核查
              </span>
            </div>
            <div className={styles.previewBody}>
              <div className={styles.sheetPane}>
                <div className={styles.sheetTools}>
                  <span className={styles.sheetTab}>预算执行</span>
                  <span className={styles.formula}>fx&nbsp;&nbsp;= 实际支出 / 年度预算</span>
                </div>
                <div className={styles.visualGrid}>
                  <div className={`${styles.gridRow} ${styles.gridHead}`}>
                    <div />
                    <div>部门</div>
                    <div>年度预算</div>
                    <div>执行率</div>
                    <div>状态</div>
                  </div>
                  {previewRows.map((row, rowIndex) => (
                    <div key={row[0]} className={styles.gridRow}>
                      <div className={styles.rowNum}>{rowIndex + 2}</div>
                      {row.map((cell, columnIndex) => (
                        <div
                          key={cell}
                          className={`${styles.cell} ${rowIndex === 3 ? styles.riskCell : ""} ${columnIndex === 3 ? styles.statusCell : ""}`}
                        >
                          {cell}
                        </div>
                      ))}
                    </div>
                  ))}
                  <span className={styles.scanLine} />
                </div>
              </div>
              <aside className={styles.analystPane}>
                <div className={styles.analystHead}>
                  <span className={styles.analystAvatar}>AI</span>
                  <span>
                    <strong>预算核查助手</strong>
                    <small>基于当前工作簿</small>
                  </span>
                </div>
                <p>已关联预算、支出和部门信息，正在定位需要优先复核的项目。</p>
                <ol className={styles.analysisSteps}>
                  <li className={styles.stepDone}>
                    <i /> 读取 8 个部门、426 条记录
                  </li>
                  <li className={styles.stepDone}>
                    <i /> 计算预算执行率与剩余额度
                  </li>
                  <li className={styles.stepActive}>
                    <i /> 标记超预算与执行偏慢项目
                  </li>
                </ol>
                <div className={styles.analysisResult}>
                  <span>发现</span>
                  <strong>12</strong>
                  <span>项需要复核</span>
                </div>
              </aside>
            </div>
            <div className={styles.visualFooter}>
              <span>
                <i /> 原始数据
              </span>
              <span>
                <i /> AI 操作
              </span>
              <span className={styles.footerActive}>
                <i /> 结果写回
              </span>
              <small>全程可查看、可暂停、可复现</small>
            </div>
          </div>
          <div className={styles.proofCard}>
            <span>本次处理</span>
            <strong>426 行</strong>
            <i />
            <span>预计节省 2.4 小时</span>
          </div>
        </div>
      </div>

      {showMarketing && <MarketingShowcase />}
    </div>
  );
}
