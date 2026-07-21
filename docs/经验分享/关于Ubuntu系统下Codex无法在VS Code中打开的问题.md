---
title: "Ubuntu 下 Codex 无法在 VS Code 中打开：TUN 代理问题排查与修复"
description: "记录 Ubuntu 上 Codex VS Code 扩展受 TUN 回环路由和代理环境变量冲突影响时，通过纯净环境、NO_PROXY、桌面启动项与直连规则进行排查和修复的方法。"
date: 2026-07-15
author: "Chen Jing (经宸)"
category: Experiences
---

# Ubuntu 下 Codex 无法在 VS Code 中打开：TUN 代理问题排查与修复

!!! info "适用范围"

    本文记录的是我在 Ubuntu 环境中的一次具体排查。`NO_PROXY`、清理代理环境变量等对照测试能够让 Codex 扩展恢复，说明代理配置参与了这次故障；其他看起来相似的 Codex 或 VS Code 问题，仍应结合日志逐项判断。

就本人这次的排查经验而言，问题可能涉及两种机制，而且二者也可能同时出现：

1. 代理软件的 TUN 模式（虚拟网卡）错误接管了本地回环流量。
2. `http_proxy` 等应用层环境变量与 TUN 的网络层代理叠加，形成“双重代理”冲突。

它们都可能表现为 Codex 扩展一直加载、界面像“死机”，或终端启动 VS Code 正常但点击桌面图标启动失败。下面先通过对照测试区分故障路径，再选择对应的修复方式。

## 先做一轮最小化排查

开始前，请先彻底退出所有 VS Code 窗口和后台进程，避免旧进程继续沿用原来的环境变量。

### 1. 检查当前代理环境变量

```bash
env | grep -i proxy
```

重点查看 `http_proxy`、`https_proxy`、`all_proxy` 及其大写版本。如果它们仍指向本机代理端口，即使代理软件界面显示“系统代理已关闭”，VS Code 仍可能继承这些变量。

### 2. 用纯净环境启动 VS Code

在当前终端临时清理代理变量，然后启动 VS Code：

```bash
unset http_proxy https_proxy all_proxy
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY
code
```

`unset` 只影响当前终端会话。如果此时 Codex 恢复，说明应用层代理变量很可能参与了故障，但仍需要继续检查这些变量来自 shell 配置、系统环境还是桌面会话缓存。

### 3. 分别测试系统代理与 TUN

保持其他条件不变，依次比较以下状态：

1. 关闭代理工具的 **System Proxy（系统代理）**，仅保留 TUN。
2. 再完全关闭 TUN 和代理工具。
3. 每次切换后都彻底退出并重新启动 VS Code。

如果只有关闭 TUN 后恢复，应优先检查回环路由、TUN 直连规则、DNS 劫持和端口冲突。如果清理环境变量后恢复，而 TUN 单独开启时仍能工作，则更像是应用层代理与 TUN 叠加造成的问题。这些现象是排查线索，不宜仅凭一次测试就下 100% 的结论。

## 原因一：TUN 可能接管了本地回环流量

Codex 扩展及 VS Code 的相关进程可能需要访问本机回环地址，例如 `127.0.0.1` 或 `::1`。如果 TUN 将本应留在本机的数据包错误转发到远端代理，本地连接就可能失败，从界面上看便像扩展“无法打开”。

### 临时方案：为回环地址设置 `NO_PROXY`

```bash
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="localhost,127.0.0.1,::1"
code
```

如果这样启动能够恢复，可以进一步检查 `NO_PROXY` 的持久化方式和 TUN 的直连规则。

### 持久方案一：修改用户级桌面启动项

如果平时通过 Ubuntu Dock 或应用列表启动 VS Code，图形界面进程通常不会读取刚刚修改的 shell 环境。推荐先把系统启动项复制到用户目录，再修改用户副本；不建议直接编辑 `/usr/share/applications/` 下的系统文件，因为软件更新可能覆盖它，而且修改系统文件需要额外权限。

1. 创建用户级应用目录并复制启动项：

    ```bash
    mkdir -p ~/.local/share/applications
    cp /usr/share/applications/code.desktop ~/.local/share/applications/code.desktop
    ```

2. 编辑用户副本：

    ```bash
    nano ~/.local/share/applications/code.desktop
    ```

3. 找到用于正常启动 VS Code 的 `Exec=` 行，在实际可执行文件前加入环境变量。例如：

    ```ini
    Exec=env NO_PROXY=localhost,127.0.0.1,::1 no_proxy=localhost,127.0.0.1,::1 /usr/share/code/code --unity-launch %F
    ```

    不同安装方式的可执行文件路径和原有参数可能不同，应以当前 `code.desktop` 的内容为准，只在其前面加入 `env ...`，不要盲目覆盖整行。文件中如果有多个应用动作，也要确认自己实际使用的是哪一条 `Exec=`。

4. 保存后，彻底退出 VS Code，再从图标重新启动测试。

### 持久方案二：写入 shell 配置

如果习惯在终端中使用 `code .`，可以把以下内容加入当前 shell 的配置文件。例如 Bash 使用 `~/.bashrc`，Zsh 使用 `~/.zshrc`：

```bash
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="localhost,127.0.0.1,::1"
```

随后重新打开终端，或对相应文件执行 `source`。这只保证从该 shell 启动的进程继承变量，不一定影响桌面图标启动的 VS Code。

### 从代理规则中绕过本地地址

更底层的做法是在代理客户端中为回环地址配置 **DIRECT / Bypass** 规则。以 Clash 风格的规则为例：

```yaml
- DOMAIN,localhost,DIRECT
- IP-CIDR,127.0.0.0/8,DIRECT
```

如果确有局域网直连需求，也可以按自己的实际网段添加规则，例如 `192.168.0.0/16`。不要机械照搬与本地网络不匹配的网段；不同代理内核的规则语法和优先级也可能不同，应以所用客户端的文档为准。

## 原因二：环境变量代理与 TUN 形成双重代理

另一种可能是系统同时开启了两层代理：

- TUN 在网络层全局接管流量。
- `http_proxy`、`https_proxy` 或 `all_proxy` 又在应用层要求 VS Code / Node.js 将流量发送到本机代理端口。

流量经过两套路径后，可能出现重复转发、DNS 解析异常或内部请求失败。Ubuntu 的桌面会话还可能在登录时继承环境变量，因此会出现“终端输入 `code` 能用，双击图标却不能用”的割裂现象。

### 1. 只保留所需的一层代理

如果决定使用 TUN 统一接管流量，可以先做以下对照配置：

1. 在代理客户端中关闭 **System Proxy**，仅保持 **TUN Mode** 开启。
2. 在 Ubuntu 的“设置 → 网络 → 网络代理”中关闭系统网络代理。
3. 用 `env | grep -i proxy` 确认是否仍有应用层变量残留。

这并不是所有网络环境都适用的固定答案。如果某些命令行工具明确依赖 `http_proxy`，删除变量会影响它们联网，应先记录原值并按需恢复。

### 2. 查找代理变量的来源

优先检查用户级配置：

```bash
grep -in proxy ~/.bashrc ~/.zshrc ~/.profile 2>/dev/null
```

如有必要，再谨慎检查系统级环境文件：

```bash
grep -in proxy /etc/environment 2>/dev/null
```

如果发现自己以前添加的 `export http_proxy=...`、`export ALL_PROXY=...` 等内容，可以先备份文件，再注释或删除相应行。不要在未确认来源和用途时批量删除所有包含 `proxy` 的配置。

### 3. 刷新桌面会话缓存

修改系统或登录环境后，注销当前用户并重新登录，必要时重启系统。这样可以让 GNOME 桌面会话重新读取环境，避免图标启动的 VS Code 继续继承旧变量。

### 4. 按需测试 `--no-proxy-server` 与 IPv4

如果终端启动正常、桌面图标仍失败，可以在前述用户级 `code.desktop` 副本中，按需测试禁用 Chromium 内置代理或优先 IPv4：

```ini
Exec=env NODE_OPTIONS=--dns-result-order=ipv4first /usr/share/code/code --no-proxy-server --unity-launch %F
```

这两个参数更适合用来缩小问题范围，不是通用修复：

- `--no-proxy-server` 可能使原本必须经过显式代理的外部请求无法访问。
- `ipv4first` 只有在 IPv6 回环或解析顺序确实参与故障时才可能有帮助。

测试时仍应保留原始 `Exec=` 内容的备份，并以实际安装路径为准。确认无效后应撤销参数，避免留下难以解释的长期配置。

### 5. 谨慎调整 TUN 与 DNS 选项

某些代理客户端还提供 **Strict Route**、**DNS Hijack** 等设置。在确认日志指向路由或 DNS 问题后，可以参考当前客户端和代理内核的文档进行对照测试。类似 `any:53` 的 DNS 劫持配置会改变系统 DNS 流量路径，不应在不了解影响时直接作为固定答案套用。

## 一套可复用的排查顺序

以后再遇到 Linux 下的 VS Code 扩展网络问题，可以按以下顺序逐层缩小范围：

1. **比较终端与图形界面启动。** 使用 `env | grep -i proxy` 查看残留变量，再从清理变量后的终端启动 VS Code。如果只有桌面图标失败，重点检查 GNOME 会话缓存和用户级 `.desktop` 文件。
2. **隔离 System Proxy 与 TUN。** 分别关闭系统代理、TUN 和整个代理客户端，每次都重启 VS Code，记录哪个变量改变了结果。
3. **验证回环绕过。** 临时设置 `NO_PROXY=localhost,127.0.0.1,::1`。若有效，再决定写入用户启动项、shell 配置，还是修正代理客户端的 DIRECT 规则。
4. **按需测试启动参数。** `--no-proxy-server` 或 `NODE_OPTIONS="--dns-result-order=ipv4first"` 只应作为对照测试，确认与现象相关后再考虑保留。
5. **查看日志和权限。** 在 VS Code 中使用 `Ctrl+Shift+P`，打开 `Developer: Show Logs...` → `Extension Host`，检查网络错误、DNS、端口、证书，以及 `EACCES` 等权限或文件属主问题。

!!! warning "不要通过关闭 TLS 验证来修复"

    不建议设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。它会禁用 Node.js 的 TLS 证书验证，使 HTTPS 连接失去重要的身份校验，并不能安全地证明问题来自代理。如果此前为了测试设置过该变量，应将其清除，并转而根据日志检查证书链、代理证书或系统信任配置。

最后，单个对照测试只能说明某项配置与故障相关。将环境变量、TUN 状态、启动方式和 Extension Host 日志放在一起比较，才能更可靠地判断是回环路由被接管、双重代理冲突，还是另一个看起来相似的问题。
