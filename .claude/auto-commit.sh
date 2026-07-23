#!/bin/bash
# คอมมิตอัตโนมัติเมื่อ Claude ทำงานจบแต่ละรอบ (Stop hook)
# - คอมมิตเฉพาะเครื่องนี้ ไม่ push (push = deploy ขึ้นเว็บจริง ต้องสั่งเอง)
# - ข้ามไฟล์ชั่วคราว/ไฟล์ตั้งค่าส่วนตัว
set -u

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# กำลัง merge / rebase / cherry-pick อยู่ → อย่าไปยุ่ง
GITDIR=$(git rev-parse --git-dir)
for f in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD BISECT_LOG; do
  [ -e "$GITDIR/$f" ] && exit 0
done

EXCLUDE=(':!scripts/_debug_roundtrip.mjs' ':!.claude/settings.local.json')
git add -A -- . "${EXCLUDE[@]}" 2>/dev/null

git diff --cached --quiet && exit 0

FILES=$(git diff --cached --name-only | wc -l | tr -d ' ')
STAMP=$(date '+%d/%m %H:%M')
git commit -q -m "auto: บันทึกงาน $STAMP ($FILES ไฟล์)" \
  -m "คอมมิตอัตโนมัติโดย Claude Code (Stop hook)" >/dev/null 2>&1 || exit 0

SHA=$(git rev-parse --short HEAD)
printf '{"systemMessage":"💾 คอมมิตอัตโนมัติ %s — %s ไฟล์ (ยังไม่ push)"}\n' "$SHA" "$FILES"
