---
name: commit
description: 智能 Git 提交工作流。完整流程：Code Review → 生成 Commit Message → 执行提交。使用 /commit 触发。
---

# Git Commit 智能工作流

完整的 Git 提交工作流，包含代码审查和 commit message 生成。

## 使用方式

- `/commit` - 执行完整的提交流程
- `/commit --no-review` - 跳过 code review

## 完整工作流

```
/commit
  │
  ▼
[Phase 1] Code Review (分析 staged changes)
  │  ├── 必须修改 (Critical)
  │  ├── 建议修改 (Recommended)
  │  └── 影响范围分析
  │
  ▼
[Phase 2] 处理 Review 结果
  │  ├── 有 Critical 问题 → 提示修复，暂停提交
  │  └── 无 Critical 问题 → 继续
  │
  ▼
[Phase 3] 生成 Commit Message
  │  └── 符合项目规范的 commit message
  │
  ▼
[Phase 4] 用户确认
  │
  ▼
[Phase 5] 执行 Git Commit
```

---

## Phase 1: Code Review

### 执行命令

```bash
# 检查 staged changes
git diff --cached --name-status

# 获取变更详情
git diff --cached

# 获取变更统计
git diff --cached --stat
```

### Review 检查项

#### 必须修改 (Critical) - 阻塞提交

| 类型 | 检查内容 |
|------|----------|
| 安全漏洞 | API Key 泄露、敏感信息暴露、权限绕过 |
| 逻辑错误 | 条件判断错误、死循环、未处理 undefined |
| 数据风险 | 数据竞争、Promise 未处理、内存泄漏 |
| API 破坏 | 删除公共接口、修改返回类型、破坏兼容性 |

#### 建议修改 (Recommended) - 不阻塞但强烈建议

| 类型 | 检查内容 |
|------|----------|
| 性能问题 | 不必要的 await、大数组遍历、重复计算 |
| 错误处理 | 缺少 try-catch、未处理边界条件 |
| 代码重复 | 复制粘贴的代码块、可提取的公共逻辑 |
| 可维护性 | 过长函数、复杂条件、魔法数字 |

#### 可选优化 (Optional) - 建议但不强制

| 类型 | 检查内容 |
|------|----------|
| 代码风格 | 命名规范、格式问题、注释缺失 |
| 可读性 | 可以简化的逻辑、可以拆分的函数 |
| 重构机会 | 可以提取的公共方法、可以优化的结构 |

### Review 输出格式

```markdown
## 必须修改 (Critical)

### CR-001: {问题标题}
**文件**: `{file-path}:{line}`
**类型**: {问题类型}
**问题**: {问题描述}
**建议**: {修改建议}

## 建议修改 (Recommended)

### CR-002: {问题标题}
...

## 影响范围

| 模块 | 影响描述 | 风险等级 |
|------|----------|----------|
| {模块} | {描述} | 高/中/低 |
```

---

## Phase 2: 处理 Review 结果

### 有 Critical 问题

```
发现 {n} 个必须修复的问题:

CR-001: {问题标题}
   文件: {file-path}:{line}
   问题: {简述}

建议先修复这些问题再提交。
```

### 无 Critical 问题

```
Code Review 通过

Review 结果:
   必须修改: 0
   建议修改: {n}
   可选优化: {n}

继续生成 commit message...
```

---

## Phase 3: 生成 Commit Message

### Commit 格式规范

```
<type>(<scope>): <subject>

需求: <需求描述 - 必填>
改动:
  - <改动点1>
  - <改动点2>
```

### Type 类型

| Type | 描述 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| refactor | 重构 |
| test | 测试 |
| docs | 文档 |
| chore | 构建/工具 |

### Scope 识别规则

| 文件路径 | Scope |
|----------|-------|
| `src/agent/*` | agent |
| `src/ai/*` | ai |
| `src/onebot/*` | onebot |
| `src/memory/*` | memory |
| `src/pipeline/*` | pipeline |
| `src/config/*` | config |
| `src/logger/*` | logger |
| `src/server/*` | server |
| `.claude/*` | claude |

---

## Phase 4: 用户确认

```
Commit Message:

feat(agent): 添加意图识别节点

需求: 根据用户消息识别意图类型
改动:
  - 添加 intent.ts 节点
  - 定义 Intent 类型
  - 更新 graph.ts 工作流

---
Review 摘要:
   必须修改: 0
   建议修改: 2

确认提交？
  [y] 确认提交
  [n] 取消
  [e] 编辑 message
  [r] 查看 review 详情
```

---

## Phase 5: 执行 Git Commit

```bash
git commit -m "$(cat <<'EOF'
{生成的 commit message}

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## 完整输出示例

```
分析 Staged Changes...

检测到 3 个文件变更:
  M src/agent/nodes/intent.ts (+45/-10)
  A src/agent/nodes/router.ts (+80/0)
  M src/agent/graph.ts (+15/-5)

执行 Code Review...

发现问题:

建议修改 (2):
   CR-001: router 函数过长，建议拆分
   CR-002: 缺少对 unknown intent 的处理

---

生成 Commit Message:

feat(agent): 添加意图识别和路由节点

需求: 识别用户意图并路由到对应执行器
改动:
  - 添加 intent.ts 意图识别节点
  - 添加 router.ts 路由节点
  - 更新 graph.ts 工作流

确认提交？[y/n/e/r]: y

Commit 成功: abc1234

建议运行测试验证:
   pnpm test
   pnpm typecheck
```

---

## 与其他 Skills 的关系

| Skill | 关系 |
|-------|------|
| `/review` | 单独执行 code review |
| `/commit` | 完整工作流：review + commit |
