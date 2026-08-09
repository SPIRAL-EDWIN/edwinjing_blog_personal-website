---
title: "Diffusion Policy 真机部署概念架构"
description: "梳理 Diffusion Policy 从观测、推理到动作接口的真机部署概念架构。"
date: 2026-08-05
author: "Chen Jing (经宸)"
---

# Diffusion Policy 真机部署概念架构

> [!warning] 经验与安全说明
> 本文部分结论与命令来自笔者在特定软硬件版本、项目代码和实验环境中的个人实践，仅供学习与方案参考，不保证适用于其他环境，也不构成法律、专业或安全建议。执行前请核对官方文档、备份数据，并独立评估权限、设备与实验风险。

> [!danger] 这不是机器人安全操作流程
> 本文只描述观测、策略推理、动作转换与机器人接口之间的概念关系，没有覆盖急停、碰撞检测、速度与力矩限制、工作空间隔离、通信失效保护或人工监护。任何真机执行都必须由具备权限的人员按设备规范另行完成风险评估与安全验收。

> [!abstract] Diffusion Policy 真机部署确实是把训练好的 checkpoint 用到真实机械臂上，但不是给机械臂本体
> 而是“<mark>在一台控制电脑上运行 diffusion policy 推理程序，实时读取相机/机械臂状态，把模型输出的动作转换成机器人控制指令，再通过 ROS、SDK 或控制器发给真实机械臂</mark>”
> 
> 可以把它理解成一个闭环：
> ```text
> 真实相机 + 机械臂状态
>        ↓
> 观测预处理、归一化、坐标变换
>        ↓
> 加载训练好的 diffusion policy checkpoint 推理
>        ↓
> 输出未来一段动作序列
>        ↓
> 反归一化、限幅、平滑、安全检查
>        ↓
> 发送给机械臂控制器执行
>        ↓
> 	 循环
> ```
> 
> Diffusion Policy 部署不是只有 `checkpoint -> robot`，中间还有一整套 **observation pipeline、action conversion、robot interface、safety wrapper**

|对比|Diffusion Policy 部署|WBC/ONNX 部署|
|---|---|---|
|模型性质|模仿学习策略，通常从人类示教学任务|控制策略/全身控制策略，偏底层控制|
|输入|常见是相机图像 + proprioception，例如关节角、夹爪状态|常见是 proprioception、目标状态、IMU 等，视觉不一定有|
|输出|一段未来动作序列，如末端位姿、关节位置、夹爪动作|通常是关节位置、速度、力矩、残差动作等|
|控制频率|通常较低，例如 5-30 Hz 推理，再执行 action chunk|通常更高频，可能 50-500 Hz|
|推理方式|diffusion 需要多步 denoising，checkpoint 往往直接用 PyTorch 跑|ONNX 通常是为了高效、稳定、跨平台部署|
|是否是底层控制器|不是，它更像“任务级动作生成器”|更接近机器人运动/力控/全身控制层|
|真机关键问题|相机标定、延迟、图像分布、坐标系、动作尺度、安全限幅|控制频率、动力学稳定性、接触、力矩限制、安全约束|

- **WBC ONNX 部署**像是在问：  
    “*机器人每 2ms/10ms 应该给每个关节什么控制量，才能稳定运动？*”
- **Diffusion Policy 部署**像是在问：  
    “*看到当前桌面和机械臂状态，接下来 1-2 秒应该怎么移动末端和夹爪来完成任务？*”
    - 所以 diffusion policy 通常还需要底层控制器来执行它给出的动作。比如 diffusion policy 输出："末端向前 2cm，向下 1cm，夹爪关闭"
    - 但真实机械臂不能直接“理解”这个，它需要通过 Cartesian controller、joint trajectory controller、inverse kinematics 或厂家 SDK 转换成实际关节命令。
