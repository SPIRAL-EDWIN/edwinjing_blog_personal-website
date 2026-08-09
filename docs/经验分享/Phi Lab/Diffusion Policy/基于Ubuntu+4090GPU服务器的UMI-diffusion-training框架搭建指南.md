---
title: "基于Ubuntu+4090GPU服务器的UMI-diffusion-training框架搭建指南"
description: "记录 Ubuntu 与 RTX 4090 环境下搭建 UMI Diffusion Policy 训练框架的经验。"
date: 2026-08-05
author: "Chen Jing (经宸)"
---

# 基于 Ubuntu + RTX 4090 服务器的 UMI Diffusion Training 框架搭建指南

> [!warning] 经验与安全说明
> 本文部分结论与命令来自笔者在特定软硬件版本、项目代码和实验环境中的个人实践，仅供学习与方案参考，不保证适用于其他环境，也不构成法律、专业或安全建议。执行前请核对官方文档、备份数据，并独立评估权限、设备与实验风险。

本文负责服务器目录规划、代码身份、环境快照和 GPU 验收。每批数据的上传、训练与 checkpoint 管理见 [Diffusion Policy数据训练流程](Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)，训练后评估见 [Diffusion Policy checkpoint 数值与可视化评估流程](Diffusion%20Policy%20checkpoint%20%E6%95%B0%E5%80%BC%E4%B8%8E%E5%8F%AF%E8%A7%86%E5%8C%96%E8%AF%84%E4%BC%B0%E6%B5%81%E7%A8%8B.md)。

## 0. 参数化服务器基线

```bash
SERVER_USER="<SERVER_USER>"
SERVER_HOST="<SERVER_HOST>"
REPO_ROOT="<SERVER_REPO>"
DATA_ROOT="<SERVER_DATA_ROOT>"
CONDA_ENV="<CONDA_ENV>"
GPU_COUNT="<GPU_COUNT>"
```

环境基线应记录 GPU 型号与 capability、Python、PyTorch、PyTorch CUDA runtime、驱动版本、Conda 环境路径、Git remote/branch/commit 和工作区状态。公开页面不保留具体服务器账号、主机、磁盘容量、私有仓库或实验 run 身份。

> [!important] 不同 GPU 环境不要直接复制
> RTX 50 系列与 RTX 4090 的计算能力及可用 PyTorch wheel 可能不同。两台机器可以共享项目代码和 NPZ 格式，但应分别维护、导出和验收环境。

## 1. 存储架构

建议把系统与训练数据分开：源码可以放在仓库目录，dataset、W&B offline run、Hydra 输出、视频和 checkpoint 放到容量充足的数据盘。

```text
<SERVER_REPO>/
└── umi-diffusion-training/

<SERVER_DATA_ROOT>/
├── datasets/
├── outputs/
├── wandb/
└── reproducibility/
```

> [!warning] 只修改明确的项目目录
> 共享服务器上不要递归修改宽泛挂载点。请让管理员预先创建项目根目录，或在确认目标路径后只授予当前项目账户所需权限。

```bash
sudo mkdir -p \
  "$DATA_ROOT/datasets" \
  "$DATA_ROOT/outputs" \
  "$DATA_ROOT/wandb" \
  "$DATA_ROOT/reproducibility"
sudo chown -R "$USER":"$(id -gn)" "$DATA_ROOT"

df -h / "$DATA_ROOT"
ls -ld "$REPO_ROOT" "$DATA_ROOT" "$DATA_ROOT"/*
```

## 2. 取得并固定训练仓库

```bash
mkdir -p "$(dirname "$REPO_ROOT")"
git clone "<REPOSITORY_URL>" "$REPO_ROOT"
cd "$REPO_ROOT"

git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
```

> [!warning] 不要为匹配笔记覆盖共享代码
> commit 不一致时先记录差异。共享仓库存在修改时，不要执行 `reset --hard`、`checkout -- .` 或删除他人的文件。

## 3. 建立或复现训练环境

如果已有可用环境，优先导出环境与代码快照，再尝试重建：

```bash
REPRO_ROOT="$DATA_ROOT/reproducibility/environment"
mkdir -p "$REPRO_ROOT"

conda activate "$CONDA_ENV"
conda env export --from-history > "$REPRO_ROOT/conda-from-history.yml"
conda env export > "$REPRO_ROOT/conda-full.yml"
python -m pip freeze > "$REPRO_ROOT/pip-freeze.txt"
python -m pip check > "$REPRO_ROOT/pip-check.txt"

cd "$REPO_ROOT"
git branch --show-current > "$REPRO_ROOT/git-branch.txt"
git rev-parse HEAD > "$REPRO_ROOT/git-commit.txt"
git status --short > "$REPRO_ROOT/git-status-short.txt"
nvidia-smi > "$REPRO_ROOT/nvidia-smi.txt"
```

完成导出并验证文件非空之前，不要删除当前可用环境。若没有 lock 或完整安装记录，不应编造一条“从零安装全部依赖”的命令；应从项目配置与可用环境快照重建，再按下节重新验收。

## 4. 环境与 GPU 验收

```bash
conda activate "$CONDA_ENV"
cd "$REPO_ROOT"

python - <<'PY'
import torch

print("torch:", torch.__version__)
print("cuda runtime:", torch.version.cuda)
print("cuda available:", torch.cuda.is_available())
print("gpu count:", torch.cuda.device_count())
for i in range(torch.cuda.device_count()):
    print(i, torch.cuda.get_device_name(i), torch.cuda.get_device_capability(i))
PY

python -m pip check
```

先通过 `nvidia-smi` 选择一张经调度许可的 GPU，再做真实矩阵运算：

```bash
TEST_GPU="<TEST_GPU_ID>"
CUDA_VISIBLE_DEVICES="$TEST_GPU" python - <<'PY'
import torch

x = torch.randn(1024, 1024, device="cuda:0")
y = x @ x
print(torch.cuda.get_device_name(0), y.mean().item())
print("selected GPU ok")
PY
```

GPU 编号不是固定资源承诺；每次训练都必须根据调度和 `nvidia-smi` 重新选择。

## 5. Accelerate 与基础工具

```bash
conda activate "$CONDA_ENV"
accelerate env
nvidia-smi

sudo apt update
sudo apt install -y rsync tmux
rsync --version
tmux -V
```

正式训练前至少完成一次单卡端到端 smoke test，并验证多卡进程数与 GPU 映射。具体参数统一维护在 [Diffusion Policy数据训练流程](Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)。

## 6. W&B offline 存储

每个 run 将 W&B 目录与 Hydra run 目录绑定到同一身份：

```bash
RUN_NAME="<RUN_NAME>"
RUN_DIR="$DATA_ROOT/outputs/$RUN_NAME"
WANDB_DIR="$RUN_DIR/wandb"
```

API key 不应写入 Markdown、Shell history 或共享日志。同步命令见 [checkpoint 评估流程](Diffusion%20Policy%20checkpoint%20%E6%95%B0%E5%80%BC%E4%B8%8E%E5%8F%AF%E8%A7%86%E5%8C%96%E8%AF%84%E4%BC%B0%E6%B5%81%E7%A8%8B.md)。

## 7. 常见部署问题

| 现象 | 可能原因 | 处理原则 |
|---|---|---|
| `No module named pkg_resources` | W&B 与 setuptools 组合不完整 | 按已验证环境快照恢复，不盲目升级整套环境 |
| 系统盘持续变满 | W&B、Hydra 或视频落到仓库默认目录 | 显式把输出放到数据盘 |
| 目标 GPU 未被训练进程使用 | `CUDA_VISIBLE_DEVICES` 与 Accelerate 映射不一致 | 在 smoke test 中核对进程数、逻辑设备与物理 GPU |

## 8. 部署完成 Checklist

- ☐ 系统盘与数据盘职责已经区分。
- ☐ 项目数据目录已建立，且只给必要账户授权。
- ☐ 仓库 remote、branch、commit 和工作区状态已记录。
- ☐ 当前可用环境已导出 Conda 与 pip 快照。
- ☐ PyTorch 能识别预期 GPU 与 capability。
- ☐ 每张经调度许可的 GPU 均完成真实矩阵运算。
- ☐ `pip check` 无未解释冲突。
- ☐ Accelerate、rsync 和 tmux 可用。
- ☐ 单卡无 checkpoint smoke test 通过。
- ☐ 多卡进程与 GPU 映射验收通过。
- ☐ W&B 与 Hydra 输出均指向数据盘。

部署完成后，每批新数据继续使用 [Diffusion Policy数据训练流程](Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)。
