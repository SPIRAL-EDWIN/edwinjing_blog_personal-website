---
title: "Ubuntu 下 Codex 无法在 VS Code 中打开：TUN 代理问题排查与修复"
description: "记录 Ubuntu 上 Codex VS Code 扩展受 TUN 代理影响时，通过 NO_PROXY、桌面启动项与直连规则进行排查和修复的方法。"
date: 2026-07-15
author: "Chen Jing (经宸)"
category: Experiences
---

# Ubuntu 下 Codex 无法在 VS Code 中打开：TUN 代理问题排查与修复

!!! info "适用范围"

    本文记录的是我在 Ubuntu 环境中的一次具体排查。`NO_PROXY` 测试有效，说明代理配置参与了这次故障；其他看起来相似的 Codex 或 VS Code 问题，仍应结合日志逐项判断。

就本人这次的排查经验而言，**问题高度关联于代理软件的 TUN 模式（虚拟网卡）对本地流量的错误接管**。

- 在这次故障中，Codex 扩展需要访问本机回环地址（如 `127.0.0.1`）上的服务。
- TUN 模式错误接管了本应留在本机的流量，导致本地连接失败。
- 从界面上看，扩展就像是“死机”或“无法访问”。

## 临时解决方案

- 在 Ubuntu 系统层面，强制声明本地流量不走代理。在终端中临时注入环境变量并启动 VS Code：

_（注意：在此之前先完全退出 VS Code。）_

```bash
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="localhost,127.0.0.1,::1"
code
```

---

> 为了以后一劳永逸，不再需要每次都打开终端手动敲命令，同时为你提供一套应对此类“水土不服”问题的方法论，我总结了以下的**永久方案**和**未来排查指南**

## 一. 如何让环境变量“永久生效”

- 既然通过 `export NO_PROXY` 可以解决，我们就需要让系统在每次启动 VS Code 时，自动带上这层“防护罩”。你有两种方式可以实现：

### 方式 1：修改 VS Code 的桌面快捷方式（推荐，针对图形界面启动）

> 如果你平时习惯点击 Ubuntu 左侧任务栏（Dock）或应用列表里的图标来启动 VS Code，你需要修改它的 `.desktop` 启动文件，因为图形界面启动通常不会加载终端的环境变量

1. 打开终端，复制系统级的 VS Code 快捷方式到你的个人用户目录下（防止系统更新被覆盖）：

```bash
cp /usr/share/applications/code.desktop ~/.local/share/applications/
```

2. 使用 `nano` 或 `vim` 编辑这个文件：

```bash
nano ~/.local/share/applications/code.desktop
```

3. 找到以 `Exec=` 开头的那一行（通常是 `Exec=/usr/share/code/code --unity-launch %F`）
4. 在等号后面、`/usr/share` 前面，**插入你的环境变量**，修改为：

```ini
Exec=env NO_PROXY="localhost,127.0.0.1,::1" no_proxy="localhost,127.0.0.1,::1" /usr/share/code/code --unity-launch %F
```

5. 保存退出（在 nano 中按 `Ctrl+O` 回车保存，`Ctrl+X` 退出）。之后你每次点击图标，VS Code 都会自动绕过代理读取本地服务了

### 方式 2：写入终端配置文件（针对命令行启动）

如果你习惯在终端里敲 `code .` 来打开项目：

1. 编辑你的 bash 配置文件：

```bash
nano ~/.bashrc
```

2. 在文件最末尾另起一行，加入这段全局声明：

```bash
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="localhost,127.0.0.1,::1"
```

3. 保存退出，并执行 `source ~/.bashrc` 使其立即生效。

## 二. 如何从代理工具底层“根治”问题

> 环境变量只是让 VS Code 这一款软件绕过了代理
> 为了防止以后你在 Ubuntu 上运行其他依赖本地通信的开发工具（如 Docker 容器、本地数据库、其他的本地大模型工具）重蹈覆辙，最根本的方法是**去修改你代理软件（如 Clash、V2ray、NekoBox 等）的 TUN 模式底层路由规则**

- 请在你的代理客户端设置或配置文件中，确保包含以下**直连（DIRECT）/ 绕过（Bypass）规则**：
  - **IP-CIDR 规则**：添加 `127.0.0.0/8` 和本地局域网段（如 `192.168.0.0/16`）设为 `DIRECT`
  - **DOMAIN 规则**：添加 `localhost` 设为 `DIRECT`
- 如果你使用的是类似 Clash 的 YAML 配置文件，在 `rules:` 列表的最前面，应该要有这两行：

```yaml
- DOMAIN,localhost,DIRECT
- IP-CIDR,127.0.0.0/8,DIRECT
```

这样设置后，TUN 虚拟网卡在抓取流量时，只要看到是发往本地的流量，就会立刻放行，再也不会发生“大水冲了龙王庙”的惨剧

## 三. 未来遇到 Linux 插件网络问题的排查法

- 可以直接套用这套逻辑：

1. **第一步：做“变量控制测试”（网络隔离）**

    不要急着重装软件。第一时间**彻底关闭**你的代理工具和 TUN 模式。如果关闭代理后插件恢复工作（或者给出了明确的网络超时而非拒绝访问的报错），应优先排查路由劫持、证书劫持或端口冲突。

2. **第二步：进行“环境变量注入”验证**

    就像我们这次做的一样，不要一开始就去改复杂的系统配置文件。利用终端临时的 `export` 命令注入 `NO_PROXY`；如果注入后能跑通，就能进一步缩小问题范围，再决定是否写入永久配置。**不建议通过 `NODE_TLS_REJECT_UNAUTHORIZED=0` 禁用 TLS 证书验证**，因为这会降低连接安全性。

3. **第三步：如果不是网络，就看“日志和权限”**

    如果网络排查完毕依然不行，利用 `Ctrl + Shift + P` 调出 VS Code 的 `Developer: Show Logs...` -> `Extension Host`，结合我们上一轮提到的权限问题，查看是不是报了 `EACCES`（权限被拒）或文件属主问题，对症下药
