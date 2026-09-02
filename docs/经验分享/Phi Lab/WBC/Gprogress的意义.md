---
title: "Gprogress 的意义"
---

> [!warning] 阅读说明
> 本文是笔者基于特定课程、项目代码与个人学习过程整理的工作笔记。部分论断可能不完整、过时或依赖特定版本，请结合原始论文、官方文档及实际源码独立核验。

从最终总奖励的角度看，$Q_{\mathrm P}(t)= \exp\left(-\frac{b_{\mathrm P}(t)}{0.5}\right), \qquad Q_{\mathrm R}(t)= \exp\left(-\frac{b_{\mathrm R}(t)}{0.5}\right)$ 和 $G_{\mathrm{progress}}$ 的作用确实在部分对冲：

- 但是代码后来有意修改了原始PB的目标：

> 近目标进步仍然更有价值，但**不能有价值到让PB在后期manipulation阶段继续主导总奖励**

## 看最终有效系数
只考虑**位置**进步部分，暂时忽略安全尺度：

$$
r_{\mathrm{pb,P}}(t) = 2\Delta e_{\mathrm P}(t) \underbrace{ Q_{\mathrm P}(t)G_{\mathrm{progress}}(t) }_{\text{最终有效进步权重}}
$$
所以最终真正决定“同样大小的进步值多少钱”的并不是单独的 $Q_{\mathrm P}$，而是：

$$
Q_{\mathrm P}(t)G_{\mathrm{progress}}(t)
$$
假设当前步刷新了历史最优，因此近似有 $b_{\mathrm P}=e_{\mathrm P}$：

| 位置误差                | $Q_{\mathrm P}$ | $G_{\mathrm{progress}}$ | 最终乘积      |
| ------------------- | --------------- | ----------------------- | --------- |
| $e_{\mathrm P}=1.0$ | $0.135$         | $\approx1$              | $0.135$   |
| $e_{\mathrm P}=0.5$ | $0.368$         | $0.625$                 | $0.230$   |
| $e_{\mathrm P}\to0$ | $\to1$          | $\to0.25$               | $\to0.25$ |

- 如果没有 $G_{\mathrm{progress}}$，从远目标到近目标，权重会从：$0.135\longrightarrow1$：增长约7.4倍
- 加入 $G_{\mathrm{progress}}$ 后变成：$0.135\longrightarrow0.25$

**==>仍然是近目标进步更重要，但只高约1.85倍，不再无限趋向由PB主导**

所以它不是彻底推翻 $Q$，而是把 $Q$ 的近目标增强作用“限幅”

## 为什么不能只保留 $Q$ 而要让 $G_{progress}$ 参与限制？
因为PB和position/orientation reward的功能不同:

- PB奖励的是：**当前步有没有刷新历史最优误差**
- 而position/orientation reward奖励的是：**当前是否持续保持较小的绝对误差**

因此：

- PB适合解决“怎样不断靠近、不断取得新进展”-><mark>【Loco-mani逐渐转变阶段】</mark>
- position/orientation适合解决“近目标后怎样稳定、精确地保持目标位姿”-><mark>【mani阶段】</mark>

如果近目标时PB仍保持完整强度，策略可能更关心：

> 怎样在这一瞬间再刷新一点best error？

而不是：

> 怎样持续稳定地保持较小误差？

这可能鼓励快速小碎步、激进伸手或通过动态试探不断碰出一个更小的瞬时误差。

## 为什么不是直接让PB近目标乘0？
因为近目标的new-best进步仍然有用。尤其训练早期，position/orientation reward可能还不足以引导策略继续提高精度。

所以代码保留了下限：$G_{\mathrm{progress}}\to0.25$

含义是：

> PB在近目标时退居辅助地位，但不完全退出

这形成的是**软交接**：
$\text{远目标：PB主导进展} \quad\longrightarrow\quad \text{近目标：position/orientation主导精定位}$

## 从配置权重看更直观
- 最终配置中，PB、位置追踪和朝向追踪的权重分别为：

$$
\omega_{\mathrm{pb}}=15,\qquad
\omega_{\mathrm P}=4,\qquad
\omega_{\mathrm R}=5
$$

- PB奖励还会乘$G_{\mathrm{progress}}(t)$，因此PB项前面的这部分系数为：

    <span class="arithmatex arithmatex--display">&#92;&#91;15G&#95;&#123;&#92;mathrm&#123;progress&#125;&#125;&#40;t&#41;&#92;&#93;</span>

    - 远离目标时，$G_{\mathrm{progress}}(t)\to1$，这部分系数接近15，PB基本完整发挥作用

    - 接近目标时，$G_{\mathrm{progress}}(t)\to0.25$，这部分系数降低至约3.75

    - 与此同时，position和orientation rewards分别具有权重4和5，并通过$(1-L(t))$在预期manipulation阶段逐渐充分生效

> [!abstract] 因此，$G_{\mathrm{progress}}$使PB在远目标阶段主要负责鼓励接近目标的进展
> 进入近目标阶段后，PB降低影响但不完全退出，将精确位姿追踪的主要任务交给position和orientation rewards

## Conclusion
可以把你的原有理解稍微修正为：

- $Q_{\mathrm P},Q_{\mathrm R}$：使PB内部更重视高精度区域发生的new-best进步；
- $G_{\mathrm{progress}}$：限制这种近目标增强在总奖励中的最大影响，防止PB取代专门的manipulation rewards。

因此，二者确实存在有意的数值对冲。最终目的不是让“越近的进步越值钱”无限增强，而是：

> 让近目标进步比远目标进步更有价值，但只保留适度优势，并在manipulation阶段把主要控制权交给position和orientation tracking rewards

> [!warning] 如果没有 $G_{\mathrm{progress}}$，PB更像一个贯穿全程、近目标尤其强的精定位奖励；加入它之后，PB才更接近一个负责loco–mani过渡的progress reward
