# NOVIX 启动问题修复总结

## 问题诊断

您遇到的问题包括：

1. **批处理文件编码错误** - `start.bat` 文件使用 UTF-8 编码，导致中文字符被破坏
2. **缺失的静态文件目录** - 后端需要 `static/assets` 目录
3. **缺失的前端组件** - 三个 React 组件文件不存在：
   - `ExtractionPreview.jsx`
   - `AskUserDialog.jsx`
   - `EntityActivityDashboard.jsx`

## 已应用的修复

### 1. 编码问题修复
- 将 `start.bat` 从 UTF-8 转换为 GBK 编码
- 创建了新的 Python 启动脚本 `start.py`（跨平台兼容）
- 创建了简单的 Windows 批处理脚本 `start_simple.bat`

### 2. 缺失目录修复
- 创建了 `backend/static/assets/` 目录
- 创建了 `backend/static/index.html` 占位符文件

### 3. 缺失组件修复
创建了三个缺失的 React 组件：

#### ExtractionPreview.jsx
- 显示从写作会话中提取的实体（角色、地点、事实）
- 支持关闭按钮
- 使用 Card 组件和 Tailwind CSS 样式

#### AskUserDialog.jsx
- 模态对话框组件，用于在写作过程中询问用户
- 支持单选选项
- 使用 Framer Motion 动画
- 包含确认和取消按钮

#### EntityActivityDashboard.jsx
- 显示实体活动统计（角色、地点、事件、关系）
- 网格布局显示统计数据
- 列出活跃的角色和地点
- 支持数据溢出提示

## 现在可用的启动方式

### 方式 1：Python 启动脚本（推荐）

```bash
# 开发模式（前端热重载）
python start_dev.py

# 或使用原始脚本
python start.py
```

### 方式 2：Windows 批处理脚本

```bash
# 简单启动
start_simple.bat

# 或使用修复后的原始脚本
start.bat
```

### 方式 3：手动启动

**终端 1 - 后端：**
```bash
cd backend
python -m app.main
```

**终端 2 - 前端（开发模式）：**
```bash
cd frontend
npm run dev
```

## 访问应用

启动后访问：
- **前端**：http://localhost:3000
- **后端 API**：http://localhost:8000
- **API 文档**：http://localhost:8000/docs

## 配置 API Keys

编辑 `backend/.env` 文件，添加您的 API Keys：

```env
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
DEEPSEEK_API_KEY=your-deepseek-key-here
```

或使用 Mock 模式进行演示：
```env
NOVIX_LLM_PROVIDER=mock
```

## 创建的新文件

1. **start.py** - Python 启动脚本（跨平台）
2. **start_dev.py** - Python 开发模式启动脚本
3. **start_simple.bat** - 简单的 Windows 启动脚本
4. **GETTING_STARTED.md** - 快速开始指南
5. **STARTUP_TROUBLESHOOTING.md** - 故障排除指南
6. **frontend/src/components/ExtractionPreview.jsx** - 提取预览组件
7. **frontend/src/components/AskUserDialog.jsx** - 用户询问对话框
8. **frontend/src/components/writing/EntityActivityDashboard.jsx** - 实体活动仪表板
9. **backend/static/index.html** - 静态文件占位符

## 下一步

1. 配置 API Keys（见上文）
2. 运行启动脚本
3. 在浏览器中访问 http://localhost:3000
4. 创建新项目并开始写作

## 常见问题

### Q: 仍然看到编码错误
A: 使用 `python start_dev.py` 或 `python start.py` 代替 `start.bat`

### Q: 前端无法连接到后端
A:
- 确保后端已启动在 http://localhost:8000
- 检查防火墙设置
- 查看浏览器控制台（F12）的错误信息

### Q: 端口已被占用
A:
- 后端：编辑 `backend/.env`，修改 `PORT=8000`
- 前端：编辑 `frontend/vite.config.js`，修改 `port: 3000`

### Q: 如何使用不同的 LLM 提供商
A: 编辑 `backend/config.yaml`，修改 `llm.default_provider` 和各个 agent 的配置

## 获取帮助

- 查看 `GETTING_STARTED.md` 了解快速开始
- 查看 `STARTUP_TROUBLESHOOTING.md` 了解更多故障排除
- 查看 `CLAUDE.md` 了解项目架构
- 访问 API 文档：http://localhost:8000/docs
- 提交 Issue：https://github.com/unitagain/NOVIX/issues

---

**修复完成时间**：2026-01-30
**修复内容**：编码问题、缺失目录、缺失组件
**状态**：✅ 就绪启动
