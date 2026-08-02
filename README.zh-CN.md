# OpenExcel

<p align="center">
  <img src="packages/web/public/assets/openexcel-logo.svg" alt="OpenExcel Logo" width="112" />
</p>

<p align="center"><strong>面向 AI 的多工作表 Excel 工作台：导入数据、编辑表格、生成图表，并用自然语言完成公式工作。</strong></p>

<p align="center"><a href="README.md">English</a> · <a href="https://github.com/JarsirLiu/OpenExcel">GitHub</a> · <a href="https://github.com/JarsirLiu/OpenExcel/issues">Issues</a></p>

https://github.com/user-attachments/assets/327c10d1-8f9d-45d7-937d-031553be58dc

OpenExcel 保留熟悉的电子表格网格，同时在旁边提供 AI 工作区。导入工作簿，用自然语言描述你想要的变化，检查结果，再导出最终文件。

> 当前项目仍在快速迭代中。下面的能力说明以当前代码和回放案例为准，不代表尚未实现的未来计划。

## 当前能做什么

| 场景 | 当前能力 |
| --- | --- |
| 工作区 | 管理工作区、工作簿和会话 |
| Excel 文件 | 导入支持的 XLSX/XLS/CSV 内容，并导出 XLSX |
| 表格编辑 | 读取、写入、清空和检查单元格区域，支持公式相关操作 |
| 图表 | 创建、查看、更新、删除并渲染持久化图表 |
| AI 操作 | 通过自然语言对话请求工作簿变化 |
| 安全复核 | 查看工具进度、变更预览、结构化错误和撤销检查点 |
| 演示案例 | 浏览内置 Examples 中的只读回放场景 |

例如：

```text
请根据 Sales 工作表生成月度销售图表，并为每一行补充利润率公式。
```

AI 会把意图转换为表格和图表操作；导出或分享前，最终结果仍由你确认。

## 5 分钟本地开发

要求：Node.js 22+、pnpm 10.20.0，以及一个openai兼容的模型接口。

```powershell
pnpm install
cp .env.example .env
pnpm db:prepare
pnpm dev
```

在 `.env` 中填写：

```env
MODEL_BASE_URL=https://your-model-endpoint.example/v1
MODEL_API_KEY=your-api-key
MODEL_NAME=your-model-name
```

地址：

- Web：`http://localhost:5173`
- API：`http://localhost:4000`
- 健康检查：`http://localhost:4000/api/health`
- 案例库：`http://localhost:5173/demos`

## 本地生产模式：已经有，但入口分两种

项目不是只有本地开发启动：

- `pnpm dev`：Vite 和 Fastify 分开运行，适合开发。
- `docker compose up -d --build`：构建前端并让 Fastify 托管静态文件，配合 SQLite、文件存储和自动迁移，适合本地生产模拟。
- `pnpm prod`：构建 Web，准备数据库，然后启动 Server，适合不使用 Docker 的本地冒烟测试。

推荐使用 Docker：

```powershell
cp .env.example .env
docker compose up -d --build
docker compose ps
```

然后打开 `http://127.0.0.1:4000`。数据和上传文件保存在 `openexcel-data` volume 中。

注意：`pnpm preview` 只是 Vite 前端预览，不会启动 API 或数据库，不能当作完整生产启动。

完整部署说明见 [docs/current/docker-deployment.md](docs/current/docker-deployment.md)。

## 更新 README 演示

当演示流程变化时，替换 GitHub user-attachments 中的演示视频地址。

推荐镜头顺序：

1. 导入一个 Excel 工作簿。
2. 输入“生成月度图表，并为每行补充利润率公式”。
3. 展示图表、公式预览和导出动作。

## Roadmap

- [x] 工作区、工作簿、工作表、导入导出、图表和 AI 对话循环
- [x] 只读回放案例
- [x] Docker 本地生产模式
- [x] 用真实端到端录屏替换占位位置
- [ ] 增加仓库 License 并发布首个稳定版本
- [ ] 用真实测量数据替换宣传中的时间节省数字
- [ ] 补充备份、可观测性和生产加固文档
- [ ] 完善 PostgreSQL 多实例部署说明

## 许可证

仓库当前还没有发布 LICENSE 文件。在添加许可证之前，不要默认代码可以被再分发或用于商业用途。
