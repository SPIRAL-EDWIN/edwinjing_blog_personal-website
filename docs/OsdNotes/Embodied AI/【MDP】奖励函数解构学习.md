---
title: "MDP 奖励函数解构学习"
---

> [!warning] 阅读说明
> 本文是笔者基于特定课程、项目代码与个人学习过程整理的工作笔记。部分论断可能不完整、过时或依赖特定版本，请结合原始论文、官方文档及实际源码独立核验。

## 说明
1. 本文件定义了 EE_pose 任务的奖励/惩罚函数（reward terms）。
2. 这些函数会在配置文件中的 RewardsCfg 里通过 RewTerm(func=...) 被调用并乘以对应权重。
3. 本文件只负责“计算每一项 reward 的原始值”，最终总奖励由 RewardManager 做加权求和。
4. 常见缩写:

    - EE: End-Effector，末端执行器
    - SE3: 位姿空间（位置 + 朝向）
        - 关于位姿：即位置+姿态，也就是所谓的“6 DoF”（六自由度） <a id="obsidian-block-ca108c"></a>
            - 位置即Position，是坐标系中(x,y,z)反映的平移
            - 姿态即旋转，是对状态更全面的定义（如果只有位置，就好比坐标系只定义了原点，但坐标系本身还是可以随便旋转）
                - 姿态描述的就是XYZ轴分别指向绝对空间的哪三个方向
                - 它通常由三个角度构成：如最常用的欧拉角（*Roll 翻滚角*、*Pitch 俯仰角*、*Yaw 偏航角*）

                  ![Pasted image 20260706011546](../../assets/lab-projects/6b54da632c8f0825-Pasted-image-20260706011546.png){width="193"}

    - std/sigma: 容忍尺度，越小越严格（同样误差下 reward 会更低）

    - `_loco_mani_scale`: locomotion/manipulation混合因子，0 偏mani，1 偏loco
5. 张量约定:

    - 第一维通常是并行环境数 num_envs
    - 函数返回 shape 一般为 `(num_envs,)`，表示每个并行env一个标量 reward
## 运行时三层关系
- 本任务在运行时可分为三层：
    1. 实现层：mdp目录中定义的每个函数如何计算
    2. 配置层：在 `env_cfg` 中声明actions、commands、rewards、curriculum等项
    3. 管理器层：由框架的 ActionManager、CommandManager、RewardManager、CurriculumManager、ObservationManager在每个env.step中按顺序调度执行
## 具体的Task确定具体的奖励管理器
- 根据要训练的task（task的确定可以参考[仿真框架RFM的初步学习](%E4%BB%BF%E7%9C%9F%E6%A1%86%E6%9E%B6RFM%E7%9A%84%E5%88%9D%E6%AD%A5%E5%AD%A6%E4%B9%A0.md#obsidian-block-7ee914)显示的`__init__.py` 文件），可以得到对应的环境配置文件（通过查看`"env_cfg_entry_point": ...`）
    ![09eccfc7c361dc76c70f40122f62b0e8](../../assets/lab-projects/ffb1d9de346017ca-09eccfc7c361dc76c70f40122f62b0e8.png)

- 进入例如 `sf_tron1_arm_env_cfg` 文件后，找到
```python
@configclass
class RewardsCfg:
	"""Reward terms for the MDP."""
```
这一块代码就是这个任务下奖励函数的配置层

> [!question] `RewardsCfg` 和 `rewards.py` 的关系是什么
>  - `RewardsCfg` 是配置层，供RewardManager查看，决定该task要使用 `rewards.py` 中的**哪些奖励项**，每项**权重**多少，每项传哪些参数、哪些用默认值
>  - `rewards.py` 是实现层，**定义每个奖励项**具体怎么算（每个奖励项需要哪些参数，这些**参数的默认值定义**）
> 	 - 如 `safety_reward_exp` 的计算公式定义等
> 
> 他们的关系可以写成：$R_t=\sum_{i}^{} \omega_i·r_i(env,\ params_i)$
> 其中：
> - $r_i$ 来自 `rewards.py` ，是具体的奖励函数定义，包括env确定和传参需求确定
> - $\omega_i$ 和 $params_i$ 来自 `RewardsCfg` 
> 
> 例如对 `safety_reward_exp` 的理解：[【MDP】奖励函数解构学习](#obsidian-block-31a922)
## 具体解析 `rewards.py` （这里需要和 `command.py` 联动理解）
### 什么是 `_loco_mani_scale` ($s$)
> 这个参数是一个*按环境逐个计算*的动态权重，用来在locomotion相关奖励和manipulation相关奖励之间连续调整影响力，范围在 $[0,1]$
> 下划线前缀表示这是**内部状态缓存**，不是外部配置项
- 通俗理解：
    - 机器人在reset后刚开始要接近target时，时间还早，scale接近1，系统更偏向机器人稳定前进靠近目标物
    - 随着时间的推移，机器人被预期逐渐有locomotion主导变为manipulation主导，scale逐步变小，系统更偏向EE的精细控制
#### $s$ 在reward中的作用
1. 在计算 $R_t$ 中的 `safety_reward_exp` 安全奖励时：
    $R_{safety,t}=mani\_safety\_scale \cdot(1-s)+loco\_safety\_scale \cdot s$
    - s-->1：奖励函数更看重足/底盘的稳定性；s-->0:奖励函数更看重EE操作的安全性/稳定性
2. 操作奖励通常乘 $(1-s)$
3. 偏机动/参考项会乘 $s$
#### $s$ 如何得出
1. 在 `command.py`里先初始化`se3_distance_ref` 和 `_loco_mani_scale`
    - `self.se3_distance_ref = torch.ones(self.num_envs, device=self.device) * 5.0         # 即先给默认值5.0`
    - `self._env._loco_mani_scale = torch.ones(self.num_envs, device=self.device)               # 先给默认值1.0`
2. 每决策步更新误差`metrics`，并让 `se3_distance_ref` 按照 `decrease_vel` 递减
    - $se3\_distance\_ref \leftarrow \max\left(se3\_distance\_ref - decrease\_vel \cdot step\_dt,\ 0\right)$
3. 用sigmoid函数映射成 `_loco_mani_scale`
    - $\_loco\_mani\_scale=\sigma\left(\frac{5}{decay\_length}(se3\_distance\_ref-\mu)\right)$
        - 目前实际调用的参数是$\mu=1.0$, $decay\_length=1.0$
4. 当reset、命令到期、命令管理器策略触发resample时，`se3_distance_ref` 被重置如下：
    - $se3\_distance\_ref=2\cdot position\_error+orientation\_error$
    - 并且重新采样`decrease_vel`
> [!tip] resample是给某些环境重新抽样一个新的命令目标(位置/姿态)并重置相关计时和参考量的过程，由 `commands.py` 实现

> [!abstract] 总的来说，`commands.py` 中的 `_update_metrics` 在每一个决策步更新$s$
> 它直接读取环境内部状态和命令目标来算误差，然后用 sigmoid映射
##### `commands.py` 在整个流程中的作用
1. 生成EE目标命令
2. 读取env当前机器人状态并计算误差
3. 维护 `se3_distance_ref`
4. 把 `se3_distance_ref` 通过 sigmoid 变成_loco_mani_scale
5. 把这个门控系数交给 `rewards.py`用于混合locomotion与manipulation的奖励权重
### 对 `safety_reward_exp` 安全奖励的理解
 <a id="obsidian-block-31a922"></a>
> “safety”：该奖励鼓励“安全姿态和安全运动”
> “exp”：把误差通过指数函数做成平滑、有界的奖励
- 在配置文件的 `RewardsCfg` 中，可以得到奖励函数对`safety_reward_exp`该项奖励的权重和参数分配：
    ![Pasted image 20260630121233](../../assets/lab-projects/c4b13e5a0df2d7af-Pasted-image-20260630121233.png)

    - 权重weight=1.0；其中参数`base_height_target=0.8`，`std=sqrt(0.5)`而非默认值

- 对于`safety_reward_exp`函数本体，在 `rewards.py` 中：
    1. 这个函数先构造了两类*安全误差*：
        - manipulation safety error：操作安全
        - locomotion safety error：机动稳定
        - safety error的本质是，误差越小越安全，误差越大越不稳定，也就越不安全

        ![Pasted image 20260630121959](../../assets/lab-projects/82f38e022f4d2422-Pasted-image-20260630121959.png){width="371"}

    2. 然后把误差通过指数函数映射成奖励尺度 `_safety_scale` $scale=e^{-\frac{error}{std^2}}$，直观理解：
        - error=0时，奖励=1(最好) 
        - error变大时，奖励快速衰减到接近0
        - std越小，衰减越快(越严格)

### 对 `track_EE_position_exp` 的理解
【这部分待定，还没有具体学完】
> [!warning] 版本与调度顺序
> 以下 step 顺序与具体仓库代码、提交版本和管理器调度实现强相关，不能视为 Isaac Lab 或 MDP 的通用不变量；正文保留为当时项目代码的阅读记录。

## `rewards.py`在整个MDP中的流程
- 首先，根据[仿真框架RFM的初步学习](%E4%BB%BF%E7%9C%9F%E6%A1%86%E6%9E%B6RFM%E7%9A%84%E5%88%9D%E6%AD%A5%E5%AD%A6%E4%B9%A0.md#obsidian-block-05009e) 可以在 `sf_tron1_arm_env-cfg.py` 这样的**环境配置文件**中，定义了仿真环境中的“*底层物理时间步*”，也叫“*仿真步*”(`sim.step`) 和大脑睁眼看世界的“*决策步*” (`env.step`)
    - 根据图中可以得出每一个 `sim.step` 是 `sim_dt=0.005` 秒，也就是物理世界每0.005秒更新一次；而每一个 `env.step` 由*decimation（降采样率）* 和 `sim.step` 共同决定，是 `step_dt = 4 * 0.005 = 0.02` 秒，也就是大脑每0.02s睁眼看一次世界并给一次action
    ![Pasted image 20260630104447](../../assets/lab-projects/624ba696320b57e9-Pasted-image-20260630104447.png)

1. 在上一个 `env.step` 结束的瞬间，`observations.py` 观测env计算得到参数字典$obs_k$，打包成一个tuple发送给Policy（神经网络），policy根据PPO算法返回对应的action $a_k$
2. 在该 `env.step` 这个0.02s内: $[t_k,t_k+0.02)$，$a_k$ 连续作用在其中的4个物理步
3. 在时刻$t_k+0.02$，`termination.py` 终止管理器会判定哪些envs中的机器人出现了问题（done，time_out）等，给这些envs打上reset标记
4. 同一时刻，`rewards.py` 奖励管理器会计算这个0.02s内的奖励$reward_k$
    - 注意⚠️，奖励函数不考虑robot在0.02s内是否要reset，它只对reset前的状态打分
5. 对有reset标记的envs进行重置resample
6. `commands.py` 命令管理器执行 `compute(step_dt)`，内部状态被向前推进 `step_dt` 秒
    - 与此同时，`commands.py` 还会更新内部状态：计算误差、`se3_distance_ref`、`loco_mani_scale`等
        - 如何得到`loco_mani_scale`：命令管理器调用 **`_update_metrics()`** 功能，输入 `se3_distance_ref` 计算得到。用于下一轮$[t_k+0.02,t_k+0.04)$末的reward计算
7. 然后 `observations.py` 获取当前envs的各个状态参数$obs_{k+1}$，包括外部状态和已更新的内部状态（仅被注册为观测项的部分，如 `EE_se3_distance_reference = ObsTerm(func=mdp.EE_se3_distance_ref)`，这就表明`_se3_distance_ref`会被Observation获取并提供给policy），用于下一轮提交给policy，生成下一个决策步的$a_k$，以此循环往复
