# Codex Supervisor

Codex Supervisor 是面向 OpenAI Codex CLI 的外部监督器。它提供项目状态管理、任务分解、Worker 管理、Checkpoint 审核、完成验收、MCP 工具接入、REST API 和可视化界面。

当前发布包版本：`1.0.0`。

## 核心能力

- 使用 JSON 文件持久化项目、任务、Worker、Checkpoint 和会话状态。
- 支持内存队列，配置 `CODEX_REDIS_URL` 后可使用 Redis 队列。
- 支持通过 MCP 工具让 Codex 或其他 AI 客户端调用监督能力。
- 支持子进程 Worker 和当前会话绑定的虚拟 Worker。
- 支持 REST API、WebSocket 广播和浏览器可视化页面。
- 支持会话导出和交接提示，便于上下文耗尽后继续任务。

## 运行环境

- Node.js `20.0.0` 或更高版本。
- OpenAI Codex CLI。子进程 Worker 需要能在命令行中执行 `codex --version`。
- Redis 可选。未配置 Redis 时会自动使用内存队列。

安装 Codex CLI：

```bash
npm install -g @openai/codex
```

## 安装

全局安装：

```bash
npm install -g codex-supervisor@1.0.0 --registry=https://registry.npmjs.org/
```

项目内安装：

```bash
npm install codex-supervisor@1.0.0 --registry=https://registry.npmjs.org/
```

使用 `npx` 直接运行：

```bash
npx -y codex-supervisor@1.0.0 help
```

## CLI 命令

```bash
codex-supervisor mcp
codex-supervisor daemon
codex-supervisor watchdog
codex-supervisor serve --port 3000
codex-supervisor run --dir ./my-project --name "My Project" --desc "Build a feature"
codex-supervisor status
codex-supervisor status --project-id <projectId>
codex-supervisor list
codex-supervisor check --project-id <projectId>
codex-supervisor help
```

命令说明：

| 命令 | 作用 |
| --- | --- |
| `mcp` | 启动 MCP Server，供 AI 客户端调用工具。 |
| `daemon` | 启动常驻 Supervisor Daemon。 |
| `watchdog` | 启动守护进程，自动重启 Daemon。 |
| `serve` | 启动 REST API 和可视化页面服务。 |
| `run` | 创建并启动一个受监督项目。 |
| `status` | 查看项目状态。 |
| `list` | 列出所有项目。 |
| `check` | 检查指定项目是否满足完成条件。 |
| `help` | 输出命令帮助。 |

`run` 命令参数：

| 参数 | 说明 |
| --- | --- |
| `--dir`, `-d` | 项目工作目录，必填。 |
| `--name`, `-n` | 项目名称，可选。未提供时使用目录名。 |
| `--desc`, `-D` | 项目描述，必填。 |
| `--tasks` | 任务 JSON 字符串或 JSON 文件路径，可选。 |

任务 JSON 示例：

```json
[
  {
    "subject": "实现用户登录接口",
    "description": "添加登录接口、输入校验和错误处理",
    "priority": 1
  },
  {
    "subject": "补充登录测试",
    "description": "覆盖成功、失败和边界场景",
    "priority": 2,
    "dependencies": []
  }
]
```

## MCP 配置

在 Codex CLI 的 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.codex-supervisor]
type = "stdio"
command = "npx"
args = ["-y", "codex-supervisor@1.0.0", "mcp"]
startup_timeout_sec = 30.0
tool_timeout_sec = 120.0

[mcp_servers.codex-supervisor.env]
CODEX_PORT = "3000"
CODEX_DATA_DIR = "C:/Users/your-user/.codex/supervisor"
CODEX_LOG_LEVEL = "info"
# CODEX_REDIS_URL = "redis://localhost:6379"
```

如果使用本地源码或本地构建产物，可以把 `command` 改为 `node`，并把 `args` 指向 `dist/index.js`：

```toml
[mcp_servers.codex-supervisor]
type = "stdio"
command = "node"
args = ["/absolute/path/to/codex-supervisor/dist/index.js", "mcp"]
startup_timeout_sec = 30.0
tool_timeout_sec = 120.0
```

## MCP 工具

| 工具名称 | 作用 |
| --- | --- |
| `supervisor_start_project` | 创建受监督项目。 |
| `supervisor_get_status` | 获取项目状态和详情。 |
| `supervisor_list_projects` | 列出所有项目。 |
| `task_decompose` | 将项目拆分为任务。 |
| `task_list` | 列出项目任务。 |
| `task_get` | 获取指定任务详情。 |
| `task_assign` | 将任务分配给 Worker。 |
| `task_report_progress` | 当前会话报告任务进度。 |
| `worker_spawn` | 创建 Codex CLI 子进程 Worker。 |
| `worker_spawn_virtual` | 将当前 MCP 会话绑定为虚拟 Worker。 |
| `worker_heartbeat` | 刷新虚拟 Worker 心跳。 |
| `worker_list` | 列出项目 Worker。 |
| `worker_terminate` | 终止 Worker。 |
| `checkpoint_list` | 列出待审核 Checkpoint。 |
| `checkpoint_review` | 批准或拒绝 Checkpoint。 |
| `project_check_completion` | 检查项目完成条件。 |
| `project_confirm_supervisor` | 标记 Supervisor 已确认完成。 |
| `project_finalize` | 归档项目。 |
| `supervisor_get_guidance` | 获取当前项目下一步建议。 |
| `session_export` | 导出会话交接记录。 |
| `session_get_handover_prompt` | 获取新会话接管提示。 |
| `session_get_id` | 获取当前 MCP 会话 ID。 |
| `session_list_all` | 列出活跃会话。 |
| `session_get_stats` | 获取会话统计信息。 |

## REST API 和可视化页面

启动服务：

```bash
codex-supervisor serve --port 3000
```

浏览器访问：

```text
http://localhost:3000/visualizer
```

WebSocket 地址：

```text
ws://localhost:3000/ws/visualizer
```

常用 REST API：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/projects` | 创建项目。 |
| `GET` | `/api/projects` | 列出项目。 |
| `GET` | `/api/projects/:projectId` | 获取项目详情。 |
| `POST` | `/api/projects/:projectId/tasks` | 创建任务。 |
| `GET` | `/api/projects/:projectId/tasks` | 列出任务。 |
| `GET` | `/api/projects/:projectId/tasks/:taskId` | 获取任务详情。 |
| `POST` | `/api/projects/:projectId/tasks/:taskId/assign` | 分配任务。 |
| `POST` | `/api/projects/:projectId/workers` | 创建 Worker。 |
| `GET` | `/api/projects/:projectId/workers` | 列出 Worker。 |
| `DELETE` | `/api/workers/:workerId` | 终止 Worker。 |
| `GET` | `/api/projects/:projectId/checkpoints` | 列出 Checkpoint。 |
| `POST` | `/api/projects/:projectId/checkpoints/:checkpointId/review` | 审核 Checkpoint。 |
| `GET` | `/api/projects/:projectId/completion` | 检查完成条件。 |
| `POST` | `/api/projects/:projectId/confirm` | Supervisor 确认完成。 |
| `POST` | `/api/projects/:projectId/finalize` | 归档项目。 |
| `POST` | `/api/broadcast` | 向可视化页面广播消息。 |
| `GET` | `/api/projects/:projectId/messages` | 获取项目消息。 |
| `GET` | `/api/bindings` | 列出会话绑定。 |
| `GET` | `/api/bindings/:sessionId` | 获取指定会话绑定。 |
| `GET` | `/api/codex/sessions` | 列出 Codex 会话。 |
| `GET` | `/api/codex/sessions/:sessionId/messages` | 获取 Codex 会话消息。 |

## 工作模式

### 子进程 Worker

`worker_spawn` 会创建独立 Codex CLI 子进程。适合把任务交给独立 Worker 执行，但新进程不会自动继承当前对话上下文。

### 虚拟 Worker

`worker_spawn_virtual` 会把当前 MCP 会话绑定到 Supervisor Worker。适合在当前 Codex 会话中按 Supervisor 指引推进任务。

推荐流程：

1. 调用 `supervisor_start_project` 创建项目。
2. 调用 `task_decompose` 创建任务列表。
3. 调用 `worker_spawn_virtual` 绑定当前会话。
4. 调用 `supervisor_get_guidance` 获取下一步任务。
5. 开始任务时调用 `task_report_progress`。
6. 完成任务后再次调用 `task_report_progress`。
7. 调用 `project_check_completion` 检查完成状态。
8. 满足条件后调用 `project_confirm_supervisor` 和 `project_finalize`。

## 项目状态

项目生命周期：

```text
IDLE -> INITIALIZING -> PLANNING -> SUPERVISING -> REVIEWING -> COMPLETING -> COMPLETED -> ARCHIVED
```

任务生命周期：

```text
pending -> assigned -> in_progress -> review_pending -> completed
                          |
                          v
                       blocked
                          |
                          v
                       review_failed -> in_progress
```

完成条件：

| 条件 | 说明 |
| --- | --- |
| `allTasksComplete` | 所有任务均为 `completed`。 |
| `allTestsPassing` | 最新测试结果没有失败。 |
| `supervisorConfirmed` | Supervisor 已确认完成。 |
| `noBlockers` | 没有阻塞任务。 |

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CODEX_DATA_DIR` | `~/.codex/supervisor` | Supervisor 数据目录。 |
| `CODEX_PORT` | `3000` | REST API 和可视化页面端口。 |
| `CODEX_LOG_LEVEL` | `info` | 日志级别。 |
| `CODEX_REDIS_URL` | 无 | Redis 连接地址。未设置时使用内存队列。 |
| `CODEX_CLI_PATH` | `codex` | Codex CLI 可执行文件路径。 |
| `CODEX_USE_SANDBOX` | `true` | 是否让 Codex Worker 使用沙箱。设置为 `false` 可禁用。 |
| `CODEX_SANDBOX_MODE` | `workspace-write` | Codex CLI 沙箱模式。 |
| `CODEX_SESSION_ID` | 自动生成 | 当前 MCP 会话 ID。 |
| `CLAUDE_SESSION_ID` | 无 | 可作为 MCP 会话 ID 来源。 |
| `MCP_SESSION_ID` | 无 | 可作为 MCP 会话 ID 来源。 |
| `CODEX_WORKER_TIMEOUT_MS` | 内置默认值 | Worker 心跳超时时间。 |
| `CODEX_SUBPROCESS_WORKER_TIMEOUT_MS` | 内置默认值 | 子进程 Worker 心跳超时时间。 |
| `CODEX_VIRTUAL_WORKER_TIMEOUT_MS` | 内置默认值 | 虚拟 Worker 心跳超时时间。 |
| `CODEX_DAEMON_CONTROL_PORT` | `0` | Daemon 控制端口。 |
| `CODEX_TRANSPORT_DISCONNECT_GRACE_MS` | 内置默认值 | MCP 连接断开后的保留时间。 |
| `CODEX_DAEMON_WATCHDOG_INTERVAL_MS` | `5000` | Watchdog 检查间隔。 |

## 数据目录

默认数据目录为 `~/.codex/supervisor`，可通过 `CODEX_DATA_DIR` 覆盖。

典型结构：

```text
~/.codex/supervisor/
  bindings/
    session-bindings.json
  projects/
    <projectId>/
      project.json
      state.json
      tasks/
      workers.json
      checkpoints/
      messages/
        queue.jsonl
  runtime/
    sessions.json
    visualizer.json
```

Codex 原生会话读取路径：

```text
~/.codex/sessions/
```

## Redis 队列

不配置 Redis 时，Supervisor 使用内存队列。需要跨进程消息能力时，配置 Redis：

```bash
export CODEX_REDIS_URL=redis://localhost:6379
codex-supervisor serve --port 3000
```

Windows PowerShell：

```powershell
$env:CODEX_REDIS_URL = "redis://localhost:6379"
codex-supervisor serve --port 3000
```

## 会话交接

当当前 AI 会话上下文接近耗尽时，可使用：

1. `session_export` 导出当前会话记录。
2. `session_get_handover_prompt` 生成新会话接管提示。
3. 在新会话中调用 `session_get_id` 确认会话 ID。
4. 调用 `session_list_all` 查看已有绑定。
5. 调用 `worker_spawn_virtual` 绑定或复用 Worker。
6. 调用 `supervisor_get_guidance` 继续任务。

## 故障排查

### Codex CLI 未找到

确认 `codex` 在命令行可用：

```bash
codex --version
```

如果安装在自定义位置，设置：

```bash
export CODEX_CLI_PATH=/path/to/codex
```

Windows PowerShell：

```powershell
$env:CODEX_CLI_PATH = "C:\\path\\to\\codex.exe"
```

### 端口被占用

更换端口：

```bash
codex-supervisor serve --port 8080
```

或在 MCP 配置中调整：

```toml
[mcp_servers.codex-supervisor.env]
CODEX_PORT = "8080"
```

### Redis 连接失败

先确认 Redis 可访问：

```bash
redis-cli ping
```

如果不需要 Redis，删除 `CODEX_REDIS_URL`，系统会回退到内存队列。

### 可视化页面没有消息

检查事项：

1. `codex-supervisor serve` 或 MCP Server 是否正在运行。
2. 浏览器是否访问了正确端口的 `/visualizer`。
3. WebSocket 是否连接到 `/ws/visualizer`。
4. `CODEX_DATA_DIR` 是否与 MCP Server 使用的目录一致。
5. `~/.codex/sessions` 下是否存在 Codex 会话 JSONL 文件。

## 发布包内容

本包发布内容包括：

```text
dist/
README.md
mcp-config.example.json
mcp-config.example.toml
install.bat
install.sh
```

源码未包含在当前 npm 发布包中，运行入口为 `dist/index.js`。
