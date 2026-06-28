# VS Code 编写个人网站（MkDocs）详细教程

这份教程针对当前项目结构与环境，目标是让你完全在 VS Code 内完成编辑、预览与构建，无需再切换到外部命令行工具。

---

## 1. .vscode 自动配置的作用

已为你生成 .vscode 配置，作用如下：

- 自动绑定项目内的 Python 虚拟环境（.venv）。
- 统一任务入口，一键启动本地预览与构建。
- 减少重复操作，让 VS Code 成为唯一工作入口。

配置文件：
- [.vscode/settings.json](.vscode/settings.json)
- [.vscode/tasks.json](.vscode/tasks.json)

---

## 2. 启动与基本工作流

### 步骤 1：打开工作区

在 VS Code 中打开项目文件夹（当前目录）。

### 步骤 2：确认 Python 解释器

按下 Ctrl+Shift+P → 输入 Python: Select Interpreter → 选择 .venv 解释器。

### 步骤 3：启动本地预览（推荐方式）

按下 Ctrl+Shift+P → 输入 Tasks: Run Task → 选择 MkDocs: Serve。

然后浏览器访问：

- http://127.0.0.1:8000

> 若需要停止服务，可在终端中按 Ctrl+C。

### 步骤 4：构建静态站点

按下 Ctrl+Shift+P → 输入 Tasks: Run Task → 选择 MkDocs: Build。

构建结果输出到 site/ 文件夹。

---

## 3. 项目结构速览

你的主要内容入口位于：

- 首页： [docs/index.md](docs/index.md)
- 全站配置： [mkdocs.yml](mkdocs.yml)
- 自定义样式： [docs/stylesheets/extra.css](docs/stylesheets/extra.css)
- 数学公式配置： [docs/javascripts/mathjax.js](docs/javascripts/mathjax.js)

---

## 4. 常见操作示例

### 4.1 新增页面

1) 在 docs/ 下创建一个新的 Markdown 文件，例如：docs/notes/new-note.md
2) 在 [mkdocs.yml](mkdocs.yml) 的 nav 中添加路径。

示例结构（仅说明格式）：

- Notes:
    - notes/new-note.md

### 4.2 修改导航顺序

直接在 [mkdocs.yml](mkdocs.yml) 的 nav 节点调整顺序即可。

### 4.3 修改首页内容

首页文案位于 [docs/index.md](docs/index.md)。

### 4.4 调整主题配色

自定义主题色位于 [docs/stylesheets/extra.css](docs/stylesheets/extra.css)。

---

## 5. VS Code 的可视化功能推荐

### 5.1 Markdown 预览

右键 Markdown 文件 → 选择“打开预览”。

### 5.2 文件树可视化管理

在资源管理器中直接拖拽和重命名文件，会同步影响网站结构。

### 5.3 Git 可视化提交

左侧 Git 图标可直接查看改动、写提交信息并推送。

---

## 6. 常见问题排查

### Q1：启动本地预览报错？

确认：
- 已选择 .venv 解释器
- 依赖安装完成（mkdocs, mkdocs-material, mkdocs-glightbox, jieba 等）

### Q2：页面样式没有变化？

刷新浏览器缓存，或清理输出：

- 删除 site/ 目录后重新构建

---

## 7. 建议的编辑习惯

- 每次写完一页就预览
- 小步提交，便于回退
- 重构导航时同步重命名文件

---

## 8. GitHub Actions 自动部署（一键发布）

已配置 GitHub Actions，实现 **推送代码后自动构建并发布网站**。

配置文件位置：[.github/workflows/deploy.yml](.github/workflows/deploy.yml)

### 工作原理

```
本地修改 → git push → GitHub 自动构建 → 网站更新
```

### 使用方法

#### 方式一：VS Code 可视化操作

1. 左侧点击 **源代码管理** 图标（或按 Ctrl+Shift+G）
2. 在更改列表中点击 **+** 暂存所有更改
3. 输入提交信息，点击 **✓ 提交**
4. 点击 **同步更改**（或点击 ... → 推送）
5. 等待 1-2 分钟，网站自动更新

#### 方式二：终端命令

```bash
git add .
git commit -m "更新内容"
git push
```

### 查看部署状态

1. 打开 GitHub 仓库页面
2. 点击 **Actions** 标签页
3. 查看最新的工作流运行状态
   - ✅ 绿色：部署成功
   - ❌ 红色：部署失败，点击查看错误日志

### 首次配置 GitHub Pages

如果你还没有开启 GitHub Pages，需要在仓库设置中配置：

1. 打开 GitHub 仓库 → **Settings**
2. 左侧菜单选择 **Pages**
3. Source 选择 **Deploy from a branch**
4. Branch 选择 **gh-pages** / **(root)**
5. 点击 **Save**

配置完成后，网站地址为：`https://你的用户名.github.io/仓库名/`

或者你已配置的自定义域名：`https://edwinjing-blog.com/`

---

## 9. Skills 技能体（AI 辅助设计）

已为你配置 `.skills/` 文件夹，存放 AI 技能指南，帮助优化网页设计。

### 什么是 Skills？

Skills 是 Anthropic 提供的结构化提示词，用于指导 AI 完成特定任务。当你需要优化网页时，可以参考这些技能文件中的设计原则。

### 已安装的技能

| 技能名称 | 用途 | 文件位置 |
|----------|------|----------|
| frontend-design | 前端界面设计指南 | [.skills/frontend-design/SKILL.md](.skills/frontend-design/SKILL.md) |

### frontend-design 技能核心要点

#### 设计思维流程
1. **明确目的**：界面要解决什么问题？用户是谁？
2. **选择风格**：极简主义、复古未来、奢华精致、有机自然、工业实用等
3. **突出差异**：什么会让人过目不忘？

#### 美学指南
- **字体**：避免 Arial、Inter 等通用字体，选择有个性的字体
- **配色**：主色调 + 强调色，避免平均分配
- **动效**：页面加载动画、hover 状态、滚动触发
- **布局**：非对称、重叠、对角线流动、打破网格

#### 禁止事项
- ❌ 紫色渐变配白色背景（典型 AI 风格）
- ❌ Inter、Roboto、Arial 等通用字体
- ❌ 千篇一律的卡片式布局

### 如何使用

当你需要优化网页设计时，可以：

1. 打开 [.skills/frontend-design/SKILL.md](.skills/frontend-design/SKILL.md) 查看设计原则
2. 在与 AI 对话时，引用其中的指南
3. 例如："请参考 frontend-design 技能，帮我优化首页的视觉效果"

---

## 10. 完整工作流总结

| 步骤 | 操作 | 快捷方式 |
|------|------|----------|
| 1. 编辑内容 | 修改 docs/ 下的 Markdown 文件 | 直接编辑 |
| 2. 本地预览 | 运行 MkDocs: Serve 任务 | Ctrl+Shift+P → Tasks |
| 3. 提交更改 | Git 面板提交 | Ctrl+Shift+G |
| 4. 推送发布 | 点击同步/推送 | 自动触发部署 |
| 5. 查看结果 | 访问网站 | 等待 1-2 分钟 |

---

## 11. 项目文件结构总览

```
my-digital-garden/
├── .github/workflows/     # GitHub Actions 自动部署
│   └── deploy.yml
├── .skills/               # AI 技能体（设计指南）
│   └── frontend-design/
├── .venv/                 # Python 虚拟环境
├── .vscode/               # VS Code 配置
│   ├── settings.json
│   └── tasks.json
├── docs/                  # 网站内容源文件
│   ├── index.md           # 首页
│   ├── stylesheets/       # 自定义样式
│   └── javascripts/       # 自定义脚本
├── site/                  # 构建输出（自动生成）
└── mkdocs.yml             # 网站配置
```

---

如有其他需求（主题美化、博客优化、新增页面等），随时告诉我。
