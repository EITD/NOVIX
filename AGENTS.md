# Repository Guidelines

## Project Structure & Module Organization
- `backend/` FastAPI 后端，核心代码位于 `backend/app/`（routers、services、schemas、storage 等）。主要配置在 `backend/config.yaml` 与 `backend/.env`。
- `frontend/` React + Vite 前端，源码在 `frontend/src/`，UI 组件、hooks、context 分层清晰。
- `data/` 为运行时数据目录（自动创建），包含项目 cards、drafts、traces 等。
- 其他入口与脚本：`start.py`、`start.bat`、`start.sh`、`build_release.py`、`docs/`。

## Build, Test, and Development Commands
- 一键启动（自动安装依赖并启动前后端）：`python start.py` 或 `start.bat` / `./start.sh`（在仓库根目录执行）。
- 手动启动：
  - 后端：`cd "backend"; python -m app.main`（默认 http://localhost:8000）
  - 前端：`cd "frontend"; npm run dev`（默认 http://localhost:3000）
- 前端构建：`cd "frontend"; npm run build`；预览：`cd "frontend"; npm run preview`。
- 打包发布：`python build_release.py`（生成 Windows 可执行包）。

## Coding Style & Naming Conventions
- Python 遵循 PEP8，4 空格缩进；模块/函数 `snake_case`，类 `PascalCase`。
- 前端使用 2 空格缩进、无分号风格；组件 `PascalCase`（如 `App.jsx`），hooks 以 `use` 开头。
- 保持现有目录职责：路由在 `backend/app/routers/`，业务逻辑在 `backend/app/services/`，前端视图组件放在 `frontend/src/components/`。

## Testing Guidelines
- 后端测试采用 `pytest`（依赖在 `backend/requirements.txt` 中标注为可选）。
- 运行方式：`cd "backend"; pytest`。
- 当前仓库未发现现成测试目录，新增测试请放在 `backend/tests/`，文件命名 `test_*.py`。

## Commit & Pull Request Guidelines
- 当前目录未发现 `.git`，无法从历史推断规范；请沿用 README 示例提交格式：`feat: add ...`。
- PR 标题建议使用：`feat|fix|docs|refactor: 简要描述`。
- PR 需包含变更说明、技术方案；涉及 UI 请附截图，并确保 `npm run build` 通过。

## Security & Configuration Tips
- 复制并编辑 `backend/.env`（来源 `backend/.env.example`），严禁提交密钥。
- LLM Keys 在 `.env` 中配置；端口修改需同步更新 `backend/.env` 与 `frontend/vite.config.js`。
- 数据为本地文件存储（`data/{project_name}/`），涉及结构调整需同步更新读写逻辑。

## Architecture Notes
- 详细架构与模块说明请先阅读 `CLAUDE.md`，保持多代理工作流与上下文工程设计的一致性。
