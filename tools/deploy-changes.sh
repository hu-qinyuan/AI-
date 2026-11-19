#!/usr/bin/env bash
# 部署「语音转文字 + 归属设置」相关云函数（含 TokenHub 密钥同步）
# 用法：
#   bash tools/deploy-changes.sh                     部署全部 9 个
#   bash tools/deploy-changes.sh getProfile listFeed  只部署指定函数
#
# 注意：cloud_fn_deploy 属于写操作，开发者工具会弹「等待用户确认」；
# 因此本脚本先把所有部署请求一次性提交，再统一轮询任务状态（确认可能延迟一两分钟通过）。
CLI="/c/Program Files (x86)/Tencent/微信web开发者工具/wechatide.cmd"
APPID="wx4123c75f472af62d"
ENV="cloud1-d6get99l6f8cb27d7"
ROOT="E:\\AI宿造局\\miniprogram\\cloudfunctions"

node "E:/AI宿造局/tools/sync-ai-env.js" || exit 1
NAMES="$*"
if [ -z "$NAMES" ]; then
  NAMES="aiPost aiMutual aiUpcycle aiSpeech saveProfile getProfile listFeed createPost createMutual"
fi
echo "== 提交部署：$NAMES =="

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

echo "== 等待开发者工具确认（请在 IDE 弹出的确认框点「允许」）=="
for round in $(seq 1 60); do
  pending=0
  for name in $NAMES; do
    id=${TASKS[$name]}
    [ -z "$id" ] && continue
    r=$("$CLI" -c WorkBuddy polling_task_result --task-id "$id" </dev/null 2>&1)
    st=$(echo "$r" | grep -m1 '"status"' | tr -d ' ,":' | sed 's/status//')
    case "$st" in
      success)
        echo "[$name] OK (第 $round 轮)"; unset TASKS[$name] ;;
      failed|cancelled|expired)
        echo "[$name] FAILED :: $(echo "$r" | grep -E '"(detail|message)"' | tr '\n' ' ')"; unset TASKS[$name] ;;
      *) pending=$((pending + 1)) ;;
    esac
  done
  [ "$pending" -eq 0 ] && break
  sleep 5
done

left=0
for name in $NAMES; do [ -n "${TASKS[$name]}" ] && left=$((left + 1)); done
echo "=== DONE 未完成=$left ==="
echo "提醒：语音默认走云端 ASR（无需小程序插件授权，但需 TokenHub 语音额度）；可选启用插件见 tools/enable-speech-plugin.js。当前 4 个 AI 函数云端超时均为 30 秒，换环境时请重新确认。"
