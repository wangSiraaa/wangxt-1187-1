#!/bin/bash
BASE="http://localhost:19487/api"
NC='\033[0m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PASS=0
FAIL=0

check() {
  local desc="$1"
  local cond="$2"
  if eval "$cond"; then
    echo -e "${GREEN}✓ PASS${NC}: $desc"
    PASS=$((PASS+1))
  else
    echo -e "${RED}✗ FAIL${NC}: $desc"
    FAIL=$((FAIL+1))
  fi
}

getjson() {
  # $1=json字符串, $2=要取的key
  python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('$1',''))" <<< "$2"
}

getarrfield() {
  # $1=条件字段, $2=条件值, $3=返回字段, $4=json数组
  python3 -c "
import sys,json
arr=json.loads(sys.stdin.read())
for x in arr:
    if str(x.get('$1'))==str('$2'):
        print(x.get('$3',''))
        break
" <<< "$4"
}

filterarr() {
  # $1=条件, $2=json数组, 输出符合条件的第一个 [id,name]
  python3 -c "
import sys,json
exec('cond=lambda x: ' + '''$1''')
arr=json.loads(sys.stdin.read())
for x in arr:
    if cond(x):
        print(str(x.get('id',''))+' '+str(x.get('machine_no',x.get('vehicle_no',''))))
        break
" <<< "$2"
}

echo ""
echo -e "${BLUE}==============================================="
echo "轨道车辆轮对镟修排程 - 完整业务流程验证"
echo -e "===============================================${NC}"
echo ""

# ========== STEP 0: 获取基础数据 ==========
echo -e "${YELLOW}【Step 0】获取基础数据${NC}"
MACHINES=$(curl -s $BASE/machines)
VEHICLES=$(curl -s $BASE/vehicles)

# 空闲且未保养的机位
read IDLE_MID IDLE_MNO <<< $(filterarr "x['status']=='idle' and not x['maintenance_flag']" "$MACHINES")
# 保养中机位
read MNT_MID MNT_MNO <<< $(filterarr "x['maintenance_flag']==1" "$MACHINES")
echo "  空闲机位: ID=$IDLE_MID ($IDLE_MNO)"
echo "  保养中机位: ID=$MNT_MID ($MNT_MNO)"

# 找一辆waiting且priority=1的车辆（只要waiting就行）
read EXIST_VID EXIST_VNO <<< $(filterarr "x['status']=='waiting'" "$VEHICLES")
echo "  已有待镟修车: ID=$EXIST_VID ($EXIST_VNO)"
echo ""

# ========== STEP 1: 调度员录入超阈车辆 ==========
echo -e "${YELLOW}【Step 1】调度员录入超阈车辆（差值4.5mm>3mm）${NC}"
# 找一个不存在的编号
NEW_VNO="G2024-E2E-$(date +%s)"
echo "  新车编号: $NEW_VNO  左=840 右=835.5 差值=4.5mm"
RESP=$(curl -s -X POST $BASE/vehicles -H 'Content-Type: application/json' \
  -d "{\"vehicle_no\":\"$NEW_VNO\",\"wheel_diameter_left\":840,\"wheel_diameter_right\":835.5,\"status\":\"online\"}")
NEW_VID=$(getjson "id" "$RESP")
NEW_STATUS=$(getjson "status" "$RESP")
NEW_PRIORITY=$(getjson "priority_flag" "$RESP")
NEW_DIFF=$(getjson "wheel_diameter_diff" "$RESP")
echo "  创建结果: ID=$NEW_VID status=$NEW_STATUS priority=$NEW_PRIORITY diff=$NEW_DIFF"
check "轮径差计算正确=4.5mm" "[ \"$NEW_DIFF\" = \"4.5\" ]"
check "优先级自动标记=1" "[ \"$NEW_PRIORITY\" = \"1\" ]"
check "超阈车辆自动变为waiting" "[ \"$NEW_STATUS\" = \"waiting\" ]"
echo ""

# ========== STEP 2: 保养中机位禁止排车 ==========
echo -e "${YELLOW}【Step 2】保养中机位禁止排车验证${NC}"
if [ -n "$MNT_MID" ]; then
  echo "  尝试用保养中机位$MNT_MNO(ID=$MNT_MID)排车$NEW_VNO"
  RESP=$(curl -s -X POST $BASE/schedules -H 'Content-Type: application/json' \
    -d "{\"vehicle_id\":$NEW_VID,\"machine_id\":$MNT_MID,\"schedule_date\":\"2026-06-20\",\"operator\":\"test\"}")
  HAS_ERR=$(python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d.get('error') else 0)" <<< "$RESP")
  ERR_MSG=$(getjson "error" "$RESP")
  echo "  响应: ${ERR_MSG:0:60}"
  check "保养中机位排程被拒绝" "[ \"$HAS_ERR\" = \"1\" ]"
else
  echo "  无保养中机位，跳过"
fi
echo ""

# ========== STEP 3: 正常机位排程 ==========
echo -e "${YELLOW}【Step 3】正常空闲机位排程${NC}"
RESP=$(curl -s -X POST $BASE/schedules -H 'Content-Type: application/json' \
  -d "{\"vehicle_id\":$NEW_VID,\"machine_id\":$IDLE_MID,\"schedule_date\":\"2026-06-20\",\"operator\":\"test\"}")
SID=$(getjson "id" "$RESP")
SSTATUS=$(getjson "status" "$RESP")
echo "  排程结果: ID=$SID status=$SSTATUS"
check "排程创建成功=pending" "[ \"$SSTATUS\" = \"pending\" ] && [ -n \"$SID\" ]"
echo ""

# ========== STEP 4: 开始镟修 ==========
echo -e "${YELLOW}【Step 4】开始镟修（pending→in_progress）${NC}"
curl -s -X POST $BASE/schedules/$SID/start >/dev/null
RESP=$(curl -s $BASE/schedules/$SID)
SSTATUS=$(getjson "status" "$RESP")
VSTATUS=$(getjson "status" "$(curl -s $BASE/vehicles/$NEW_VID)")
MSTATUS=$(getjson "status" "$(curl -s $BASE/machines/$IDLE_MID)")
echo "  排程=$SSTATUS  车辆=$VSTATUS  机位=$MSTATUS"
check "排程=in_progress" "[ \"$SSTATUS\" = \"in_progress\" ]"
check "车辆=maintaining" "[ \"$VSTATUS\" = \"maintaining\" ]"
check "机位=busy" "[ \"$MSTATUS\" = \"busy\" ]"
echo ""

# ========== STEP 5: 完成镟修 ==========
echo -e "${YELLOW}【Step 5】完成镟修（in_progress→completed，自动建质检）${NC}"
curl -s -X POST $BASE/schedules/$SID/complete >/dev/null
SSTATUS=$(getjson "status" "$(curl -s $BASE/schedules/$SID)")
MSTATUS=$(getjson "status" "$(curl -s $BASE/machines/$IDLE_MID)")
INSP=$(curl -s $BASE/inspections)
INSP_COUNT=$(python3 -c "import sys,json;arr=json.load(sys.stdin);print(len([i for i in arr if i['schedule_id']==$SID]))" <<< "$INSP")
echo "  排程=$SSTATUS  机位=$MSTATUS  关联质检=$INSP_COUNT条"
check "排程=completed" "[ \"$SSTATUS\" = \"completed\" ]"
check "机位变回=idle" "[ \"$MSTATUS\" = \"idle\" ]"
check "自动创建1条质检记录" "[ \"$INSP_COUNT\" = \"1\" ]"
IID=$(python3 -c "import sys,json;arr=json.load(sys.stdin);m=[i['id'] for i in arr if i['schedule_id']==$SID];print(m[0] if m else '')" <<< "$INSP")
echo "  质检ID=$IID"
echo ""

# ========== STEP 6: 质检判定不合格 ==========
echo -e "${YELLOW}【Step 6】质检判不合格→车辆offline下线锁定${NC}"
curl -s -X PUT $BASE/inspections/$IID -H 'Content-Type: application/json' \
  -d '{"post_diameter_left":838,"post_diameter_right":836,"result":"fail","inspector":"QCTest","remark":"粗糙度不合格"}' >/dev/null
VSTATUS=$(getjson "status" "$(curl -s $BASE/vehicles/$NEW_VID)")
echo "  车辆状态=$VSTATUS"
check "质检不合格→车辆offline" "[ \"$VSTATUS\" = \"offline\" ]"
echo ""

# ========== STEP 7: 下线车辆禁止直接上线 ==========
echo -e "${YELLOW}【Step 7】下线锁定车辆禁止直接改online${NC}"
RESP=$(curl -s -X PUT $BASE/vehicles/$NEW_VID -H 'Content-Type: application/json' -d '{"status":"online"}')
HAS_ERR=$(python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d.get('error') else 0)" <<< "$RESP")
ERR_MSG=$(getjson "error" "$RESP")
VSTATUS=$(getjson "status" "$(curl -s $BASE/vehicles/$NEW_VID)")
echo "  响应: ${ERR_MSG:0:80}"
echo "  车辆实际状态=$VSTATUS"
check "直接改online被后端拒绝" "[ \"$HAS_ERR\" = \"1\" ]"
check "车辆状态保持offline" "[ \"$VSTATUS\" = \"offline\" ]"
echo ""

# ========== STEP 8: 完整合格流程 ==========
echo -e "${YELLOW}【Step 8】完整合格流程：镟修→质检合格→车辆自动上线+更新轮径${NC}"
# 找另一辆waiting的车
read V2_ID V2_NO <<< $(filterarr "x['status']=='waiting' and x['id']!=$NEW_VID" "$VEHICLES")
if [ -z "$V2_ID" ]; then
  # 新建一辆超阈车
  NEW2_VNO="G2024-E2E2-$(date +%s)"
  RESP2=$(curl -s -X POST $BASE/vehicles -H 'Content-Type: application/json' \
    -d "{\"vehicle_no\":\"$NEW2_VNO\",\"wheel_diameter_left\":839,\"wheel_diameter_right\":834.5,\"status\":\"online\"}")
  V2_ID=$(getjson "id" "$RESP2")
  V2_NO=$NEW2_VNO
fi
echo "  使用车辆ID=$V2_ID ($V2_NO)"

S2=$(curl -s -X POST $BASE/schedules -H 'Content-Type: application/json' \
  -d "{\"vehicle_id\":$V2_ID,\"machine_id\":$IDLE_MID,\"schedule_date\":\"2026-06-20\",\"operator\":\"test2\"}")
S2_ID=$(getjson "id" "$S2")
check "创建排程成功" "[ -n \"$S2_ID\" ]"

curl -s -X POST $BASE/schedules/$S2_ID/start >/dev/null
curl -s -X POST $BASE/schedules/$S2_ID/complete >/dev/null

I2_ID=$(python3 -c "import sys,json;arr=json.load(sys.stdin);m=[i['id'] for i in arr if i['schedule_id']==$S2_ID];print(m[0] if m else '')" <<< "$(curl -s $BASE/inspections)")
V2_PRE_L=$(getjson "wheel_diameter_left" "$(curl -s $BASE/vehicles/$V2_ID)")
V2_PRE_R=$(getjson "wheel_diameter_right" "$(curl -s $BASE/vehicles/$V2_ID)")
echo "  质检ID=$I2_ID  修前=$V2_PRE_L/$V2_PRE_R  →  修后=839.0/838.5"

curl -s -X PUT $BASE/inspections/$I2_ID -H 'Content-Type: application/json' \
  -d '{"post_diameter_left":839,"post_diameter_right":838.5,"result":"pass","inspector":"QCTest2"}' >/dev/null

V2_STATUS=$(getjson "status" "$(curl -s $BASE/vehicles/$V2_ID)")
V2_POST_L=$(getjson "wheel_diameter_left" "$(curl -s $BASE/vehicles/$V2_ID)")
V2_POST_R=$(getjson "wheel_diameter_right" "$(curl -s $BASE/vehicles/$V2_ID)")
echo "  车辆最终状态=$V2_STATUS  修后轮径=$V2_POST_L/$V2_POST_R"
check "质检合格→车辆自动online" "[ \"$V2_STATUS\" = \"online\" ]"
check "左轮径更新为839.0" "[ \"$V2_POST_L\" = \"839.0\" ]"
check "右轮径更新为838.5" "[ \"$V2_POST_R\" = \"838.5\" ]"

echo ""
echo -e "${BLUE}==============================================="
echo "验证完成：${GREEN}$PASS 通过${NC} / ${RED}$FAIL 失败${NC}"
echo -e "===============================================${NC}"
echo ""
if [ $FAIL -gt 0 ]; then exit 1; fi
