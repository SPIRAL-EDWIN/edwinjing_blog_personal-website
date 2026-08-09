---
title: "基于Ubuntu+RTX50系列的UMI-diffusion-training框架搭建指南"
description: "记录 Ubuntu 与 RTX 50 系列环境下搭建 UMI Diffusion Policy 训练框架的经验。"
date: 2026-08-05
author: "Chen Jing (经宸)"
---

# 基于 Ubuntu + RTX 50 系列的 UMI Diffusion Training 框架搭建指南

> [!warning] 经验与安全说明
> 本文部分结论与命令来自笔者在特定软硬件版本、项目代码和实验环境中的个人实践，仅供学习与方案参考，不保证适用于其他环境，也不构成法律、专业或安全建议。执行前请核对官方文档、备份数据，并独立评估权限、设备与实验风险。

这是一份面向 Ubuntu 22.04 与 RTX 50 系列 GPU 的首次训练环境部署与验收笔记。后续每批数据的操作统一见 [Diffusion Policy数据训练流程](Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)。

> [!important] 版本边界
> 下面的依赖组合来自特定项目 commit 的实践记录，不是 RTX 50 系列的通用最新版。安装前应记录仓库 commit，并确认 Python、PyTorch wheel、驱动和 GPU capability 互相兼容。

## 0. 理解 CUDA 版本

需要区分三个概念：

- `nvidia-smi` 显示的 CUDA Version 是驱动可支持的最高 CUDA runtime 能力，不代表系统已安装同版本 Toolkit；
- PyTorch wheel 通常自带对应 CUDA runtime；
- 只有项目需要用 `nvcc` 编译 CUDA 扩展时，才必须另行评估系统 CUDA Toolkit。

先记录基线：

```bash
nvidia-smi
uname -a
python --version
df -h /
free -h
```

## 1. 路径与代码基线

```bash
REPO_ROOT="<REPO_ROOT>"
TRAIN_ROOT="$REPO_ROOT/umi-diffusion-training"

cd "$TRAIN_ROOT"
pwd
git status --short
git remote -v
git branch --show-current
git rev-parse HEAD
git submodule status
```

> [!warning] 不要为匹配笔记覆盖代码
> commit 不同时先记录差异并确认来源，不要执行会丢失本地修改的 `reset --hard` 或宽泛清理命令。

## 2. 安装系统依赖

```bash
sudo apt update
sudo apt install -y \
  git wget curl build-essential \
  ffmpeg \
  libosmesa6-dev libgl1-mesa-glx libglfw3 patchelf \
  libglib2.0-0 libsm6 libxext6 libxrender1
```

如果当前 Ubuntu 版本不再提供 `libgl1-mesa-glx`，可按包管理器提示改用 `libgl1`，并重新执行导入检查。

## 3. 创建独立 Conda 环境

数据转换与模型训练分开，避免 MCAP 依赖扰动训练环境：

```bash
conda create -n umi5080 python=3.10 -y
conda create -n mcap310 python=3.10 -y
```

```text
mcap310：读取 Matrix Studio 输出的 _vio.mcap，生成 dataset.npz
umi5080：运行 Diffusion Policy 训练
```

## 4. 安装 RTX 50 系列训练环境

### 4.1 PyTorch

历史项目环境使用支持对应 GPU capability 的 CUDA 12.8 wheel：

```bash
conda activate umi5080
python -m pip install --upgrade pip
python -m pip install \
  "torch==2.11.0" \
  "torchvision==0.26.0" \
  "torchaudio==2.11.0" \
  --index-url https://download.pytorch.org/whl/cu128
```

仓库旧环境中的 PyTorch/CUDA 组合若不包含目标 capability，可能出现 `no kernel image is available for execution on the device`。不要只按仓库旧版本降级；应以 `torch.cuda.get_arch_list()` 和真实 GPU 运算为准。

### 4.2 真实 GPU 验收

```bash
python - <<'PY'
import torch

print("torch:", torch.__version__)
print("cuda runtime:", torch.version.cuda)
print("cuda available:", torch.cuda.is_available())
print("device:", torch.cuda.get_device_name(0))
print("arch:", torch.cuda.get_arch_list())

x = torch.randn(2048, 2048, device="cuda")
y = x @ x
print("matmul mean:", y.mean().item())
print("cuda ok")
PY
```

验收标准是 CUDA 可用、设备名正确、arch 列表包含目标 capability，并且矩阵运算实际完成；仅能 import `torch` 不够。

### 4.3 训练依赖

```bash
python -m pip install \
  "numpy==1.24.4" \
  "pandas==2.1.4" \
  "scipy==1.11.4" \
  "pyyaml==6.0.1" \
  "tqdm==4.65.2" \
  "matplotlib==3.7.5" \
  "dill==0.3.7" \
  "einops==0.6.1" \
  "scikit-video==1.1.11" \
  "opencv-python-headless==<OPENCV_VERSION>" \
  "av==17.1.0"

python -m pip install \
  "hydra-core==1.2.0" \
  "diffusers==0.18.2" \
  "timm==0.9.7" \
  "accelerate==0.24.0" \
  "wandb==0.15.8" \
  "robomimic==0.2.0" \
  "threadpoolctl==3.2.0" \
  "imagecodecs==2023.9.18" \
  "zarr==2.16.1" \
  "numcodecs==0.11.0"

python -m pip install \
  "huggingface-hub==0.16.4" \
  "protobuf==4.25.9" \
  "urllib3==1.26.20" \
  "setuptools==70.2.0"
```

这些 pin 是旧项目代码的兼容性约束。例如旧 W&B、Diffusers、Zarr 与 Hugging Face Hub 可能依赖已经变更的 API。若升级其中一个包，应在新环境中重新做完整 smoke test，而不是原地混装。

## 5. 安装 MCAP 转换环境

```bash
conda activate mcap310
python -m pip install --upgrade pip
python -m pip install \
  "mcap==1.3.1" \
  "mcap-protobuf-support==0.5.4" \
  "numpy==1.24.4" \
  "scipy==1.11.4" \
  "zarr==2.16.1" \
  "numcodecs==0.11.0" \
  "opencv-python-headless==<OPENCV_VERSION>" \
  "av==17.1.0"
```

正确包名是 `mcap-protobuf-support`。除非训练代码明确需要，不要把 MCAP 转换依赖额外装进 `umi5080`。

## 6. 分环境执行导入检查

训练环境：

```bash
cd "$TRAIN_ROOT"
conda activate umi5080
python - <<'PY'
import torch
import numpy, pandas, scipy, zarr, numcodecs
import cv2, av, dill, hydra, diffusers, timm, accelerate, wandb

print("training imports ok")
print("torch:", torch.__version__)
print("cuda runtime:", torch.version.cuda)
print("cuda available:", torch.cuda.is_available())
print("device:", torch.cuda.get_device_name(0))
print("arch:", torch.cuda.get_arch_list())
PY
python -m pip check
```

转换环境：

```bash
cd "$TRAIN_ROOT"
conda activate mcap310
python - <<'PY'
import av, cv2, zarr, numpy, scipy, numcodecs
from mcap.reader import make_reader
from mcap_protobuf.decoder import DecoderFactory

print("conversion imports ok")
PY
python -m pip check
```

两个环境职责不同；训练环境不能 import MCAP 包，不等于训练环境部署失败。

## 7. 最小执行验收

新机器至少要完成：

- 使用一小组经确认的 `_vio.mcap` 生成 NPZ；
- 检查 episode boundary、steps、图像 shape 与实际测得 frequency；
- 构建视觉 encoder 与 Diffusion Policy 模型；
- 完成少量 forward/backward 与 optimizer step；
- 确认 W&B offline、Hydra 输出和无 checkpoint smoke 设置；
- 做一次 checkpoint 保存—恢复测试，并根据项目序列化代码核对 optimizer 等状态。

具体命令见 [Diffusion Policy数据训练流程](Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)。仅通过 import 不能证明训练链路完整。

## 8. 常见报错

| 报错 | 检查方向 |
|---|---|
| `no kernel image is available for execution on the device` | PyTorch wheel 是否包含目标 GPU capability |
| `No matching distribution found for torch` | Python、PyTorch 版本和 wheel index 是否匹配 |
| `np.float_ was removed in NumPy 2.0` | 旧 W&B 与 NumPy 版本是否兼容 |
| `cannot import name cached_download` | Diffusers 与 Hugging Face Hub API 是否匹配 |
| `wandb_internal_pb2 ... Result` | W&B 与 protobuf 组合是否匹配 |
| `No module named pkg_resources` | setuptools 是否完整安装 |
| `No module named mcap` | 是否误在训练环境运行转换脚本 |
| `No module named cv2` | pip 包名应为 `opencv-python-headless` |

## 9. 导出可复现记录

```bash
REPRO_ROOT="<REPRODUCIBILITY_ROOT>"
mkdir -p "$REPRO_ROOT"

conda activate umi5080
conda env export --from-history > "$REPRO_ROOT/umi5080-from-history.yml"
conda env export > "$REPRO_ROOT/umi5080-full.yml"
python -m pip freeze > "$REPRO_ROOT/umi5080-pip-freeze.txt"

conda activate mcap310
conda env export --from-history > "$REPRO_ROOT/mcap310-from-history.yml"
python -m pip freeze > "$REPRO_ROOT/mcap310-pip-freeze.txt"

cd "$TRAIN_ROOT"
git rev-parse HEAD > "$REPRO_ROOT/git-commit.txt"
nvidia-smi > "$REPRO_ROOT/nvidia-smi.txt"
```

## 10. 部署完成标准

- ☐ `nvidia-smi` 正常识别 RTX 50 系列 GPU。
- ☐ 根分区和训练输出分区空间满足训练计划。
- ☐ 仓库 branch、commit 和工作区状态已记录。
- ☐ 训练与转换环境职责分离。
- ☐ PyTorch CUDA 可用且 arch 包含目标 capability。
- ☐ 两个环境分别通过 import 和 `pip check`。
- ☐ MCAP 转换 smoke test 通过。
- ☐ 少量 DiT forward/backward 与 optimizer step 通过。
- ☐ checkpoint 保存—恢复链路已按当前 commit 验证。
- ☐ 环境、Git 和 GPU 快照已保存。

Matrix Studio 与 VIO 处理见 [🦾UMI Matrix Studio配置架构](%F0%9F%A6%BEUMI_Matrix-Studio%E9%85%8D%E7%BD%AE%E6%9E%B6%E6%9E%84.md)。
