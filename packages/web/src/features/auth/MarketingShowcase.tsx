import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { routePaths } from "@/app/routePaths";
import { demoRegistry } from "@/features/demos/registry";
import type { DemoCategory, DemoDefinition, DemoSheet } from "@/features/demos/runtime/replayTypes";
import { ProgressiveImage } from "@/shared/ui";
import styles from "./MarketingShowcase.module.css";

const categories: Array<DemoCategory | "全部"> = ["全部", "财务", "销售", "运营", "人力", "教育"];
const processSteps = [
  { index: "01", title: "导入数据", description: "保留工作簿、公式与表结构" },
  { index: "02", title: "AI 分析", description: "读取、计算并定位业务异常" },
  { index: "03", title: "生成结果", description: "把结论和建议写回表格" },
];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function formatCell(value: string | number) {
  if (typeof value !== "number") return value;
  return Math.abs(value) >= 10000
    ? new Intl.NumberFormat("zh-CN", { notation: "compact" }).format(value)
    : String(value);
}

function getPreviewSheet(demo: DemoDefinition): DemoSheet | undefined {
  return demo.initialWorkbooks[0]?.sheets[0];
}

function WorkbookPreview({ demo, compact = false }: { demo: DemoDefinition; compact?: boolean }) {
  const sheet = getPreviewSheet(demo);
  const columns = sheet?.columns.slice(0, compact ? 3 : 4) ?? [];
  const rows = sheet?.rows.slice(1, compact ? 4 : 5) ?? [];

  return (
    <div
      className={`${styles.workbook} ${compact ? styles.workbookCompact : ""}`}
      aria-hidden="true"
    >
      <div className={styles.workbookBar}>
        <span className={styles.workbookMark}>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.workbookName}>{demo.initialWorkbooks[0]?.name}</span>
        <span className={styles.workbookStatus}>AI 分析完成</span>
      </div>
      <div className={styles.stageBar}>
        <span className={styles.stage}>原始数据</span>
        <span className={styles.stage}>AI 操作</span>
        <span className={`${styles.stage} ${styles.stageActive}`}>最终结果</span>
      </div>
      <div className={styles.sheet}>
        <div className={styles.sheetName}>{sheet?.name}</div>
        <div className={styles.table} style={{ "--column-count": columns.length } as CSSProperties}>
          {columns.map((column) => (
            <span className={styles.tableHead} key={column}>
              {column}
            </span>
          ))}
          {rows.flatMap((row, rowIndex) =>
            row.slice(0, columns.length).map((cell, columnIndex) => (
              <span
                className={`${styles.tableCell} ${columnIndex === columns.length - 1 && rowIndex < 2 ? styles.tableCellEmphasis : ""}`}
                key={`${rowIndex}-${columnIndex}`}
              >
                {formatCell(cell.value)}
              </span>
            )),
          )}
        </div>
      </div>
      {!compact && (
        <div className={styles.analysisNote}>
          <span className={styles.analysisPulse} />
          <span>{demo.marketing.proofMetric}</span>
        </div>
      )}
    </div>
  );
}

function FeaturedCase({ demo, index }: { demo: DemoDefinition; index: number }) {
  return (
    <article
      className={`${styles.featuredCase} ${index % 2 === 1 ? styles.featuredCaseReverse : ""} ${styles.reveal}`}
      data-reveal
      data-theme={demo.marketing.theme}
    >
      <Link
        className={styles.featuredLink}
        to={routePaths.demo(demo.id)}
        aria-label={`观看${demo.marketing.marketingTitle}完整回放`}
      >
        <div className={styles.caseMedia}>
          <ProgressiveImage
            src={demo.marketing.coverImage}
            alt={demo.marketing.coverAlt}
            priority={index === 0}
          />
          <div className={styles.mediaShade} />
          <div className={styles.caseNumber}>CASE {String(index + 1).padStart(2, "0")}</div>
          <div className={styles.productWindow}>
            <WorkbookPreview demo={demo} />
          </div>
        </div>
        <div className={styles.caseCopy}>
          <div className={styles.caseMeta}>
            <span>{demo.marketing.category}</span>
            <span>{demo.marketing.proofMetric}</span>
          </div>
          <h3>{demo.marketing.marketingTitle}</h3>
          <p>{demo.marketing.summary}</p>
          <span className={styles.caseCta}>
            观看完整回放 <ArrowIcon />
          </span>
        </div>
      </Link>
    </article>
  );
}

function CompactCase({ demo, index }: { demo: DemoDefinition; index: number }) {
  return (
    <Link
      className={`${styles.compactCase} ${styles.reveal}`}
      data-reveal
      to={routePaths.demo(demo.id)}
      style={{ "--reveal-delay": `${index * 80}ms` } as CSSProperties}
      aria-label={`观看${demo.marketing.marketingTitle}完整回放`}
    >
      <div className={styles.compactMedia}>
        <ProgressiveImage src={demo.marketing.coverImage} alt={demo.marketing.coverAlt} />
        <div className={styles.compactWorkbook}>
          <WorkbookPreview demo={demo} compact />
        </div>
      </div>
      <div className={styles.compactCopy}>
        <span className={styles.compactMeta}>
          {demo.marketing.category} · {demo.marketing.proofMetric}
        </span>
        <h3>{demo.marketing.marketingTitle}</h3>
        <p>{demo.marketing.summary}</p>
        <i className={styles.compactProgress} />
      </div>
    </Link>
  );
}

export function MarketingShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const [activeCategory, setActiveCategory] = useState<DemoCategory | "全部">("全部");
  const demos = useMemo(
    () =>
      Object.values(demoRegistry).sort(
        (a, b) => a.marketing.featuredOrder - b.marketing.featuredOrder,
      ),
    [],
  );
  const visibleDemos =
    activeCategory === "全部"
      ? demos
      : demos.filter((demo) => demo.marketing.category === activeCategory);
  const featuredDemos = activeCategory === "全部" ? visibleDemos.slice(0, 6) : [];
  const compactDemos = activeCategory === "全部" ? visibleDemos.slice(6) : visibleDemos;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12%", threshold: 0.12 },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [activeCategory]);

  return (
    <main className={styles.marketing} ref={rootRef}>
      <section
        className={`${styles.bridge} ${styles.reveal}`}
        data-reveal
        aria-labelledby="marketing-heading"
      >
        <div className={styles.bridgeIntro}>
          <span className={styles.eyebrow}>AI 操控 Excel</span>
          <h2 id="marketing-heading">让 AI 辅助您的数据分析和处理工作</h2>
        </div>
        <ol className={styles.process}>
          {processSteps.map((step, index) => (
            <li key={step.index} style={{ "--step-delay": `${index * 140}ms` } as CSSProperties}>
              <span className={styles.processIndex}>{step.index}</span>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </li>
          ))}
        </ol>
        <fieldset className={styles.categories} aria-label="按业务类型筛选案例">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            >
              {category}
              <span className={styles.categoryCount}>
                {category === "全部"
                  ? demos.length
                  : demos.filter((demo) => demo.marketing.category === category).length}
              </span>
            </button>
          ))}
        </fieldset>
      </section>

      {featuredDemos.length > 0 && (
        <section className={styles.featured} aria-label="精选案例">
          {featuredDemos.map((demo, index) => (
            <FeaturedCase demo={demo} index={index} key={demo.id} />
          ))}
        </section>
      )}

      {compactDemos.length > 0 && (
        <section
          className={styles.moreCases}
          aria-label={activeCategory === "全部" ? "更多真实场景" : `${activeCategory}场景`}
        >
          <div className={`${styles.sectionHeading} ${styles.reveal}`} data-reveal>
            <span className={styles.eyebrow}>
              {activeCategory === "全部" ? "更多真实场景" : `${activeCategory}场景`}
            </span>
          </div>
          <div className={styles.compactGrid}>
            {compactDemos.map((demo, index) => (
              <CompactCase demo={demo} index={index} key={demo.id} />
            ))}
          </div>
        </section>
      )}

      <section className={`${styles.finalCta} ${styles.reveal}`} data-reveal>
        <span className={styles.eyebrow}>现在开始</span>
        <h2>
          选择一个真实场景，
          <br />
          看看 OpenExcel 如何完成工作。
        </h2>
        <div>
          <Link className={styles.primaryCta} to={routePaths.demos}>
            浏览全部案例 <ArrowIcon />
          </Link>
          <Link className={styles.secondaryCta} to="/register">
            开始使用
          </Link>
        </div>
      </section>
    </main>
  );
}
