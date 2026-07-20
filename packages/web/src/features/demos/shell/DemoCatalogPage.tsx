import { Link } from "react-router-dom";
import { demoRegistry } from "../registry";
import styles from "./DemoCatalogPage.module.css";

export function DemoCatalogPage() {
  const demos = Object.values(demoRegistry);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} to="/login">
          ← 返回登录页
        </Link>
        <h1 className={styles.title}>AI Excel 案例库</h1>
        <p className={styles.subtitle}>选择一个预设业务场景，播放完整的 AI 表格分析与写入流程。</p>
      </header>
      <section className={styles.grid}>
        {demos.map((demo, index) => (
          <Link className={styles.card} key={demo.id} to={demo.route}>
            <span className={styles.index}>CASE {String(index + 1).padStart(2, "0")}</span>
            <h2>{demo.sessionName.replace(/\s*Demo$/, "")}</h2>
            <p>{demo.prompt}</p>
            <span className={styles.open}>播放 AI 回放 ↗</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
