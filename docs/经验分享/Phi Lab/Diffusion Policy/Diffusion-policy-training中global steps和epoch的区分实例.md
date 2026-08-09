---
title: "Diffusion Policy：global steps 与 epoch"
---

> [!warning] 阅读说明
> 本文是笔者基于特定课程、项目代码与个人学习过程整理的工作笔记。部分论断可能不完整、过时或依赖特定版本，请结合原始论文、官方文档及实际源码独立核验。

这篇笔记用符号说明 `global step` 与 `epoch` 的区别，避免把某次实验的数据规模或划分方式当成固定规律。

## 记号

- 训练集中的 episode 集合记为 $\mathcal{T}$。
- 第 $i$ 个 episode 的帧数记为 $L_i$。
- 动作预测长度记为 $H$，相邻预测动作的采样间隔记为 $s$。
- batch size 记为 $B$。
- 训练 epoch 数记为 $E$。

若从当前时刻开始一共预测 $H$ 个动作，动作索引为

$$
t,\ t+s,\ t+2s,\ \ldots,\ t+(H-1)s,
$$

则最后一个动作相对当前帧的偏移量为

$$
\Delta=(H-1)s.
$$

在不额外补帧的前提下，第 $i$ 个 episode 可形成的有效训练 sample 数为

$$
n_i=\max(0,\ L_i-\Delta).
$$

训练集的 sample 总数为

$$
N_{\mathrm{train}}=\sum_{i\in\mathcal{T}}n_i.
$$

## Epoch 与 global step

一个 epoch 表示遍历一次训练集。若 DataLoader 不丢弃最后一个不足 batch 的批次，则每个 epoch 的优化 batch 数约为

$$
S_{\mathrm{epoch}}=\left\lceil\frac{N_{\mathrm{train}}}{B}\right\rceil.
$$

若启用 `drop_last=True`，则改为

$$
S_{\mathrm{epoch}}=\left\lfloor\frac{N_{\mathrm{train}}}{B}\right\rfloor.
$$

`global step` 通常是训练循环累计处理 batch 或执行优化更新的计数。若每个 batch 更新一次参数、没有梯度累积或特殊采样，则训练 $E$ 个 epoch 后近似有

$$
S_{\mathrm{global}}=E\cdot S_{\mathrm{epoch}}.
$$

实际代码若使用梯度累积、分布式采样、重复采样、动态过滤或自定义 step 计数，`global step` 与优化器更新次数可能不再一一对应，应以训练循环实现和日志定义为准。

数据预处理、episode 划分与训练配置的上下文见：[Diffusion Policy 数据训练流程](Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)。
