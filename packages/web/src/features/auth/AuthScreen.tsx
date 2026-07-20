import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { t } from "@/lib/i18n";
import styles from "./AuthScreen.module.css";

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
  onOpenDemo: () => void;
  onOpenBankDemo: () => void;
  onOpenDemoCatalog: () => void;
};

export function AuthScreen({
  mode,
  submitting,
  error,
  onLogin,
  onRegister,
  onSwitchMode,
  onOpenDemo,
  onOpenBankDemo,
  onOpenDemoCatalog,
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
        <span className={styles.brand}>
          <span className={styles.brandMark}>
            <span className={styles.markLine}></span>
            <span className={styles.markLine}></span>
            <span className={styles.markLine}></span>
          </span>
          OpenExcel
        </span>
      </nav>

      <div className={styles.hero}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            {mode === "login" ? t("welcome_back", "欢迎回来。") : t("get_started", "开始使用。")}
          </h1>
          <p className={styles.subtitle}>
            {mode === "login"
              ? t("sign_in_desc", "登录你的工作区，继续之前的工作。")
              : t("sign_up_desc", "创建免费账号，开始使用智能表格。")}
          </p>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            {mode === "register" && (
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("display_name", "显示名称")}
                autoComplete="name"
              />
            )}

            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email", "邮箱地址")}
              type="email"
              autoComplete="email"
              required
            />

            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("password", "密码")}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />

            {error && <div className={styles.error}>{error}</div>}

            <Button variant="primary" type="submit" disabled={submitting} className={styles.submit}>
              {submitting
                ? t("processing", "处理中…")
                : mode === "login"
                  ? t("sign_in", "登录")
                  : t("create_account", "创建账号")}
            </Button>
          </form>

          <p className={styles.switch}>
            {mode === "login" ? t("no_account", "还没有账号？") : t("has_account", "已有账号？")}
            <button type="button" className={styles.switchLink} onClick={onSwitchMode}>
              {mode === "login" ? t("sign_up", "注册") : t("sign_in", "登录")}
            </button>
          </p>
        </div>

        <div className={styles.visual}>
          <div className={styles.visualCard}>
            <div className={styles.visualToolbar}>
              <span className={styles.toolDot}></span>
              <span className={styles.toolDot}></span>
              <span className={styles.toolDot}></span>
              <span className={`${styles.toolTab} ${styles.toolTabActive}`}>Sheet1</span>
              <span className={styles.toolTab}>Chart</span>
            </div>
            <div className={styles.visualGrid}>
              <div className={`${styles.gridRow} ${styles.gridHead}`}>
                <div></div>
                <div>A</div>
                <div>B</div>
                <div>C</div>
                <div>D</div>
              </div>
              {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className={styles.gridRow}>
                  <div className={styles.rowNum}>{row + 1}</div>
                  <div className={`${styles.cell} ${row === 1 ? styles.cellFilledA : ""}`}></div>
                  <div
                    className={`${styles.cell} ${row === 0 ? styles.cellFilledB : row === 2 ? styles.cellFilledA : ""}`}
                  ></div>
                  <div className={`${styles.cell} ${row === 3 ? styles.cellFilledC : ""}`}></div>
                  <div className={`${styles.cell} ${row === 4 ? styles.cellFilledB : ""}`}></div>
                </div>
              ))}
            </div>
            <div className={styles.visualSidebar}>
              <div className={styles.sidebarLine}></div>
              <div className={styles.sidebarLine}></div>
              <div className={styles.sidebarLine}></div>
              <div className={styles.sidebarLine}></div>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.demosSection}>
        <div className={styles.demosHeader}>
          <span className={styles.demosEyebrow}>AI Excel 案例</span>
          <button className={styles.demosLink} type="button" onClick={onOpenDemoCatalog}>
            选择案例 <span aria-hidden="true">{"\u2193"}</span>
          </button>
        </div>
        <div className={styles.demosGrid}>
          <div className={styles.demoCard} onClick={onOpenBankDemo}>
            <div className={styles.demoCardLeft}>
              <div className={styles.previewSheet}>
                <div className={styles.previewHead}>
                  <span>银行流水核查表</span>
                  <span className={styles.previewTag}>审计示例</span>
                </div>
                <div className={styles.previewTable}>
                  <div className={styles.previewTableHead}>
                    <span>流水号</span>
                    <span>交易摘要</span>
                    <span>金额</span>
                    <span>核查状态</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>...003</span>
                    <span>项目回款</span>
                    <span>560,000</span>
                    <span className="status-pending">大额</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>...005</span>
                    <span>咨询服务费</span>
                    <span>25,000</span>
                    <span className="status-partial">重复</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>...009</span>
                    <span>物流费用</span>
                    <span>42,000</span>
                    <span className="status-pending">余额异常</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>...010</span>
                    <span>临时借款</span>
                    <span>300,000</span>
                    <span className="status-pending">高风险</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>...001</span>
                    <span>销售货款</span>
                    <span>180,000</span>
                    <span className="status-paid">正常</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.demoCardRight}>
              <span className={styles.demoTag}>财务审计</span>
              <h3>银行流水智能核查</h3>
              <p>自动检查重复流水、字段缺失、收支逻辑、余额连续性和大额异常交易。</p>
              <button className={styles.demoCta} type="button">
                播放 AI 回放
                <span aria-hidden="true">{"\u2197"}</span>
              </button>
            </div>
          </div>
          <div className={styles.demoCard} onClick={onOpenDemo}>
            <div className={styles.demoCardLeft}>
              <div className={styles.previewSheet}>
                <div className={styles.previewHead}>
                  <span>进销存核对表</span>
                  <span className={styles.previewTag}>示例数据</span>
                </div>
                <div className={styles.previewTable}>
                  <div className={styles.previewTableHead}>
                    <span>产品名称</span>
                    <span>进货单价</span>
                    <span>销售数量</span>
                    <span>期末存量</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>雪碧碳酸饮料</span>
                    <span>2.42</span>
                    <span>8</span>
                    <span className="status-paid">40</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>蒙牛纯牛奶</span>
                    <span>2.30</span>
                    <span>6</span>
                    <span className="status-paid">66</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>天利肉松面包</span>
                    <span>1.50</span>
                    <span>1</span>
                    <span className="status-pending">0</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>沙琪玛</span>
                    <span>8.00</span>
                    <span>2</span>
                    <span className="status-pending">0</span>
                  </div>
                  <div className={styles.previewTableRow}>
                    <span>粉丝馆够味酸辣粉</span>
                    <span>3.98</span>
                    <span>8</span>
                    <span className="status-paid">40</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.demoCardRight}>
              <span className={styles.demoTag}>进销存核对</span>
              <h3>超市进货、出货数据核对</h3>
              <p>从系统单价表和单品进销存表匹配价格与数量，自动补齐核对表并保留公式。</p>
              <button className={styles.demoCta} type="button">
                播放 AI 回放
                <span aria-hidden="true">{"\u2197"}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
