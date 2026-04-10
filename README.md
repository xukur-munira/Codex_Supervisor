# Codex_Supervisor
odex Supervisor 通过作为外部监控进程解决这个问题。它将项目拆分为任务，派生多个 Codex CLI 子进程作为 Worker，通过消息队列监控进度，并循环执行直到所有验收标准满足为止。
