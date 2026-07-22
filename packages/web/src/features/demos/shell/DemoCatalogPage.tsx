import { Link } from "react-router-dom";
import { routePaths } from "@/app/routePaths";
import { demoCatalog } from "../catalog";
import { ProgressiveImage } from "@/shared/ui";
import styles from "./DemoCatalogPage.module.css";

export function DemoCatalogPage() {
  const demos = [...demoCatalog].sort(
    (a, b) => a.marketing.featuredOrder - b.marketing.featuredOrder,
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} to={routePaths.home}>
          ← 返回首页
        </Link>
        <h1 className={styles.title}>AI Excel 案例库</h1>
        <p className={styles.subtitle}>选择一个预设业务场景，播放完整的 AI 表格分析与写入流程。</p>
      </header>
      <section className={styles.grid}>
        {demos.map((demo, index) => (
          <Link className={styles.card} key={demo.id} to={routePaths.demo(demo.id)}>
            <div className={styles.cover}>
              <ProgressiveImage
                src={demo.marketing.coverImage}
                alt={demo.marketing.coverAlt}
                priority={index === 0}
              />
            </div>
            <span className={styles.index}>CASE {String(index + 1).padStart(2, "0")}</span>
            <h2>{demo.marketing.marketingTitle}</h2>
            <p>{demo.marketing.summary}</p>
            <small>
              {demo.marketing.category} · {demo.marketing.proofMetric}
            </small>
            <span className={styles.open}>播放 AI 回放 ↗</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
