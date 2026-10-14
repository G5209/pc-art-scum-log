# PC艺术网页日志

面向 SCUM 服务器的中文日志查询工具，支持只读采集、结构化解析和玩家行为分析。

## 主要功能

- 登录、击杀、聊天、撬锁、交易及玩家行为日志分类查询。
- 时间、玩家、区域筛选，保存和分享查询地址。
- 玩家档案、在线状态、地图轨迹、统计报表与实时事件流。
- 主账号、子账号、日志类别与敏感字段权限管理。
- 网页配置 SFTP / FTP 数据源，凭据在本地加密保存。
- 中文深色界面及自定义配色。

## 环境要求

- Node.js 20 或更新的 LTS 版本、npm 10 或更新版本。
- Python 3.10+；使用 SFTP 时安装 Paramiko：`python -m pip install paramiko`。
- Windows、Linux 或 macOS。SQLite 无需额外安装。
- 如果 SQLite 原生依赖无法安装，需要系统 C/C++ 编译工具。

## 快速开始

```bash
git clone <你的仓库地址> pc-art-scum-log
cd pc-art-scum-log
npm install
cp .env.example .env
npm run build
npm run dev
```

Windows PowerShell 可用 `Copy-Item .env.example .env` 代替 `cp`。

浏览器打开 `http://localhost:5173`。首次启动自动创建空数据库与管理员 `admin`，随机初始密码写入 `logs/first-admin.txt`。读取该文件后登录，按 `/welcome` 引导或进入“个人设置 → 日志源配置”填写自己的 SFTP 信息，测试连接后同步。请及时修改管理员密码。

项目不附带服务器配置、玩家记录、数据库或日志样本。未配置数据源时展示空状态，连接失败不会阻止网页启动。

## 配置说明

`.env.example` 只包含通用本地默认值，没有远程连接凭据。默认 API 端口为 3000，网页端口为 5173；数据库和原始日志路径均相对于项目目录。

日志源在网页中配置，例如：

| 配置项 | 示例 |
| --- | --- |
| 连接方式 | SFTP |
| 主机 | `your-server.com` |
| 端口 | `22`（FTP 为 `21`） |
| 用户名 | `your_username` |
| 密码 | `your_password` |
| 日志目录 | `/path/to/logs` |

SFTP 首次连接自动记录主机指纹，后续拒绝变更的指纹；无需填写主机密钥文件。采集仅读取远程文件。加密密钥默认生成在 `data/.datakey`，备份数据库时也要保存该密钥。

生产部署可使用 `docker compose up -d --build`，或配置反向代理、HTTPS 与 `.env` 中的允许来源。更换为自己的域名后再开放访问。

## 常见问题

**没有任何日志？** 初始项目为空。请配置日志源并同步，确认远程目录包含游戏日志。

**SFTP 测试失败？** 检查地址、端口、凭据、目录权限以及 Python / Paramiko 是否可用。失败时仍可浏览已有数据或修改设置。

**初始密码在哪里？** 查看首次运行生成的 `logs/first-admin.txt`，没有固定默认密码。不要将该文件提交到仓库。

**如何运行测试？** `npm test` 运行自包含单测；执行 `npx playwright install chromium` 后运行 `npm run test:e2e`。Windows 默认使用已安装的 Microsoft Edge。测试只在临时目录创建人工数据，不连接真实服务器。

**如何迁移或备份？** `npm run migrate` 执行数据库迁移；Linux 可使用 `scripts/backup.sh`。数据库、日志和加密密钥属于运行数据，不应上传到 Git。

## 技术栈

TypeScript、Node.js、Express、SQLite / better-sqlite3、原生 JavaScript / CSS、ECharts、Python / Paramiko、Vitest、Playwright。

## 目录结构

```text
apps/api/         API、权限、在线状态与采集服务
apps/web/         中文网页与静态资源
packages/parser/  日志解析器
packages/shared/  字段契约、菜单与中文词典
migrations/       数据库迁移
scripts/          启动、构建、测试和运维工具
tests/e2e/        浏览器测试
deploy/           服务部署示例
data/db/          启动后生成数据库（仓库为空）
data/raw/         采集后生成日志（仓库为空）
logs/             运行日志与首次密码（仓库为空）
```

## 许可证

项目代码采用 MIT 许可证，详见根目录 `LICENSE`。第三方依赖保留其各自许可证。
