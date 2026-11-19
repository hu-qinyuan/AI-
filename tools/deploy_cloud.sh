#!/usr/bin/env bash
# 将本地 cloudfunctions 全量部署到微信云开发环境（串行，含确认轮询）
CLI="/c/Program Files (x86)/Tencent/微信web开发者工具/wechatide.cmd"
APPID="wx4123c75f472af62d"
ENV="cloud1-d6get99l6f8cb27d7"
ROOT="E:\\AI宿造局\\miniprogram\\cloudfunctions"

# 部署前同步 TokenHub 密钥到 3 个 AI 云函数（ai.secret.json 随函数包上传）
node "E:/AI宿造局/tools/sync-ai-env.js" || exit 1

ok=0
bad=0
for d in "E:/AI宿造局/miniprogram/cloudfunctions"/*/; do
  name=$(basename "$d")
  out=$("$CLI" -c WorkBuddy cloud_fn_deploy --appid "$APPID" --env "$ENV" --path "$ROOT\\$name" --remote-npm-install 2>&1)
  id=$(echo "$out" | grep -o 'confirmation_cloud_fn_deploy_[a-zA-Z0-9-]*' | head -1)
  if [ -z "$id" ]; then
    echo "[$name] DIRECT :: $(echo "$out" | grep -E '\"(success|errorType|message)\"' | tr '\n' ' ')"
    echo "$out" | grep -q '"success": true' && ok=$((ok+1)) || bad=$((bad+1))
    continue
  fi
  done_flag=0
  for i in $(seq 1 30); do
    r=$("$CLI" -c WorkBuddy polling_task_result --task-id "$id" 2>&1)
    st=$(echo "$r" | grep -m1 '"status"' | tr -d ' ,":' | sed 's/status//')
    case "$st" in
      success)
        echo "[$name] OK ($i polls)"
        ok=$((ok+1)); done_flag=1; break ;;
      failed|cancelled|expired)
        echo "[$name] FAILED :: $(echo "$r" | grep -E '\"(detail|message)\"' | tr '\n' ' ')"
        bad=$((bad+1)); done_flag=1; break ;;
    esac
    sleep 4
  done
  if [ "$done_flag" = 0 ]; then
    echo "[$name] TIMEOUT (confirmation pending)"
    bad=$((bad+1))
  fi
done
echo "=== DONE ok=$ok bad=$bad ==="
