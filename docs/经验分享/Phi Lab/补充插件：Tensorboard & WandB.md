---
title: "补充插件：Tensorboard & WandB"
description: "记录 TensorBoard 与 Weights & Biases 在训练监控中的通用配置与排查方法。"
date: 2026-08-05
author: "Chen Jing (经宸)"
---

# 补充插件：Tensorboard & WandB

> [!warning] 经验与安全说明
> 本文部分结论与命令来自笔者在特定软硬件版本、项目代码和实验环境中的个人实践，仅供学习与方案参考，不保证适用于其他环境，也不构成法律、专业或安全建议。执行前请核对官方文档、备份数据，并独立评估权限、设备与实验风险。

> [!warning] 凭据说明
> W&B API key 属于登录凭据，不应写入笔记、脚本、终端历史或版本库。下面只保留占位符；使用前请在当前环境安全地注入真实值。

## 登录 W&B

```bash
WANDB_API_KEY="<WANDB_API_KEY>"
wandb login "$WANDB_API_KEY"
```

登录后可用以下命令检查当前账号、entity 与 base URL：

```bash
wandb status
```

## 找到当前训练对应的 W&B 页面

先在项目根目录检查本地 `wandb` 记录：

```bash
cd "<REPO_ROOT>"
ls -lt wandb | head
cat wandb/latest-run/files/wandb-metadata.json | grep -i url
```

本地目录通常包含 `latest-run` 软链接。公开笔记中的通用页面结构写作：

```text
<WANDB_RUN_URL>
```

也可以登录 [Weights & Biases](https://wandb.ai/) 后，从对应 entity 和 project 中查找 run。不要把真实的 entity、project、run ID 或运行链接复制到公开页面。

## 使用 TensorBoard 查看本地日志

如果训练使用的是 TensorBoard logger，可直接读取对应日志目录：

```bash
tensorboard --logdir "<LOG_ROOT>" --port 6006
```

随后在本机打开 `http://localhost:6006`。如果训练仅使用 W&B logger，本地 TensorBoard 目录可能不存在或不完整，应以项目实际 logger 配置为准。
