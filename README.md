# Codex Supervisor

OpenAI Codex CLI 外部监控器 -- 管理项目的任务分解、Worker 进程派生、Checkpoint 审核和完成验收。

## 为什么需要 Codex Supervisor

OpenAI Codex CLI 以单次执行模式运行：它接收一个 prompt，执行任务，然后退出。它无法：

- 将大型项目分解为多个小任务
- 循环迭代处理失败的任务
- 管理多个并发的 Worker 进程
- 审核和验证完成质量

Codex Supervisor 通过作为外部监控进程解决这个问题。它将项目拆分为任务，派生多个 Codex CLI 子进程作为 Worker，通过消息队列监控进度，并循环执行直到所有验收标准满足为止。

## 架构设计

```
用户 (CLI / MCP 工具)
    |
    v
Codex Supervisor (本项目)
    |
    +-- 状态机 (项目生命周期)
    +-- 任务存储 (JSON 持久化)
    +-- Checkpoint 存储 (审核跟踪)
    +-- Worker 管理器 (子进程生命周期)
    |
    +-- 消息队列 (Redis / 内存)
    |       |
    +-- Codex CLI Workers (子进程)
            |
            v
        Worker 1, Worker 2, ... Worker N
```

### 核心 Pipeline

1. 用户描述项目 -> Supervisor 创建项目和状态机
2. Supervisor 将项目分解为任务，设置优先级和依赖关系
3. Supervisor 派生 Codex CLI 子进程作为 Worker
4. Worker 接收任务分配，通过 Codex CLI 执行，汇报进度
5. Worker 完成任务时，创建 Checkpoint 待审核
6. Supervisor 审核 Checkpoint：批准或拒绝并给出反馈
7. 如果拒绝 -> 反馈发送给 Worker，任务重新执行
8. 如果批准 -> 下一个任务分配给空闲 Worker
9. 循环直到所有任务完成、测试通过、Supervisor 确认

### 状态机

```
IDLE -> INITIALIZING -> PLANNING -> SUPERVISING <-> REVIEWING
                                        |
                                        v
                                   COMPLETING -> COMPLETED -> ARCHIVED
```

| 状态 | 描述 |
|------|------|
| IDLE | 无活动项目 |
| INITIALIZING | 创建项目并设置环境 |
| PLANNING | 将项目分解为任务 |
| SUPERVISING | 监控 Worker 会话和进度 |
| BLOCKED | 等待阻塞问题解决 |
| REVIEWING | 审核 Checkpoint 提交 |
| COMPLETING | 验证完成标准 |
| COMPLETED | 所有标准满足，项目完成 |
| ARCHIVED | 项目已归档 |

## 安装

### 前置条件

- Node.js 20 或更高版本
- OpenAI Codex CLI (`npm install -g @openai/codex`)
- （可选）Redis 用于持久化消息队列

### Windows

```batch
cd D:\Program_Project\MCP_Monitor
install.bat
```

### Linux / macOS

```bash
cd /path/to/MCP_Monitor
chmod +x install.sh
./install.sh
```

### 使用 Redis

```bash
# Linux / macOS
./install.sh --with-redis

# Windows
install.bat --with-redis
```

### 手动安装

```bash
npm install
npm run build
npm link
```

## MCP 服务器配置

### 什么是 MCP？

MCP (Model Context Protocol) 是一个标准化协议，让 AI 工具（如 Claude Code、Codex CLI）能够直接调用 Codex Supervisor 的功能。

### 配置步骤

**1. 在 Codex CLI 中配置 MCP 服务器**

打开 Codex CLI 的配置文件 `~/.codex/config.toml`，添加以下配置：

```toml
# Codex Supervisor MCP Server
[mcp_servers.codex-supervisor]
type = "stdio"
command = "node"
args = ["D:/Program_Project/MCP_Monitor/dist/index.js", "mcp"]
startup_timeout_sec = 30.0
tool_timeout_sec = 120.0

[mcp_servers.codex-supervisor.env]
CODEX_PORT = "3000"
CODEX_DATA_DIR = "C:/Users/xukur/.codex/supervisor"  # 统一使用Codex目录
CODEX_LOG_LEVEL = "info"
# CODEX_NO_AUTO_VISUALIZER = "true"  # 禁用自动打开可视化界面
```

**2. 可用工具列表**

| 工具名称 | 功能 |
|---------|------|
| `supervisor_start_project` | 创建新项目 |
| `supervisor_get_status` | 获取项目状态 |
| `supervisor_list_projects` | 列出所有项目 |
| `task_decompose` | 分解任务 |
| `task_list` | 列出任务 |
| `task_assign` | 分配任务给 Worker |
| `worker_spawn` | 派生 Worker（新子进程） |
| **`worker_spawn_virtual`** | **派生虚拟 Worker（绑定当前会话，可按 sessionId 重连）** |
| `worker_heartbeat` | 刷新心跳（虚拟 Worker） |
| **`task_report_progress`** | **报告任务进度** |
| **`supervisor_get_guidance`** | **获取下一步指引** |
| `worker_list` | 列出 Worker |
| `checkpoint_review` | 审核 Checkpoint |
| `project_check_completion` | 检查完成状态 |
| `project_finalize` | 最终验收项目 |
| **`session_export`** | **导出会话记录（默认导出当前 MCP 会话）** |
| **`session_get_handover_prompt`** | **获取交接提示词（默认使用当前 MCP 会话）** |
| **`session_get_id`** | **获取当前 MCP 会话 ID** |
| **`session_list_all`** | **列出所有活跃会话和其绑定 Worker** |
| **`session_get_stats`** | **获取会话统计信息** |

## 两种工作模式

### 模式 A：子进程模式（`worker_spawn`）

启动**新的 Codex CLI 子进程**作为 Worker：

```
用户：派生一个 Worker 开始执行任务
AI：调用 worker_spawn → 启动新的 Codex CLI 子进程
    调用 task_assign → 将任务分配给子进程
    子进程独立执行任务
```

**缺点**：新子进程没有当前会话的上下文。

### 模式 B：会话绑定模式（`worker_spawn_virtual`）⭐ 推荐

**绑定当前会话**，不启动子进程。MCP 监督你当前会话：

```
用户：创建一个项目，我要在我当前会话里执行
AI：调用 supervisor_start_project → 创建项目
    调用 task_decompose → 分解任务
    调用 worker_spawn_virtual → 创建虚拟 Worker（绑定当前会话）

用户：下一步做什么？
AI：调用 supervisor_get_guidance → 获取下一步任务指引
    AI 回复："下一个任务是：实现用户认证模块"

用户：我开始做这个任务了
AI：调用 task_report_progress → 报告任务开始

用户：任务完成了
AI：调用 task_report_progress(status=completed) → 报告完成
    调用 supervisor_get_guidance → 获取下一个任务

...循环直到所有任务完成...

用户：全部完成了吗？
AI：调用 project_check_completion → 检查完成状态
    调用 project_finalize → 最终验收
```

**优点**：
- 保留当前会话的所有上下文和知识
- AI 按任务指引一步步执行
- 监督者追踪进度，确保不遗漏

### 模式 B 的恢复与重连

会话绑定模式现在支持会话级恢复，而不只是进程内内存：

- MCP server 启动时会读取 `CODEX_SESSION_ID`、`CLAUDE_SESSION_ID` 或 `MCP_SESSION_ID`
- Session 与虚拟 Worker 会持久化到 `CODEX_DATA_DIR/runtime/sessions.json`
- `worker_spawn_virtual` 如果发现同一个 session 已绑定 virtual worker，会直接复用，不会重复创建
- `session_export`、`session_get_handover_prompt` 默认使用当前 MCP 会话 ID，无需手动再次传入
- `session_list_all` 可查看所有活跃会话、绑定的 worker、当前任务与最后活动时间

适用场景：
- Claude / Codex 客户端重启后重新连接同一个 supervisor
- context 用尽后，新会话继续接管原任务
- 同一台机器上 supervisor 进程重启后恢复活跃 session 视图

## 会话交接功能

当当前会话的 context 用完时，可以导出会话记录，创建新会话继续工作。

### 使用流程

```
当前会话:
1. 感觉 context 快用完了...
2. 调用 session_export → 导出会话记录
3. 调用 session_get_handover_prompt → 获取交接提示词

新会话:
4. 打开新的 Codex / Claude Code 会话
5. 粘贴交接提示词
6. 先调用 session_list_all 或 session_get_stats 确认当前活跃会话
7. 再调用 supervisor_get_guidance 获取当前任务建议
8. 最后调用 worker_spawn_virtual 绑定新会话
9. 持续调用 task_report_progress 汇报进度
```

### 推荐交接顺序

1. 原会话调用 `session_export`
2. 把生成的 markdown 或 handover prompt 交给新会话
3. 新会话启动后先用 `session_get_id` 确认自己的 MCP 会话 ID
4. 调用 `session_list_all` 查看当前是否已有旧会话绑定的 virtual worker
5. 调用 `worker_spawn_virtual`
   - 如果当前 session 尚未绑定 worker：创建新的 virtual worker
   - 如果当前 session 已绑定 worker：直接复用原绑定关系
6. 调用 `supervisor_get_guidance` 继续未完成任务

### 跨机器说明

当前实现支持**会话状态持久化**，但默认存储目录取决于 `CODEX_DATA_DIR`：

- 默认目录：`~/.codex/supervisor`（统一使用Codex目录）
- Session 注册表：`runtime/sessions.json`
- Visualizer 状态：`runtime/visualizer.json`
- 会话绑定关系：`bindings/session-bindings.json`
- 项目、任务、checkpoint 数据也都位于同一个数据目录下

这意味着：

- **同一台机器**上，MCP server 重启后可以恢复 session / worker 绑定信息
- **不同机器**之间，只有在它们共享同一个 `CODEX_DATA_DIR`（例如网络盘、同步目录或挂载卷）时，才能真正共享会话状态
- 如果不同机器使用各自本地磁盘，即使项目代码相同，也不会自动看到彼此的 session registry

如果你需要多机器共享状态，建议：

1. 显式设置统一的 `CODEX_DATA_DIR`
2. 确保该目录对所有运行 supervisor 的机器可读写
3. 同时保持项目工作目录一致，避免 handover markdown 指向无效路径

### 导出的会话记录示例

```markdown
# 会话交接记录

> 导出时间: 2025-01-15T10:30:00Z
> 原会话 ID: virtual-abc123
> 项目进度: 45%

## 项目信息
- 项目名称: 电商后台 API
- 项目描述: 构建一个完整的电商后台 REST API
- 工作目录: /path/to/project

## 已完成的工作

### 用户认证模块
- 完成时间: 2025-01-15T09:00:00Z
- 关键产出:
  - JWT 认证实现
  - 登录/注册接口

### 商品管理模块
- 完成时间: 2025-01-15T10:00:00Z
- 关键产出:
  - 商品 CRUD 接口
  - 分类管理

## 当前任务

### 订单模块
- 已完成部分: 订单创建、订单查询接口
- 待完成部分: 订单状态更新、支付接口对接

## 待执行的任务

- [P3] 支付模块
- [P4] 统计报表模块
- [P5] 后台管理界面

## 关键决策

- 采用 JWT 进行用户认证
- 使用 MongoDB 作为主数据库
- REST API 采用 Express.js 框架

## 下一步建议

1. 继续完成当前任务 "订单模块"
2. 完成后，开始执行 "支付模块"
```

当使用 Codex Supervisor MCP 时，可以通过**双面板可视化界面**实时观察主Agent（Codex CLI）和监控Agent（Supervisor）之间的对话。

### 双面板布局

**新版Visualizer采用双面板设计**，左侧显示主agent的真实工作流程，右侧显示监控agent的监督分析：

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔍 Codex Supervisor - 主Agent与监控Agent实时对话可视化                  │
├──────────────────────────────────────────────────────────────────────┤
│ 搜索会话ID: [________________] [搜索]                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐    ⚡实时监控    ┌─────────────────────┐   │
│  │  主Agent (蓝色)      │    👁️监督指令    │  监控Agent (黄色)    │   │
│  │                     │    🔄状态同步    │                     │   │
│  │  用户输入            │                 │  监督指令            │   │
│  │  工具调用            │                 │  进度检查            │   │
│  │  执行结果            │                 │  检查点审查          │   │
│  │  状态更新            │                 │  状态更新            │   │
│  │                     │                 │                     │   │
│  └─────────────────────┘                 └─────────────────────┘   │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ 会话: xxx... | 绑定状态: 已绑定 | 监控会话: xxx... | 消息: 12条      │
└──────────────────────────────────────────────────────────────────────┘
```

### 双面板功能

**左侧面板（主Agent - 蓝色主题）**：
- 显示主agent的真实Codex会话记录
- 包含：用户输入、工具调用、执行结果、状态更新
- 实时显示主agent的所有工作流程

**右侧面板（监控Agent - 黄色主题）**：
- 显示监控agent的监督消息
- 包含：监督指令、进度检查、任务分配、检查点审查、状态更新
- 实时分析主agent行为并给出监督反馈

**中间分隔符**：
- ⚡ 实时监控
- 👁️ 监督指令流
- 🔄 状态同步

### 自动打开

**默认行为**：当 Codex Desktop/CLI 会话首次调用 MCP 工具时，可视化界面会自动在浏览器中打开。

```toml
# config.toml 中可以禁用自动打开
[mcp_servers.codex-supervisor.env]
CODEX_NO_AUTO_VISUALIZER = "true"
```

### 手动打开和查询

```bash
# 浏览器访问
http://localhost:3000/visualizer

# 在搜索框输入主agent会话ID
# 系统会自动加载：
# 1. 会话绑定信息（主agent ↔ 监控agent）
# 2. 左侧：主agent的历史消息
# 3. 右侧：监控agent的监督消息
```

### 会话绑定机制

**主agent和监控agent通过会话ID绑定**：

- 当Codex CLI调用MCP工具时，系统创建会话绑定记录
- 绑定文件存储在：`~/.codex/supervisor/bindings/session-bindings.json`
- 绑定记录包含：
  - `mainAgentSessionId` - 主agent（Codex CLI）会话ID
  - `monitorAgentSessionId` - 监控agent会话ID
  - `projectId` - 项目ID
  - `status` - 绑定状态（active/completed/failed）

**Visualizer查询流程**：
```
用户输入主agent会话ID
    ↓
查询 ~/.codex/supervisor/bindings/session-bindings.json
    ↓
找到projectId和monitorSessionId
    ↓
加载监控agent消息：~/.codex/supervisor/projects/<projectId>/messages/queue.jsonl
    ↓
双面板显示完整对话（刷新页面不会消失）
```

### 消息持久化

**所有消息都会持久化到磁盘**，刷新页面不会丢失：

- **监控agent消息**：`~/.codex/supervisor/projects/<projectId>/messages/queue.jsonl`
- **主agent会话文件**：`~/.codex/sessions/<mainSessionId>.jsonl`（Codex原生保存）

**消息类型**：

| 类型 | 面板 | 颜色 | 描述 |
|------|------|------|------|
| 用户输入 | 左侧 | 蓝色 | 主agent接收的用户命令 |
| 工具调用 | 左侧 | 蓝色 | 主agent发起的工具调用 |
| 执行结果 | 左侧 | 蓝色 | 主agent的执行结果 |
| 状态更新 | 左侧 | 蓝色 | 主agent的状态变化 |
| 监督指令 | 右侧 | 黄色 | 监控agent的监督决策 |
| 进度检查 | 右侧 | 黄色 | 监控agent的进度分析 |
| 检查点审查 | 右侧 | 黄色 | 监控agent的检查点反馈 |
| 状态更新 | 右侧 | 黄色 | 监控agent的状态变化 |

## 任务生命周期

```
pending -> assigned -> in_progress -> review_pending -> completed
                          |
                          v
                       blocked (依赖未满足)
                          |
                          v
                       review_failed (Checkpoint 被拒绝)
                          |
                          v
                       in_progress (收到反馈后重新分配)
```

### 任务状态值

| 状态 | 描述 |
|------|------|
| `pending` | 已创建，等待分配 |
| `assigned` | 已分配给 Worker，尚未开始 |
| `in_progress` | Worker 正在执行 |
| `blocked` | 等待依赖任务完成 |
| `review_pending` | Worker 已完成，等待 Checkpoint 审核 |
| `review_failed` | Checkpoint 被拒绝，需要重做 |
| `completed` | 已批准并完成 |

## 完成标准

项目被认为完成需要满足**全部四项**标准：

| 标准 | 描述 |
|------|------|
| `allTasksComplete` | 所有任务状态为 `completed` |
| `allTestsPassing` | 最新测试结果显示零失败 |
| `supervisorConfirmed` | Supervisor 已明确批准 |
| `noBlockers` | 没有任务处于 `blocked` 状态 |

## Checkpoint 系统

Checkpoint 在任务执行的关键节点创建：

| 类型 | 创建时机 |
|------|---------|
| `pre_task` | 任务执行开始前 |
| `mid_task` | 任务执行过程中（长时间任务） |
| `post_task` | Worker 报告任务完成后 |

### Checkpoint 审核流程

1. Worker 完成任务并汇报进度
2. Supervisor 自动创建 `post_task` Checkpoint
3. 状态转换为 `REVIEWING`
4. 审核者调用 `checkpoint_review`
5. 如果批准：状态转为 `COMPLETING` 或回到 `SUPERVISING`
6. 如果拒绝：发送反馈给 Worker，任务重新分配

## 消息队列

### Channel 设计

```
codex:supervisor:{projectId}    -- Supervisor 收件箱
codex:worker:{workerId}         -- Worker 收件箱
codex:broadcast                 -- 系统广播消息
```

### 消息类型

**Worker -> Supervisor:**

| 类型 | 描述 |
|------|------|
| `task_progress` | Worker 汇报任务状态变化 |
| `checkpoint_report` | Worker 提交 Checkpoint 结果 |
| `worker_idle` | Worker 空闲，可接受新任务 |
| `worker_error` | Worker 报告错误 |

**Supervisor -> Worker:**

| 类型 | 描述 |
|------|------|
| `task_assignment` | 新任务分配给 Worker |
| `review_feedback` | Checkpoint 审核结果和反馈 |
| `terminate` | Worker 应终止 |

### Redis vs 内存队列

| 特性 | Redis | 内存队列 |
|------|-------|---------|
| 持久化 | 支持 | 不支持 |
| 多进程 | 支持 | 不支持 |
| 安装 | 需 Redis 服务器 | 无需安装 |
| 性能 | 有网络延迟 | 最快 |

通过设置 `CODEX_REDIS_URL` 启用 Redis：

```bash
export CODEX_REDIS_URL=redis://localhost:6379
```

## 配置

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CODEX_DATA_DIR` | `~/.codex/supervisor` | 数据存储目录（统一使用Codex目录） |
| `CODEX_PORT` | `3000` | 可视化界面端口 |
| `CODEX_LOG_LEVEL` | `info` | 日志级别 |
| `CODEX_REDIS_URL` | （无） | Redis 连接 URL |
| `CODEX_CLI_PATH` | `codex` | Codex CLI 二进制路径 |
| `CODEX_USE_SANDBOX` | `true` | Codex CLI 是否使用沙箱 |
| `OPENAI_API_KEY` | （必需） | Codex Worker 使用的 OpenAI API Key |

### 数据目录结构（统一在Codex目录下）

```
~/.codex/                          # Codex CLI 根目录
  ├── sessions/                    # Codex 主agent 真实会话文件（JSONL格式）
  ├── history.jsonl                # Codex 全局历史记录
  ├── state_5.sqlite               # Codex 状态数据库
  ├── supervisor/                  # MCP Monitor 数据目录（监控agent数据）
  │   ├── bindings/               # 会话绑定关系
  │   │   └── session-bindings.json    # 主agent ↔ 监控agent 会话ID绑定
  │   ├── projects/               # 监控agent的项目数据
  │   │   └── <projectId>/       # 每个项目的数据
  │   │       ├── project.json   # 项目元数据
  │   │       ├── state.json     # 项目状态
  │   │       ├── tasks/         # 任务分解数据
  │   │       ├── workers.json   # Worker 注册信息
  │   │       ├── checkpoints/   # 检查点数据
  │   │       └── messages/      # 监控agent消息日志
  │   │           └── queue.jsonl    # 监督消息持久化（JSONL格式）
  │   └── runtime/               # 运行时数据
  │       ├── sessions.json      # Session 注册信息
  │       └── visualizer.json    # Visualizer 状态
  └── config.toml                  # Codex 配置文件
```

## 故障排除

### Codex CLI 未找到

```bash
npm install -g @openai/codex
# 或设置自定义路径
export CODEX_CLI_PATH=/custom/path/to/codex
```

### Worker 进程立即退出

- 确认环境设置了 `OPENAI_API_KEY`
- 检查 Codex CLI 是否正常工作：`codex --version`
- 尝试禁用沙箱：`set CODEX_USE_SANDBOX=false`

### Redis 连接被拒绝

- 确保 Redis 正在运行：`redis-cli ping`
- 检查 URL 格式：`redis://localhost:6379`
- 未配置 Redis 时，系统自动使用内存队列

### 可视化界面没有消息

1. 确认 MCP 服务器已启动
2. 刷新浏览器页面
3. 检查控制台是否有 WebSocket 连接错误