---
name: review
description: 代码审查 skill。分析 commit 变更，生成结构化的 review 报告，包含必须修改、建议修改、影响范围。报告保存到 e2e/{branch}/{commit-hash}.md，可用于测试用例生成。在 /commit 流程中自动触发，或手动调用 /review。
---

# 代码审查 Skill

分析 git commit 变更，生成结构化的 Code Review 报告。

## 使用方式

- `/review` - 审查最近一次 commit
- `/review <commit-hash>` - 审查指定 commit
- `/review --staged` - 审查暂存区变更（commit 前）
- `/review --diff <base>..<head>` - 审查两个 commit 之间的差异

## 输出文件

```
e2e/{branch-name}/
├── {commit-hash}.md      # Review 报告
├── test-cases.md         # 测试用例文档
└── *.spec.ts             # E2E 测试代码
```

---

## Review 报告结构

### 文件格式: `{commit-hash}.md`

```markdown
# Code Review Report

**Commit**: {commit-hash}
**Subject**: {commit-subject}
**Author**: {author}
**Date**: {date}
**Branch**: {branch-name}

---

## 概述

{变更概述，1-2 句话描述本次变更的目的和范围}

---

## 变更文件

| 文件 | 状态 | 变更行数 | 风险等级 |
|------|------|----------|----------|
| {file-path} | 新增/修改/删除 | +{add}/-{del} | 高/中/低 |

---

## 🔴 必须修改 (Critical)

必须在合并前修复的问题。

### CR-001: {问题标题}

**文件**: `{file-path}:{line}`
**类型**: 安全漏洞 / 逻辑错误 / 数据丢失风险 / 性能严重问题

**问题描述**:
{详细描述问题}

**当前代码**:
```{lang}
{问题代码片段}
```

**建议修改**:
```{lang}
{修复后的代码}
```

**影响范围**:
- {影响点1}
- {影响点2}

---

## 🟡 建议修改 (Recommended)

建议修改但不阻塞合并的问题。

### CR-002: {问题标题}

**文件**: `{file-path}:{line}`
**类型**: 代码规范 / 可维护性 / 性能优化 / 最佳实践

**问题描述**:
{详细描述问题}

**当前代码**:
```{lang}
{问题代码片段}
```

**建议修改**:
```{lang}
{优化后的代码}
```

**收益**:
- {收益点1}
- {收益点2}

---

## 🟢 可选优化 (Optional)

可以考虑的优化点，不影响功能。

### CR-003: {优化建议}

**文件**: `{file-path}:{line}`
**类型**: 代码风格 / 可读性 / 文档 / 重构机会

**建议**: {简短描述}

---

## 影响范围分析

### 直接影响

| 模块 | 影响描述 | 风险等级 |
|------|----------|----------|
| {模块名} | {影响描述} | 高/中/低 |

### 间接影响

| 依赖模块 | 依赖关系 | 潜在影响 |
|----------|----------|----------|
| {模块名} | 调用方/被调用方 | {潜在影响} |

### 回归测试建议

基于影响范围，建议进行以下测试：
- [ ] {测试项1}
- [ ] {测试项2}
- [ ] {测试项3}

---

## 测试用例建议

基于本次变更，建议添加以下测试用例：

### 功能测试

| 用例ID | 场景 | 步骤 | 预期结果 | 优先级 |
|--------|------|------|----------|--------|
| TC-{hash}-001 | {场景} | {步骤} | {预期} | P0/P1/P2 |

### E2E 测试

| 用例ID | 路径 | 操作流程 | 预期结果 | 优先级 |
|--------|------|----------|----------|--------|
| E2E-{hash}-001 | /{path} | {操作} | {预期} | P0/P1/P2 |

---

## 总结

| 类别 | 数量 |
|------|------|
| 🔴 必须修改 | {count} |
| 🟡 建议修改 | {count} |
| 🟢 可选优化 | {count} |
| 影响模块 | {count} |
| 建议测试用例 | {count} |

**审查结论**: ✅ 可以合并 / ⚠️ 需修改后合并 / ❌ 需重新设计
```

---

## 审查规则

### 🔴 必须修改 (Critical) - 阻塞合并

| 类型 | 描述 | 示例 |
|------|------|------|
| **安全漏洞** | 可能导致安全问题 | SQL 注入、XSS、敏感信息泄露 |
| **逻辑错误** | 功能无法正常工作 | 条件判断错误、死循环、空指针 |
| **数据风险** | 可能导致数据丢失或损坏 | 未处理事务、竞态条件 |
| **API 破坏** | 破坏现有 API 契约 | 删除公共方法、修改返回类型 |

### 🟡 建议修改 (Recommended) - 不阻塞但强烈建议

| 类型 | 描述 | 示例 |
|------|------|------|
| **性能问题** | 明显的性能问题 | N+1 查询、大数组遍历 |
| **错误处理** | 缺少必要的错误处理 | 未捕获异常、未处理边界 |
| **代码重复** | 明显的代码重复 | 复制粘贴的代码块 |
| **可维护性** | 影响代码可维护性 | 过长函数、复杂条件 |

### 🟢 可选优化 (Optional) - 建议但不强制

| 类型 | 描述 | 示例 |
|------|------|------|
| **代码风格** | 不符合代码规范 | 命名不规范、格式问题 |
| **可读性** | 可以提高可读性 | 添加注释、拆分函数 |
| **重构机会** | 可以重构优化 | 提取公共方法 |

---

## 执行步骤

### Step 1: 获取变更信息

```bash
# 获取 commit 信息
git log -1 --pretty=format:"%H|%s|%an|%ad" {commit-hash}

# 获取变更文件
git diff-tree --no-commit-id --name-status -r {commit-hash}

# 获取变更统计
git show --stat {commit-hash}

# 获取具体变更内容
git show {commit-hash}
```

### Step 2: 分析代码变更

对每个变更文件：

1. **读取变更内容**
```bash
git show {commit-hash} -- {file-path}
```

2. **识别变更类型**
   - 新增代码：检查逻辑完整性、错误处理
   - 修改代码：检查是否破坏现有功能
   - 删除代码：检查是否有依赖

3. **检查项目**
   - 安全性：注入攻击、敏感信息
   - 正确性：逻辑错误、边界条件
   - 性能：复杂度、资源使用
   - 可维护性：代码结构、命名
   - 兼容性：API 变更、依赖变更

### Step 3: 分析影响范围

```bash
# 查找引用该文件的其他文件
grep -r "import.*{module}" src/

# 查找调用变更函数的地方
grep -r "{function-name}" src/
```

影响分析维度：
- **直接影响**：修改的文件本身
- **调用方影响**：调用修改代码的模块
- **被调用方影响**：被修改代码调用的模块
- **UI 影响**：前端组件变更影响的页面
- **API 影响**：API 变更影响的客户端

### Step 4: 生成报告

1. 创建 review 报告文件：
```bash
BRANCH_NAME=$(git symbolic-ref --short HEAD | sed 's/\//-/g')
COMMIT_HASH=$(git log -1 --pretty=format:"%h")
REPORT_FILE="e2e/$BRANCH_NAME/$COMMIT_HASH.md"
```

2. 按模板填充内容

3. 生成测试用例建议（供 /gen-test 使用）

---

## 与其他 Skills 集成

### 与 /commit 集成

```
/commit
  ↓
1. 分析 staged changes
  ↓
2. 运行 /review --staged (生成 review 报告)
  ↓
3. 如果有 Critical 问题，提示修复
  ↓
4. 生成 commit message
  ↓
5. 执行 commit
  ↓
6. 运行 /gen-test (使用 review 报告生成测试用例)
```

### 与 /gen-test 集成

Review 报告中的 "测试用例建议" 部分可以直接被 /gen-test 使用：

```
/gen-test
  ↓
1. 读取 e2e/{branch}/{commit-hash}.md
  ↓
2. 提取 "测试用例建议" 部分
  ↓
3. 结合代码分析生成完整测试
  ↓
4. 更新 e2e/{branch}/test-cases.md
  ↓
5. 生成 e2e/{branch}/*.spec.ts
```

---

## 检查清单

### 安全检查

- [ ] SQL 注入风险
- [ ] XSS 攻击风险
- [ ] CSRF 防护
- [ ] 敏感信息泄露（API key、密码）
- [ ] 权限验证完整性
- [ ] 输入验证

### 逻辑检查

- [ ] 边界条件处理
- [ ] 空值/undefined 处理
- [ ] 错误处理和异常捕获
- [ ] 条件分支完整性
- [ ] 循环终止条件

### 性能检查

- [ ] N+1 查询问题
- [ ] 大数据量处理
- [ ] 内存泄漏风险
- [ ] 不必要的重渲染
- [ ] 资源释放

### 代码质量

- [ ] 函数长度 (<50 行)
- [ ] 圈复杂度 (<10)
- [ ] 代码重复
- [ ] 命名规范
- [ ] 注释完整性

---

## 示例输出

```markdown
# Code Review Report

**Commit**: abc1234
**Subject**: feat(chat): 添加消息撤回功能
**Author**: developer
**Date**: 2024-01-05
**Branch**: feat/chat-revoke

---

## 概述

本次提交实现了消息撤回功能，包括前端 UI、API 调用和状态管理。

---

## 变更文件

| 文件 | 状态 | 变更行数 | 风险等级 |
|------|------|----------|----------|
| src/components/chat/message-item.tsx | 修改 | +45/-10 | 中 |
| src/components/chat/context-menu.tsx | 新增 | +120/0 | 低 |
| src/services/chat.ts | 修改 | +25/-5 | 中 |
| src/store/chat-store.ts | 修改 | +30/-0 | 中 |

---

## 🔴 必须修改 (Critical)

### CR-001: 消息撤回缺少权限验证

**文件**: `src/services/chat.ts:45`
**类型**: 安全漏洞

**问题描述**:
撤回 API 调用未验证消息所有权，任何用户可以撤回他人消息。

**当前代码**:
```typescript
async function revokeMessage(messageId: string) {
  return api.post(`/messages/${messageId}/revoke`);
}
```

**建议修改**:
```typescript
async function revokeMessage(messageId: string, userId: string) {
  // 前端先验证
  const message = getMessageById(messageId);
  if (message.senderId !== userId) {
    throw new Error('无权撤回他人消息');
  }
  return api.post(`/messages/${messageId}/revoke`);
}
```

**影响范围**:
- 用户可能撤回他人消息
- 后端应同时添加权限验证

---

## 🟡 建议修改 (Recommended)

### CR-002: 撤回时间限制未在前端实现

**文件**: `src/components/chat/context-menu.tsx:35`
**类型**: 用户体验

**问题描述**:
虽然后端有 2 分钟撤回限制，但前端未禁用超时消息的撤回按钮。

**建议修改**:
```typescript
const canRevoke = useMemo(() => {
  const twoMinutes = 2 * 60 * 1000;
  return Date.now() - message.createdAt < twoMinutes;
}, [message.createdAt]);
```

---

## 影响范围分析

### 直接影响

| 模块 | 影响描述 | 风险等级 |
|------|----------|----------|
| 消息列表 | 需要处理撤回状态显示 | 中 |
| 消息详情 | 需要显示"已撤回"提示 | 低 |

### 回归测试建议

- [ ] 发送消息功能正常
- [ ] 消息列表显示正常
- [ ] 撤回成功后 UI 更新
- [ ] 超时撤回被拒绝

---

## 总结

| 类别 | 数量 |
|------|------|
| 🔴 必须修改 | 1 |
| 🟡 建议修改 | 1 |
| 🟢 可选优化 | 0 |

**审查结论**: ⚠️ 需修改后合并（修复 CR-001 权限问题）
```
