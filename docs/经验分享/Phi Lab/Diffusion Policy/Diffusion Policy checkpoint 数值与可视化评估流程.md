---
title: "Diffusion Policy checkpoint 数值与可视化评估流程"
description: "整理 Diffusion Policy checkpoint 的数值指标、留出评估与可视化检查方法。"
date: 2026-08-05
author: "Chen Jing (经宸)"
---

# Diffusion Policy checkpoint 数值与可视化评估流程

> [!warning] 经验与安全说明
> 本文部分结论与命令来自笔者在特定软硬件版本、项目代码和实验环境中的个人实践，仅供学习与方案参考，不保证适用于其他环境，也不构成法律、专业或安全建议。执行前请核对官方文档、备份数据，并独立评估权限、设备与实验风险。

本文用于训练结束后的离线检查：先确认 checkpoint 与数据集身份，再用 `eval_offline.py` 计算数值误差，用 `eval_visualize.py` 生成 prediction/GT 对比视频。训练准备见 [Diffusion Policy数据训练流程](Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)。

> [!important] 历史记录与可复用模板分开
> 原笔记中的任务名、run、日期、episode 数量、指标、视频统计和绝对路径均属于一次具体实验，本公开版本不保留这些值。下文只给出参数化模板，不能把占位符当作已经验证的默认配置。

## 0. 评估顺序

```text
确认 checkpoint、训练配置与数据集身份
→ 固定 held-out split
→ eval_offline.py 输出离线误差
→ eval_visualize.py 生成短预览
→ 在相同设置下生成完整视频
→ 结合数值、轨迹与失败案例比较 checkpoint
```

| 工具 | 回答的问题 | 典型输出 |
|---|---|---|
| `eval_offline.py` | 模型在指定评估集上的动作预测误差 | MSE 及分量指标 |
| `eval_visualize.py` | 误差集中在哪些轨迹、位置或夹爪动作 | prediction/GT 对比视频 |

> [!important] 离线评估不连接机器人
> 离线 MSE 只能描述模型对所选 demonstration action 的拟合，不能替代真实机器人成功率，也不能证明对新场景的泛化能力。

## 1. 定义一次评估的身份

在运行前显式设置同一个 run 的路径与运行设备，避免混用不同实验的证据：

```bash
REPO_ROOT="<REPO_ROOT>"
RUN_DIR="<RUN_DIR>"
CHECKPOINT_PATH="$RUN_DIR/checkpoints/<CHECKPOINT_NAME>.ckpt"
DATASET_PATH="<DATASET_PATH>.npz"
EVAL_DIR="$RUN_DIR/evaluation"
CONDA_ENV="<CONDA_ENV>"
GPU_ID="<GPU_ID>"
```

同一份评估记录至少应保存：

- Git branch、commit 与工作区状态；
- checkpoint 和 dataset 的 SHA-256；
- `.hydra/config.yaml` 与 `.hydra/overrides.yaml`；
- split 的生成方式、随机种子与样本来源；
- 实际使用的 GPU、环境和评估脚本版本。

## 2. 确认 checkpoint 与 dataset

```bash
cd "$REPO_ROOT"
git branch --show-current
git rev-parse HEAD
git status --short

test -f "$CHECKPOINT_PATH"
test -f "$DATASET_PATH"
sha256sum "$CHECKPOINT_PATH" "$DATASET_PATH"
mkdir -p "$EVAL_DIR"
```

如果 checkpoint 是 PyTorch 序列化文件，其内容取决于项目保存逻辑：可能包含模型权重、EMA、优化器、调度器、epoch 或其他状态，也可能只包含其中一部分。不要仅凭 `.ckpt` 后缀推断可恢复训练的全部内容，应读取当前仓库的保存与加载代码核对。

## 3. 固定 held-out 评估条件

> [!warning] 留出集限制
> 若评估样本与训练样本来自相同 episode、相邻时间窗口，或 split 在转换后按帧随机划分，离线误差可能因数据泄漏或强相关性而过于乐观。更可靠的做法是按完整 episode、采集批次或场景留出，并保存 split 清单。

比较多个 checkpoint 时必须保持：

- 同一 dataset 与同一 held-out split；
- 同一 EMA/base model 选择；
- 同一归一化、batch、设备与指标实现；
- 同一视频视角、坐标范围、帧选择和编码参数。

## 4. 运行数值评估

```bash
cd "$REPO_ROOT"
CUDA_VISIBLE_DEVICES="$GPU_ID" conda run -n "$CONDA_ENV" \
  python eval_offline.py \
  -i "$CHECKPOINT_PATH" \
  -d "$DATASET_PATH" \
  --batch_size "<BATCH_SIZE>" \
  --device cuda | tee "$EVAL_DIR/eval_offline_<CHECKPOINT_NAME>.txt"
```

指标含义以当前 action 定义为准。常见拆分包括 position、rotation representation 与 gripper width：

```text
action_mse_pos   = position 分量的均方误差
action_mse_rot   = rotation representation 分量的均方误差
action_mse_width = gripper width 分量的均方误差
action_mse       = 全部 action 分量的混合均方误差
RMSE             = sqrt(MSE)
```

混合 MSE 包含不同单位和表示方式，只适合在完全相同的评估设置下比较。rotation-6D 的 MSE 也不能直接当作角度误差；若需要角度指标，应先把预测与 GT 转成旋转矩阵或四元数，再计算定义明确的 geodesic error。

## 5. 生成可视化预览与完整视频

先用少量匿名样本检查画面方向、预测轨迹与编码是否正常：

```bash
CUDA_VISIBLE_DEVICES="$GPU_ID" conda run -n "$CONDA_ENV" \
  python eval_visualize.py \
  -i "$CHECKPOINT_PATH" \
  -d "$DATASET_PATH" \
  -o "$EVAL_DIR/eval_vis_<CHECKPOINT_NAME>_preview.mp4" \
  --fps "<DISPLAY_FPS>" \
  --num_frames "<PREVIEW_FRAMES>" \
  --device cuda
```

预览重点检查：

- wrist RGB、朝向与裁剪是否正确；
- prediction 与 GT 是否明显分离或发散；
- 高度、旋转与 gripper 曲线是否合理；
- 逐样本误差是否出现异常峰值；
- 视频脚本是否对 prediction 和 GT 做了不同的对齐或平移。

预览正常后可去掉 `--num_frames` 生成完整视频。严格比较多个 checkpoint 时，应关闭仅用于展示的旋转视角，并固定所有显示设置。

## 6. 结合数值与视频判断

| 观察 | 可能含义 |
|---|---|
| 整体 MSE 较低，轨迹也贴近 GT | 在当前评估集上离线拟合较好 |
| 整体 MSE 较低，但局部片段明显发散 | 平均值掩盖了少量失败样本 |
| position 接近，gripper 曲线错位 | 抓取开合时机可能有问题 |
| 平面轨迹接近，但高度偏差较大 | 抬升或下压动作可能不稳定 |
| 轨迹形状接近，但起点存在偏移 | 可视化对齐可能隐藏绝对位置误差 |

离线结果即使很好，也不能推出真实机器人必然成功。真实评估还受相机标定、延迟、观测分布、控制接口和安全约束影响。

## 7. action horizon 与视频末尾

若模型从时刻 `t` 预测长度为 `H`、下采样步长为 `s` 的 action chunk，则需要的最远未来 GT 约为：

```text
t + (H - 1) × s
```

episode 末尾不足以形成完整未来窗口的时间点不能作为预测起点，因此可视化可能提前切换到下一条 episode。这通常是窗口定义导致的，不一定是视频损坏。`--fps` 只控制导出视频的播放速度，不等同于原始数据采样频率。

## 8. 比较 TopK checkpoint

TopK checkpoint 通常是训练代码按训练损失或配置中的某个监控量保存的候选集合。按训练 loss 排名不等于在 held-out 数据上泛化最好，更不等于真机成功率最高。应在同一独立评估集上重新评估各候选 checkpoint，再结合视频与后续安全受控的真机测试选择。

## 9. W&B offline 记录

如需同步离线日志，先确认目录属于当前 run，并避免公开 entity、project、run ID：

```bash
WANDB_OFFLINE_DIR="$RUN_DIR/wandb/<WANDB_OFFLINE_RUN_DIR>"
wandb sync "$WANDB_OFFLINE_DIR"
```

## 10. 脚本实现限制

评估前应检查当前脚本是否存在这些偏差：

- 先计算每个 batch 的 MSE 再对 batch 等权平均，会让最后一个较小 batch 权重偏高；
- `--num_samples` 若按完整 batch 截止，实际样本数可能超过目标；
- prediction 与 GT 若分别减去各自起点，会隐藏绝对起点偏差；
- MSE 与绘图若使用不同对齐方式，数值和画面不能直接互相解释；
- 动态坐标范围和旋转视角适合展示，不适合严格比较；
- 视频若不标注 episode ID 与 timestep，定位失败样本会更困难。

这些限制不妨碍探索性检查，但形成论文指标或正式比较前应修订并记录。

## 11. 每次评估 Checklist

- ☐ checkpoint、dataset、split 与输出目录来自同一评估身份。
- ☐ 记录 Git branch、commit 和工作区状态。
- ☐ 记录 checkpoint 与 dataset 的 SHA-256。
- ☐ 检查 Hydra 配置与 overrides。
- ☐ 保存数值评估的原始输出。
- ☐ 先生成预览，再生成完整视频。
- ☐ 同时查看 position、rotation 与 gripper 误差。
- ☐ 多 checkpoint 对比保持 split 和显示设置一致。
- ☐ 明确写出 held-out split 的限制。
- ☐ 不把 TopK、离线 MSE 或视频观感等同于真机成功率。

真实机器人评估还需要相机、机器人控制、标定、限位与急停策略；概念关系见 [Diffusion Policy 真机部署概念架构](Diffusion%20Policy%20%E7%9C%9F%E6%9C%BA%E9%83%A8%E7%BD%B2%E6%A6%82%E5%BF%B5%E6%9E%B6%E6%9E%84.md)。
