# NOVIX 启动故障排除指南

## 问题：批处理文件编码错误

如果运行 `start.bat` 时看到类似以下错误：
```
'畨瑁?Python' 不是内部或外部命令
'?Node.js' 不是内部或外部命令
```

这是因为 `start.bat` 文件的编码是 UTF-8，但 Windows 批处理文件需要 ANSI 或 GBK 编码。

## 解决方案

### 方案 1：使用 Python 启动脚本（推荐）

我们已经为您创建了 `start.py` 脚本，这是一个跨平台的启动脚本。

**Windows 用户：**
```bash
python start.py
```

或双击 `start_simple.bat`

**macOS/Linux 用户：**
```bash
python start.py
```

### 方案 2：手动启动服务

如果 Python 脚本不工作，您可以手动启动两个服务：

**终端 1 - 启动后端：**
```bash
cd backend
python -m app.main
```

**终端 2 - 启动前端：**
```bash
cd frontend
npm run dev
```

然后访问：
- 前端：http://localhost:3000
- 后端：http://localhost:8000
- API 文档：http://localhost:8000/docs

### 方案 3：修复原始 start.bat 文件

如果您想继续使用原始的 `start.bat` 文件，可以用以下方法修复编码：

**使用 Python：**
```python
# 将 UTF-8 转换为 GBK
with open('start.bat', 'r', encoding='utf-8') as f:
    content = f.read()
with open('start.bat', 'w', encoding='gbk') as f:
    f.write(content)
```

**使用 Notepad++：**
1. 用 Notepad++ 打开 `start.bat`
2. 菜单：编码 → 转换为 ANSI
3. 保存文件

**使用 VS Code：**
1. 用 VS Code 打开 `start.bat`
2. 右下角点击编码选择器
3. 选择 "GBK" 或 "GB2312"
4. 保存文件

## 环境要求检查

确保您已安装：

**Python 3.10+**
```bash
python --version
```

**Node.js 18+**
```bash
node --version
npm --version
```

如果未安装，请从以下地址下载：
- Python: https://www.python.org/downloads/
- Node.js: https://nodejs.org/

## 常见问题

### Q: 运行 start.py 后没有反应
A: 检查是否有防火墙阻止。也可以尝试手动启动服务。

### Q: 前端无法连接到后端
A: 确保后端已启动在 http://localhost:8000，检查防火墙设置。

### Q: Python 或 Node.js 命令未找到
A: 确保已安装并添加到 PATH 环境变量。重启终端后重试。

### Q: 端口已被占用
A: 如果 3000 或 8000 端口已被占用，可以修改配置：
- 后端：编辑 `backend/.env`，修改 `PORT` 变量
- 前端：编辑 `frontend/vite.config.js`，修改 `port` 配置

## 获取帮助

如果问题仍未解决，请：
1. 检查 `backend/` 和 `frontend/` 目录中的错误日志
2. 查看 API 文档：http://localhost:8000/docs
3. 提交 Issue：https://github.com/unitagain/NOVIX/issues
