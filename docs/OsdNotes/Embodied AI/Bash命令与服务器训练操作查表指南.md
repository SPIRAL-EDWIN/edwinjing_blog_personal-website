---
title: "Bash命令与服务器训练操作查表指南"
description: "面向科研服务器训练场景的 Bash、会话管理、文件传输与进程排查查表笔记。"
date: 2026-08-05
author: "Chen Jing (经宸)"
---

# Bash命令与服务器训练操作查表指南

> [!warning] 经验与安全说明
> 本文部分结论与命令来自笔者在特定软硬件版本、项目代码和实验环境中的个人实践，仅供学习与方案参考，不保证适用于其他环境，也不构成法律、专业或安全建议。执行前请核对官方文档、备份数据，并独立评估权限、设备与实验风险。

> 用途：阅读 AI、教程或团队成员给出的 Bash 命令时，快速判断“命令做什么、选项是什么意思、在哪台机器运行、是否会写入或删除文件”。
> 本指南覆盖 [UMI-on-Tron 仿真训练流程](../../经验分享/Phi%20Lab/WBC/UMI-on-Tron%20%E4%BB%BF%E7%9C%9F%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md) 和 [数据训练流程](../../经验分享/Phi%20Lab/Diffusion%20Policy/Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md) 等工作流中实际出现过的命令。
> 按顺序执行新数据训练时使用 [Diffusion Policy数据训练流程](../../经验分享/Phi%20Lab/Diffusion%20Policy/Diffusion%20Policy%E6%95%B0%E6%8D%AE%E8%AE%AD%E7%BB%83%E6%B5%81%E7%A8%8B.md)；本文作为通用命令含义和排障的唯一查表入口。
## 0. 先学会拆一条命令
以这条命令为例：
```bash
DATA_ROOT="/path/to/data"
ls -lh "$DATA_ROOT"
```
可以拆成：

| 部分             | 名称    | 含义              |
| -------------- | ----- | --------------- |
| `ls`           | 命令    | 要执行的程序：列出文件     |
| `-l`           | 短选项   | 显示详细信息          |
| `-h`           | 短选项   | 用 KB、MB、GB 显示大小 |
| `-lh`          | 组合短选项 | 等同于 `-l -h`     |
| `"$DATA_ROOT"` | 位置参数  | 命令要处理的对象        |

再看：
```bash
DATASET_PATH="/path/to/dataset.npz"
TRAIN_CONFIG_NAME="<TRAIN_CONFIG_NAME>"
python train.py --config-name="$TRAIN_CONFIG_NAME" task.dataset_path="$DATASET_PATH"
```

|部分|名称|含义|
|---|---|---|
|`python`|命令|启动 Python|
|`train.py`|位置参数|让 Python 执行这个脚本|
|`--config-name=...`|长选项|选择 Hydra 配置|
|`task.dataset_path=...`|Hydra override|覆盖配置中的 dataset 路径；它不是普通 Bash 选项|

> [!important] 选项含义属于具体命令
> `-f` 在 `tail -f` 中表示持续跟踪，在 `test -f` 中表示检查普通文件，在其他命令中可能完全不同。不要脱离命令名称单独记忆 `-f`。
## 1. `-`、`--`、参数和子命令

<div class="bash-option-table" markdown>

|形式|名称|例子|理解方式|
|---|---|---|---|
|`-h`|短选项|`df -h`|通常是单个字母，大小写敏感|
|`-lh`|组合短选项|`ls -lh`|通常等同于 `ls -l -h`|
|`-o PATH`|带值短选项|`-o result.npz`|`-o` 后面的内容是它的值|
|`--device cuda`|带值长选项|eval 命令|长选项通常是完整单词|
|`--fps 10`|带值长选项|visualize|将 fps 设置为10|
|`--rotate`|布尔长选项|visualize|出现即开启，不需要额外值|
|`--config-name=NAME`|等号写法|Hydra|选项和值写在同一个参数中|
|`git status`|命令+子命令|Git|`git` 是程序，`status` 是操作|
|`conda activate "$CONDA_ENV"`|命令+子命令+参数|Conda|激活变量指定的环境|
|`--`|选项终止符|`command -- -file`|后面内容即使以 `-` 开头也按普通参数处理|

</div>

注意：

```text
-p 与 -P 可能含义不同
-h 与 --help 不一定相同
-avP 通常是 -a -v -P 的组合
-c%s 可能是选项 -c 紧跟它的值 %s，不一定是多个短选项
```

## 2. Bash 常见符号

<div class="bash-symbol-table" markdown>

|符号|作用|例子|
|---|---|---|
|空格|分隔命令和参数|`ls -lh /data`|
|`"`|双引号；保护空格，但展开变量|`"$RUN_DIR"`|
|`'`|单引号；内容按原样处理|`'*.mcap'`|
|`$VAR`|读取变量|`"$RUN_DIR"`|
|`VAR=value`|设置变量|`RUN_NAME="example_run"`|
|`$(command)`|执行命令并取得输出|`hash=$(sha256sum ...)`|
|`*`|通配任意字符|`*.json`|
|`?`|通配单个字符|`file?.txt`|
|`|`|把左边输出送给右边|`find ... | wc -l`|
|`>`|覆盖写入文件|`git rev-parse HEAD > commit.txt`|
|`>>`|追加写入文件|`echo text >> log.txt`|
|`<`|把文件作为标准输入|`command < input.txt`|
|`2>`|重定向错误输出|`command 2> error.txt`|
|`2>&1`|把错误并入普通输出|常见于日志记录|
|`&&`|前一条成功才执行下一条|安全串联命令|
|`||`|前一条失败才执行下一条|错误处理|
|`;`|无论成功失败都继续|`cmd1; cmd2`|
|`(...)`|在独立子 Shell 中执行一组命令|smoke test 安全命令组|
|`\` 行末|命令续行|下一物理行仍属于同一命令|
|`#`|注释开始|`# 这是说明`|
|`~`|当前用户主目录|具体位置由当前账户决定，可用 `printf '%s\n' "$HOME"` 查看|
|`.`|当前目录|`./script.sh`|
|`..`|上一级目录|`cd ..`|
|`&`|后台运行|不等于 tmux；关闭终端后可能受影响|

</div>

`set -e` 会让 Shell 在命令失败时停止继续执行该命令组。将它放在 `(...)` 内，可以让安全检查失败时停止后续操作，同时不关闭外层终端。
> [!warning] 反斜杠必须是该行最后一个字符
> ```bash
> command \      # 这里写注释
> ```
> - 反斜杠后不能再放空格或行内注释
> - 把多行命令改成一行时，删除反斜杠和换行，并保留一个空格。
## 3. 引号、通配符与路径
为什么这里要给 `*.mcap` 加引号：
```bash
find "$DATA_ROOT" -name "*.mcap"
```
引号阻止当前 Shell 提前展开 `*`，让 `find` 自己处理匹配。

**路径含空格时必须加引号：**
```bash
cd "/path/with spaces/Project"
```

三种路径：

|类型|例子|特点|
|---|---|---|
|绝对路径|`/path/to/data`|从根目录开始，不依赖当前目录|
|相对路径|`utils/mcap_to_zarr.py`|相对于当前 `pwd`|
|主目录路径|`~/project`|依赖当前用户|

> [!tips] 本项目优先显式设置路径变量
> 用 `LOCAL_PATH`、`SERVER_PATH`、`DATA_ROOT` 等变量表达路径，并在传参时写成 `"$VARIABLE"`。不要把含尖括号的占位符直接复制到 Shell，因为 `<` 与 `>` 是重定向符号。
## 4. 先判断命令在哪台机器运行

|线索|机器|
|---|---|
|`$LOCAL_PATH`|本机路径|
|`$SERVER_PATH`|服务器系统盘路径|
|`$DATA_ROOT`|服务器数据盘路径|
|`${SERVER_USER}@${SERVER_HOST}:...`|通过 SSH 访问服务器|
|不同操作系统的路径形式|先用 `uname`、`hostname` 与 `pwd` 确认环境|

确认当前终端：
```bash
whoami
hostname
pwd
```

|命令|含义|安全性|
|---|---|---|
|`whoami`|当前用户|只读|
|`hostname`|当前机器名|只读|
|`pwd`|当前目录|只读|
|`cd PATH`|切换当前目录|只改变当前Shell状态|

## 5. 文件查找与数量统计

|命令/选项|含义|
|---|---|
|`find PATH`|递归查找 PATH 及其子目录|
|`-type f`|只匹配普通文件|
|`-type d`|只匹配目录|
|`-name "*.mcap"`|按文件名匹配|
|`-empty`|匹配0字节文件或空目录|
|`sort`|对文本行排序|
|`wc -l`|统计行数；接在 `find` 后通常表示文件数量|

示例：
```bash
find "$LOCAL_PATH" -type f -name "*.mcap" | sort
```
含义：递归查找全部 MCAP，并按路径排序显示。

```bash
find "$LOCAL_PATH" -type f -name "*.mcap" | wc -l
```
含义：统计 MCAP 数量。
## 6. 文件信息、大小与完整性

| 命令          | 常用选项   | 含义                |
| ----------- | ------ | ----------------- |
| `ls`        | `-l`   | 详细列表：权限、所有者、大小、时间 |
| `ls`        | `-h`   | 易读大小（MB，GB）       |
| `du`        | `-s`   | 只显示目录总计           |
| `du`        | `-h`   | 易读单位              |
| `df`        | `-h`   | 查看文件系统容量和剩余空间     |
| `stat`      | `-c%s` | Linux中只输出精确字节数    |
| `sha256sum` | 无      | 计算文件内容指纹          |

区别：
```text
ls -lh FILE：快速看文件本身
du -sh DIR：这个目录实际占多大
df -h PATH：承载该路径的整块磁盘还剩多少
stat -c%s FILE：文件精确字节数
sha256sum FILE：文件内容是否完全一致
```

常用检查：
```bash
ls -lh "$DATA_ROOT"
du -sh "$DATA_ROOT"
df -h / "$DATA_ROOT"
stat -c%s "$DATA_ROOT"
sha256sum "$DATA_ROOT"
```
## 7. 文件与目录条件检查

|写法|含义|
|---|---|
|`test -e PATH`|路径存在|
|`test ! -e PATH`|路径不存在|
|`test -f PATH`|存在且是普通文件|
|`test -d PATH`|存在且是目录|
|`test -r PATH`|当前用户可读|
|`test -w PATH`|当前用户可写|
|`mkdir DIR`|创建目录|
|`mkdir -p DIR`|连同父目录一起创建；已存在时不报错|

注意：
```bash
test ! -e "$DATA_ROOT"
mkdir -p "$DATA_ROOT"
```
第一条失败不会自动阻止第二条。需要安全串联时：
```bash
test ! -e "$DATA_ROOT" && mkdir -p "$DATA_ROOT"
```
## 8. 查看文本与实时日志

|命令|选项|含义|
|---|---|---|
|`cat FILE`|无|输出整个文件|
|`sed -n '1,220p' FILE`|`-n`|只显示指定范围|
|`tail -n 5 FILE`|`-n 5`|显示最后5行|
|`tail -f FILE`|`-f`|持续跟踪新增内容|
|`tee FILE`|无|屏幕显示的同时写入文件|

```bash
tail -f "$LOG_PATH"
```
按 `Ctrl+C` 只停止 `tail`；如果训练在tmux中，训练不会因此停止。
## 9. Git 代码版本检查

|命令|含义|
|---|---|
|`git remote -v`|查看远程仓库地址；`-v` 显示详细信息|
|`git branch --show-current`|显示当前分支|
|`git rev-parse HEAD`|显示当前完整 commit|
|`git status --short`|紧凑显示修改和未跟踪文件|
|`git submodule status`|查看子模块状态|
|`git clone URL`|下载仓库，会写入文件|

`git status --short` 常见标记：

|标记|含义|
|---|---|
|无输出|工作区 clean|
|`M`|文件已修改|
|`??`|未跟踪文件|
|`A`|新增到Git暂存区|
|`D`|文件被删除|

> [!WARNING] 高风险 Git 命令
> `git reset --hard`、`git checkout -- FILE` 会丢弃本地修改。除非已经确认并备份，否则不要照抄。
## 10. Conda 与 Python

|命令|含义|
|---|---|
|`conda activate "$CONDA_ENV"`|激活环境；影响当前终端后续命令|
|`conda run -n "$CONDA_ENV" COMMAND`|只用指定环境运行这一条命令|
|`conda create -n NAME python=3.10 -y`|创建环境；`-n`指定名称，`-y`自动确认|
|`python script.py`|执行Python脚本|
|`python -c "CODE"`|执行引号中的短Python代码|
|`python -m pip ...`|用当前Python对应的pip|

对比：
```text
CONDA_ENV="<CONDA_ENV>"
conda activate "$CONDA_ENV"
python eval.py
```
需要当前Shell已初始化Conda。

```text
conda run -n "$CONDA_ENV" python eval.py
```
一条命令自包含，更适合从新终端直接复制。

示例：
```bash
python -c "import torch; print(torch.__version__)"
```
`;` 在Python字符串内部用于分隔多条Python语句，不是外层Bash命令分隔。
## 11. GPU、CPU 与系统资源

|命令|含义|
|---|---|
|`nvidia-smi`|GPU、Driver、显存、利用率、进程|
|`watch -n 5 nvidia-smi`|每5秒刷新一次|
|`nproc`|可用逻辑CPU核心数|
|`free -h`|内存和swap|

常见环境变量：

|写法|含义|
|---|---|
|`CUDA_VISIBLE_DEVICES=1`|只让该命令看到物理GPU 1|
|`CUDA_VISIBLE_DEVICES=1,2,3`|让该命令看到三张GPU|
|`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`|降低PyTorch显存碎片风险|
|`WANDB_DIR="$DATA_ROOT"`|指定 W&B 写入目录|

环境变量写在命令前，只影响这一条命令：
```bash
CUDA_VISIBLE_DEVICES=1 python train.py
```

***物理GPU 1在该Python进程内部通常会重新编号为 `cuda:0`***
<a id="obsidian-heading-9bff7e9216a8"></a>
## 12. `tmux` 会话

|命令或按键|含义|
|---|---|
|`tmux new -s "$RUN_NAME"`|创建并进入指定名称的会话|
|`tmux ls`|列出会话，可看到会话名和 attached/detached 状态|
|`tmux attach -t "$RUN_NAME"`|重新进入同名会话|
|`Ctrl+B` 后按 `D`|在 tmux 内 detach，只离开会话，不停止训练|
|`tmux detach-client -s "$RUN_NAME"`|从会话中移除当前连接的客户端|
|`Ctrl+C`|停止当前前台程序，不等于 detach|
|`tmux kill-session -t "$RUN_NAME"`|终止并删除这一个会话|

`RUN_NAME` 是训练流程中显式赋值的变量。创建、重连和删除时必须使用同一个值。

完整生命周期：
```text
1. tmux new -s 会话名：创建训练会话
2. Ctrl+B，再按 D：离开但保持训练      # 这里直接叉掉关闭也可以
3. tmux ls：查看会话是否仍存在
4. tmux attach -t 会话名：重新查看训练
5. 确认训练自然结束和进程退出
6. tmux kill-session -t 会话名：删除已结束的会话
7. tmux ls：确认会话已消失
```
> [!warning] `tmux kill-session` 不只是删除一条列表记录
> 如果会话中的训练仍在运行，该命令会一起终止它。删除前先核对会话名、训练完成状态和 GPU 进程。不使用 `tmux kill-server`，因为它会删除当前 tmux server 中的所有会话。
<a id="obsidian-heading-b9b8df264f6a"></a>
## 13. 进程查找与终止

| 命令/选项                   | 含义                     |
| ----------------------- | ---------------------- |
| `pgrep PATTERN`         | 查找进程PID                |
| `pgrep -f PATTERN`      | 匹配完整命令行                |
| `pgrep -a PATTERN`      | 显示PID和命令               |
| `pgrep -af train.py`    | 查找完整命令中包含train.py的进程   |
| `ps -o ... -p PID`      | 按指定列查看PID详情            |
| `fuser -v /dev/nvidia1` | 查看正在使用物理 GPU 1 设备文件的进程 |
| `kill -TERM PID`        | 请求进程正常退出               |
| `kill -KILL PID`        | 立即强制终止，等同 `kill -9`    |

安全顺序：
```text
1. tmux中按Ctrl+C
2. pgrep -af 查找
3. ps核对用户、命令、run路径
4. kill -TERM 精确PID
5. 仍不退出才kill -KILL
6. nvidia-smi确认显存释放
```
### `pgrep` 查不到，但 GPU 仍然占满
`pgrep -af train.py` 只查找完整命令行中仍包含 `train.py` 的进程。它没有输出，不能单独证明 GPU 没有被占用。

- 按这个顺序查：
```bash
nvidia-smi
ps -o user,pid,ppid,pgid,etime,%cpu,%mem,cmd -p 12345
fuser -v /dev/nvidia1
```
1. 先从 `nvidia-smi` 底部的 Processes 表读取占用显存的 PID。
2. 用 `ps` 检查该 PID 的完整命令、已运行时间和父进程。`12345` 仅是示例，必须替换。
3. 如果 `nvidia-smi` 的 Processes 表不完整，可用 `fuser -v /dev/nvidia1` 从 GPU 设备反向查找进程；数字 `1` 替换为实际 GPU 编号。
4. 共享账号时，用户名相同不能证明进程属于自己；还要核对 run 路径、启动时间和 tmux 会话。
5. 只对已确认属于自己的精确 PID 先发送 `TERM`，仍不退出才考虑 `KILL`。

> [!warning] 无法对应到进程时不要猜测性 kill
> 如果显存仍被占用，但 `nvidia-smi`、`ps` 和 `fuser` 都无法给出可核对的 PID，可能需要管理员检查容器、驱动上下文或其他用户的任务。不要自行重置共享 GPU 或宽泛终止 Python 进程。

> [!WARNING] 不要宽泛杀进程
> ```bash
> pkill -9 -f train.py
> ```
> 在共享账号中可能终止其他人的训练。优先使用核对后的精确PID。
## 14. SSH 与 rsync
SSH远程命令：
```bash
SERVER_USER="<SERVER_USER>"
SERVER_HOST="<SERVER_HOST>"
ssh "${SERVER_USER}@${SERVER_HOST}" COMMAND
```
结构：

|部分|含义|
|---|---|
|`ssh`|远程连接程序|
|`$SERVER_USER`|服务器用户名变量|
|`$SERVER_HOST`|服务器地址变量|
|`COMMAND`|在服务器执行的命令|

rsync示例：
```bash
LOCAL_PATH="/path/to/local/file"
DATA_ROOT="/path/to/remote/directory"
rsync -avP "$LOCAL_PATH" "${SERVER_USER}@${SERVER_HOST}:$DATA_ROOT"
```

|选项|含义|
|---|---|
|`-a`|archive：递归并尽量保留属性|
|`-v`|verbose：显示详细过程|
|`-P`|等价于 `--partial --progress`：保留部分文件并显示进度|
|`--progress`|显示传输进度；已有 `-P` 时通常重复|

远程路径格式：
```text
用户@服务器:远程绝对路径
```

文件与目录尾部 `/`：
```text
latest.ckpt     表示文件
latest.ckpt/    错误地把文件当目录
target_dir/     表示目标目录
```
## 15. 管道、统计与自动比较
管道示例：
```bash
find "$DATA_ROOT" -type f -name "*.json" | wc -l
```
执行顺序：
```text
find输出文件路径
→ | 把路径传给wc
→ wc -l统计行数
```

自动比较SHA-256：
```bash
local_hash=$(sha256sum "$LOCAL_PATH" | awk '{print $1}')
remote_hash=$(ssh "${SERVER_USER}@${SERVER_HOST}" sha256sum "$DATA_ROOT" | awk '{print $1}')
if [ -n "$local_hash" ] && [ -n "$remote_hash" ] && [ "$local_hash" = "$remote_hash" ]; then
  echo "PASS"
else
  echo "FAIL"
fi
```

关键部分：

|写法|含义|
|---|---|
|`awk '{print $1}'`|只取输出的第一列，即哈希|
|`[ ... ]`|条件测试|
|`-n "$hash"`|字符串非空|
|`=`|字符串相等|
|`if ...; then ...; else ...; fi`|Bash条件分支|

## 16. Python训练命令与Hydra overrides
典型结构：
```bash
DATASET_PATH="/path/to/dataset.npz"
TRAIN_CONFIG_NAME="<TRAIN_CONFIG_NAME>"
TRAIN_EPOCHS="<TRAIN_EPOCHS>"
BATCH_SIZE="<BATCH_SIZE>"
python train.py \
  --config-name="$TRAIN_CONFIG_NAME" \
  task.dataset_path="$DATASET_PATH" \
  training.num_epochs="$TRAIN_EPOCHS" \
  dataloader.batch_size="$BATCH_SIZE"
```

|部分|含义|
|---|---|
|`python train.py`|执行训练入口|
|`--config-name=...`|选择Hydra配置|
|`task.dataset_path=...`|覆盖dataset路径|
|`training.num_epochs=...`|覆盖训练 epoch 数|
|`dataloader.batch_size=...`|覆盖 batch size|

Hydra override特点：
```text
前面没有 - 或 --
形式通常是 配置层级.字段=值
字段名必须与项目源码完全一致
```
本项目必须保留：
```text
task.dataset_frequeny
```
*虽然 `frequeny` 拼写错误，但它是实际字段，不能擅自改成 `frequency`*
## 17. Accelerate多GPU命令
典型结构：
```bash
NUM_PROCESSES="<NUM_PROCESSES>"
GPU_IDS="<GPU_IDS>"
accelerate launch \
  --num_processes "$NUM_PROCESSES" \
  --gpu_ids "$GPU_IDS" \
  --num_machines 1 \
  --dynamo_backend no \
  train.py
```

|参数|含义|
|---|---|
|`accelerate launch`|用Accelerate启动程序|
|`--num_processes ...`|启动指定数量的训练进程|
|`--gpu_ids ...`|使用本次调度分配的物理 GPU|
|`--num_machines 1`|单机训练|
|`--dynamo_backend no`|不使用torch.compile/Dynamo后端|
|`train.py`|被启动的训练脚本|

`dataloader.batch_size` 在常见多进程配置中表示每进程 batch；全局有效 batch 还受到 Accelerate 分片和梯度累积设置影响，具体以当前代码为准。
## 18. Checkpoint相关字段

|字段|含义|
|---|---|
|`checkpoint.save_last_ckpt=true`|保存最新checkpoint|
|`checkpoint.save_last_ckpt=false`|关闭latest.ckpt|
|`checkpoint.topk.k=K`|最多保留 K 个按监控量排序的 checkpoint|
|`checkpoint.topk.k=0`|关闭TopK|
|`training.checkpoint_every=N`|每 N 个 epoch 进入周期保存逻辑|
|`training.resume=true`|按项目逻辑尝试恢复；实际恢复内容取决于序列化代码|
|`training.resume=false`|从头训练；不能仅凭该字段推断 checkpoint 包含哪些状态|

Smoke test要同时使用：
```text
checkpoint.save_last_ckpt=false
checkpoint.topk.k=0
```
因为latest和TopK是两套独立机制。
## 19. 高频训练参数

|字段|含义|
|---|---|
|`training.num_epochs`|最多训练多少个epoch|
|`training.max_train_steps`|每个epoch最多训练多少步；用于smoke test|
|`dataloader.batch_size`|每个训练batch的样本数|
|`val_dataloader.batch_size`|验证batch的样本数|
|`dataloader.num_workers`|训练数据加载进程数|
|`val_dataloader.num_workers`|验证数据加载进程数|
|`training.gradient_accumulate_every`|累计多少个batch后更新参数|
|`logging.mode=offline`|W&B离线记录|
|`hydra.run.dir=PATH`|本次输出目录|

概念关系：
```text
episode：一段完整示教
sample：从某个时间点构造的 observation + 未来 action
batch：GPU一次处理的一组sample
global_step：累计训练迭代
epoch：完整遍历一次全部训练sample
```
## 20. 常见“看起来没输出”的正常情况

|命令|无输出通常表示|
|---|---|
|`git status --short`|工作区clean|
|`find PATH -name "*.ckpt"`|没有找到checkpoint|
|`test ! -e PATH`|路径不存在，条件成功|
|`pgrep -af PATTERN`|没有匹配进程|

要查看上一条命令是否成功：
```bash
echo $?
```

|退出码|含义|
|---:|---|
|`0`|成功|
|非0|失败或条件不成立|

## 21. 危险命令速查

| 命令                  | 风险              |
| ------------------- | --------------- |
| `rm FILE`           | 删除文件            |
| `rm -r DIR`         | 递归删除目录          |
| `rm -rf DIR`        | 强制递归删除，风险极高     |
| `sudo COMMAND`      | 以管理员权限执行        |
| `chmod 777 PATH`    | 给所有人完全权限，通常不应使用 |
| `chown -R USER DIR` | 递归改变所有者         |
| `kill -KILL PID`    | 进程无法清理即被强制终止    |
| `pkill -f PATTERN`  | 批量终止所有匹配进程      |
| `git reset --hard`  | 丢弃Git工作区修改      |
| `>`                 | 可能覆盖现有文件        |
| 转换脚本的 `-o`          | 项目脚本可能删除并重写同名输出 |

> [!important] 看到这些命令先停一下
> 在运行前确认机器、用户、绝对路径、目标是否已备份，以及命令会影响自己的任务还是其他人的数据。
## 22. AI给出命令后的检查清单
- 运行前依次回答：
    - ☐ 这条命令在本机、服务器还是其他远程环境运行？
    - ☐ 第一个单词是什么程序？
    - ☐ 子命令是什么？
    - ☐ 每个 `-x`、`--xxx` 属于哪个程序？
    - ☐ 哪些内容是输入路径，哪些是输出路径？
    - ☐ 是否含 `<...>`、`[TASK_NAME]`、`runN` 等必须替换的占位符？
    - ☐ 是否依赖之前终端设置过的 `$变量`？
    - ☐ 是否包含 `sudo`、`rm`、`kill`、`chmod`、`chown`、`git reset`？
    - ☐ 是否使用 `>` 或 `-o` 覆盖文件？
    - ☐ 是否会占用GPU、CPU、磁盘或网络？
    - ☐ 是否在共享服务器上影响其他用户或同账号实验？
    - ☐ 是否能先运行只读检查或smoke test？
    - ☐ 命令失败后会停止，还是因为使用 `;` 继续执行？
## 23. 不确定选项时怎么查
大多数命令支持：
```bash
command --help
```
例如：
```bash
find --help
rsync --help
python train.py --help
```
系统手册：
```bash
man find
man rsync
man tmux
```
退出 `man`：
```text
按 q
```

> [!tips] 向AI提问
> 把完整命令、所在机器、预期输入、预期输出和当前目录一起提供。不要只问“`-f`是什么意思”，因为选项必须结合具体命令解释。
