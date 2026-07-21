import { createAnalysisScenario, demoCell, demoRow, resultCell } from "../scenarioFactory";

const percent = (value: number) => demoCell(value, { numberFormat: "0.0%" });

export const campusRecruitmentAnalysisDemo = createAnalysisScenario({
  id: "campus-recruitment-analysis",
  marketing: {
    category: "人力",
    marketingTitle: "校园招聘分析",
    summary: "比较渠道、岗位和候选人漏斗，找到高效来源与简历、笔试、面试中的流失环节。",
    coverImage: "/demo-covers/campus-recruitment.webp",
    coverAlt: "招聘人员与候选人在办公室进行面试",
    proofMetric: "5 个渠道 · 6 层漏斗",
    featuredOrder: 12,
    theme: "sage",
  },
  workspaceId: -150,
  workspaceName: "人力分析演示",
  sessionName: "校招简历投递综合分析 Demo",
  prompt:
    "请分析校招各渠道的投递、筛选、笔试、面试、Offer和入职数据，计算各环节转化率，识别高效渠道与流失环节，并输出HR行动建议和预警指标。",
  workbookName: "2026届校园招聘数据",
  sourceSheets: [
    {
      name: "渠道漏斗",
      columns: [
        "招聘渠道",
        "简历投递",
        "通过筛选",
        "参加笔试",
        "进入面试",
        "发放Offer",
        "确认入职",
      ],
      rows: [
        demoRow("校园宣讲会", 860, 420, 310, 168, 72, 58),
        demoRow("招聘网站", 1420, 390, 250, 104, 38, 22),
        demoRow("员工内推", 320, 206, 164, 112, 61, 52),
        demoRow("高校就业网", 680, 248, 176, 83, 31, 20),
        demoRow("社交媒体", 510, 118, 70, 29, 9, 5),
      ],
    },
    {
      name: "岗位需求",
      columns: ["岗位", "计划人数", "Offer人数", "确认入职", "平均招聘周期（天）"],
      rows: [
        demoRow("研发工程师", 70, 82, 59, 36),
        demoRow("产品经理", 24, 25, 18, 41),
        demoRow("销售培训生", 45, 38, 32, 28),
        demoRow("供应链专员", 20, 18, 15, 33),
        demoRow("财务管培生", 16, 14, 12, 39),
      ],
    },
  ],
  resultSheet: {
    name: "校招诊断",
    columns: ["分析对象", "核心指标", "结果", "诊断", "HR行动建议"],
    rows: [
      demoRow(
        "员工内推",
        "投递至入职转化率",
        percent(0.1625),
        resultCell("最高效渠道"),
        "扩大内推激励和重点岗位配额",
      ),
      demoRow(
        "校园宣讲会",
        "投递至入职转化率",
        percent(0.0674),
        resultCell("稳定"),
        "保留重点院校并优化宣讲转化",
      ),
      demoRow(
        "社交媒体",
        "投递至入职转化率",
        percent(0.0098),
        resultCell("低效", "danger"),
        "收缩泛流量投放并调整定向",
      ),
      demoRow(
        "招聘网站",
        "筛选通过率",
        percent(0.2746),
        resultCell("偏低", "warning"),
        "优化职位描述与简历筛选条件",
      ),
      demoRow(
        "研发工程师",
        "计划完成率",
        percent(0.8429),
        resultCell("缺口11人", "danger"),
        "增加技术内推和补录批次",
      ),
      demoRow(
        "销售培训生",
        "计划完成率",
        percent(0.7111),
        resultCell("缺口13人", "danger"),
        "加快Offer审批并启动候补名单",
      ),
      demoRow(
        "产品经理",
        "平均招聘周期",
        41,
        resultCell("周期过长", "warning"),
        "合并面试轮次并设置48小时反馈",
      ),
    ],
  },
  analysisSteps: [
    {
      id: "read-channel-funnel",
      title: "读取招聘漏斗",
      assistantText: "我先读取各渠道从投递到入职的完整漏斗，计算每一层转化率和最终入职贡献。",
      toolInput: "读取「渠道漏斗」A1:G6，计算各渠道分阶段转化率",
      toolOutput: "总投递 3,790 份，确认入职 157 人；整体投递至入职转化率 4.14%",
      activeSheet: "渠道漏斗",
      highlight: "A1:G6",
    },
    {
      id: "rank-channels",
      title: "评估渠道效率",
      assistantText:
        "员工内推的最终转化率达到 16.25%，明显领先；社交媒体只有 0.98%，招聘网站也在初筛环节损失较多。",
      toolInput: "按投递至入职转化率对渠道排序，并定位最大流失环节",
      toolOutput: "员工内推 16.25% 最高；社交媒体 0.98% 最低；招聘网站筛选通过率仅 27.46%",
      activeSheet: "渠道漏斗",
      highlight: "B2:G6",
    },
    {
      id: "review-position-gaps",
      title: "检查岗位缺口",
      assistantText:
        "研发工程师和销售培训生分别还缺 11 人和 13 人；产品经理招聘周期达到 41 天，是流程提速的重点岗位。",
      toolInput: "读取「岗位需求」A1:E6，计算计划完成率和招聘周期预警",
      toolOutput: "研发缺口 11 人，销售培训生缺口 13 人；产品经理招聘周期最长 41 天",
      activeSheet: "岗位需求",
      highlight: "A1:E6",
      toolExecutionDuration: 820,
    },
  ],
  writeTitle: "生成校招诊断",
  writeAssistantText:
    "我已生成渠道效率、岗位缺口和流程周期三类诊断，并把每个问题转化成可执行的 HR 行动建议。",
  writeToolInput: "将 7 项关键诊断和行动建议写入「校招诊断」A2:E8",
  writeToolOutput: "写入 7 项诊断：渠道问题 4 项、岗位缺口 2 项、周期预警 1 项",
  verifyAssistantText:
    "复核完成，各渠道转化率与漏斗原始数量一致，岗位缺口和招聘周期也与需求表匹配。",
  verifyToolOutput: "7 项诊断均通过源数据复核；高风险 3 项、关注 2 项、正常 2 项",
  finalText:
    "校招分析完成：建议扩大员工内推、收缩低效社交投放，并优先补齐研发和销售岗位缺口，同时压缩产品经理面试周期。",
});
