#!/usr/bin/env bash
# 只重新部署 4 个 AI 云函数（含 TokenHub 密钥同步），比全量部署快
# 改了 common.js / Prompt / 换 Key 之后跑这个即可
# 写操作需开发者工具弹框确认，故「先全部提交、再统一轮询」，避免串行等确认超时
CLI="/c/Program Files (x86)/Tencent/微信web开发者工具/wechatide.cmd"
APPID="wx4123c75f472af62d"
ENV="cloud1-d6get99l6f8cb27d7"
ROOT="E:\\AI宿造局\\miniprogram\\cloudfunctions"

node "E:/AI宿造局/tools/sync-ai-env.js" || exit 1
NAMES="aiPost aiMutual aiUpcycle aiSpeech"
echo "== 提交部署 4 个 AI 云函数：$NAMES =="

declare -A TASKS
for name in $NAMES; do
  out=$("$CLI" -c WorkBuddy cloud_fn_deploy --appid "$APPID" --env "$ENV" --path "$ROOT\\$name" --remote-npm-install 2>&1)
  id=$(echo "$out" | grep -o 'confirmation_cloud_fn_deploy_[a-zA-Z0-9-]*' | head -1)
  if [ -z "$id" ]; then
    echo "[$name] DIRECT :: $(echo "$out" | grep -E '"(success|errorType|message)"' | tr '\n' ' ')"
  else
    TASKS[$name]=$id
    echo "[$name] 已提交确认 $id"
  fi
done

echo "== 等待确认（请在 IDE 弹出的确认框点「允许」）=="
for round in $(seq 1 60); do
  pending=0
  for name in $NAMES; do
    id=${TASKS[$name]}
    [ -z "$id" ] && continue
    r=$("$CLI" -c WorkBuddy polling_task_result --task-id "$id" </dev/null 2>&1)
    st=$(echo "$r" | grep -m1 '"status"' | tr -d ' ,":' | sed 's/status//')
    case "$st" in
      success) echo "[$name] OK (第 $round 轮)"; unset TASKS[$name] ;;
      failed|cancelled|expired) echo "[$name] FAILED :: $(echo "$r" | grep -E '"(detail|message)"' | tr '\n' ' ')"; unset TASKS[$name] ;;
      *) pending=$((pending + 1)) ;;
    esac
  done
  [ "$pending" -eq 0 ] && break
  sleep 5
done

left=0
for name in $NAMES; do [ -n "${TASKS[$name]}" ] && left=$((left + 1)); done
echo "=== DONE 未完成=$left ==="
echo "若状态条仍显示未接入：确认 ai.secret.json 已随包上传，并在云开发控制台确认 4 个 AI 函数超时为 30 秒（当前环境已确认）。"
