#!/bin/bash

# Post-commit analysis hook
# 检测 git commit 命令并显示提交信息

# 读取 stdin 的 JSON 输入
INPUT=$(cat)

# 提取 command
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/"command"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# 检测是否是 git commit 命令
if echo "$COMMAND" | grep -qE 'git commit'; then
  # 获取分支名
  BRANCH_NAME=$(git symbolic-ref --short HEAD 2>/dev/null)

  # 跳过主分支
  if [ "$BRANCH_NAME" = "main" ] || [ "$BRANCH_NAME" = "master" ]; then
    exit 0
  fi

  # 获取最近的 commit 信息
  LAST_COMMIT_HASH=$(git log -1 --pretty=format:"%h" 2>/dev/null)
  LAST_COMMIT_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null)
  LAST_COMMIT_FILES=$(git diff-tree --no-commit-id --name-status -r HEAD 2>/dev/null | head -15)

  # 统计变更文件数量
  FILE_COUNT=$(echo "$LAST_COMMIT_FILES" | grep -c "^[AMD]" 2>/dev/null || echo "0")

  # 检查是否有业务代码变更
  HAS_SRC_CHANGES=$(echo "$LAST_COMMIT_FILES" | grep -E "^[AMD]\s+src/" | head -1)

  if [ -n "$LAST_COMMIT_FILES" ]; then
    # 构建变更文件列表
    FORMATTED_FILES=""
    while IFS= read -r line; do
      if [ -n "$line" ]; then
        STATUS=$(echo "$line" | cut -f1)
        FILE=$(echo "$line" | cut -f2)
        case "$STATUS" in
          A) FORMATTED_FILES="$FORMATTED_FILES\n  + $FILE (new)" ;;
          M) FORMATTED_FILES="$FORMATTED_FILES\n  ~ $FILE (modified)" ;;
          D) FORMATTED_FILES="$FORMATTED_FILES\n  - $FILE (deleted)" ;;
          *) FORMATTED_FILES="$FORMATTED_FILES\n  ? $FILE" ;;
        esac
      fi
    done <<< "$LAST_COMMIT_FILES"

    # 构建提示信息
    if [ -n "$HAS_SRC_CHANGES" ]; then
      SUGGESTION="Run 'pnpm test' and 'pnpm typecheck' to verify changes"
    else
      SUGGESTION="No src changes detected"
    fi

    # 输出 JSON 格式的额外上下文
    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Commit success!\n\nBranch: $BRANCH_NAME\nCommit: $LAST_COMMIT_HASH - $LAST_COMMIT_MSG\nChanged files ($FILE_COUNT):$FORMATTED_FILES\n\n$SUGGESTION"
  }
}
EOF
  fi
fi

exit 0
