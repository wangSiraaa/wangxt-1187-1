#!/usr/bin/env python3
"""轨道车辆轮对镟修排程 - 端到端业务流程验证"""
import json
import urllib.request
import urllib.error
import sys

BASE = "http://localhost:19487/api"
PASS = 0
FAIL = 0
LOGS = []

def log(msg):
    print(msg)
    LOGS.append(msg)

def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body else {}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode()
            return resp.status, json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text) if text else {"error": str(e)}
        except:
            return e.code, {"error": text}
    except Exception as e:
        return 0, {"error": str(e)}

def check(desc, cond):
    global PASS, FAIL
    if cond:
        log(f"  ✅ PASS: {desc}")
        PASS += 1
    else:
        log(f"  ❌ FAIL: {desc}")
        FAIL += 1

def hr(title=""):
    log(f"\n{'='*60}")
    if title:
        log(f"  {title}")
        log(f"{'='*60}")

# ========== MAIN ==========
hr("轨道车辆轮对镟修排程 - 完整业务流程验证")

# STEP 0: 基础数据
hr("【Step 0】获取基础数据")
_, machines = api("GET", "/machines")
_, vehicles = api("GET", "/vehicles")

idle_m = next((m for m in machines if m['status']=='idle' and not m['maintenance_flag']), None)
mnt_m = next((m for m in machines if m['maintenance_flag']==1), None)
log(f"  空闲机位: ID={idle_m['id'] if idle_m else None} ({idle_m['machine_no'] if idle_m else '-'})")
log(f"  保养机位: ID={mnt_m['id'] if mnt_m else None} ({mnt_m['machine_no'] if mnt_m else '-'})")
log(f"  车辆总数: {len(vehicles)}")

# ========== 关键问题1: 验证后端vehicles.js的status逻辑 ==========
# 直接调试一下：创建一辆全新的超阈车
hr("【关键调试】验证超阈车辆status自动设置逻辑")

# 先看看vehicles.js当前第40行代码到底是什么
log("  --- 检查服务器端代码 ---")
import os
with open(os.path.join(os.path.dirname(__file__), "server/src/routes/vehicles.js"), "r") as f:
    lines = f.readlines()
log(f"  第40行: {lines[39].rstrip()}")

# 新建车辆
import time
vno = f"G2024-PY-{int(time.time())}"
log(f"  创建车辆: {vno} 左=840 右=835.5 差值=4.5mm (阈值=3mm)")
status, resp = api("POST", "/vehicles", {
    "vehicle_no": vno,
    "wheel_diameter_left": 840,
    "wheel_diameter_right": 835.5,
    "status": "online"
})
log(f"  响应 HTTP {status}: {json.dumps(resp, ensure_ascii=False)[:200]}")
check("HTTP 201创建成功", status == 201)

if status == 201:
    vid = resp['id']
    check(f"轮径差=4.5 (实际={resp.get('wheel_diameter_diff')})", resp.get('wheel_diameter_diff') == 4.5)
    check(f"priority_flag=1 (实际={resp.get('priority_flag')})", resp.get('priority_flag') == 1)
    # 关键检查
    actual_status = resp.get('status')
    # 先不检查，记录实际值
    log(f"  ⚠️  注意: status实际值={actual_status}, 期望值=waiting")
    check(f"超阈车辆status自动为waiting (实际={actual_status})", actual_status == 'waiting')

    # STEP 2: 保养机位禁止排车
    hr("【Step 2】保养中机位禁止排车")
    if mnt_m:
        s, r = api("POST", "/schedules", {
            "vehicle_id": vid,
            "machine_id": mnt_m['id'],
            "operator": "测试"
        })
        log(f"  HTTP {s}: {json.dumps(r, ensure_ascii=False)[:100]}")
        check(f"保养中机位排程被拒绝 (HTTP 400)", s == 400)
        check("拒绝理由含'保养'字眼", 'error' in r and '保养' in r['error'])
    else:
        log("  无保养中机位，跳过")

    # STEP 3: 正常机位排程
    hr("【Step 3】正常空闲机位排程")
    s, r = api("POST", "/schedules", {
        "vehicle_id": vid,
        "machine_id": idle_m['id'],
        "operator": "测试"
    })
    log(f"  HTTP {s}: {json.dumps(r, ensure_ascii=False)[:150]}")
    check("创建排程成功 (HTTP 201)", s == 201)
    sid = r.get('id') if s == 201 else None
    check("排程初始状态=pending", r.get('status') == 'pending')

    # STEP 4: 开始镟修 (PUT status=in_progress)
    hr("【Step 4】开始镟修 pending → in_progress")
    s, r = api("PUT", f"/schedules/{sid}", {"status": "in_progress"})
    log(f"  HTTP {s}: {json.dumps(r, ensure_ascii=False)[:150]}")
    check("开始镟修成功 (HTTP 200)", s == 200)
    # 验证
    _, v_resp = api("GET", f"/vehicles/{vid}")
    _, m_resp = api("GET", f"/machines/{idle_m['id']}")
    _, s_resp = api("GET", f"/schedules/{sid}")
    log(f"  排程状态: {s_resp.get('status')}")
    log(f"  车辆状态: {v_resp.get('status')}")
    log(f"  机位状态: {m_resp.get('status')}")
    check("排程=in_progress", s_resp.get('status') == 'in_progress')
    check("车辆=maintaining", v_resp.get('status') == 'maintaining')
    check("机位=busy", m_resp.get('status') == 'busy')

    # STEP 5: 完成镟修 (PUT status=completed)
    hr("【Step 5】完成镟修 in_progress → completed (自动建质检)")
    s, r = api("PUT", f"/schedules/{sid}", {"status": "completed"})
    log(f"  HTTP {s}: {json.dumps(r, ensure_ascii=False)[:150]}")
    check("完成镟修成功 (HTTP 200)", s == 200)
    # 验证
    _, v_resp = api("GET", f"/vehicles/{vid}")
    _, m_resp = api("GET", f"/machines/{idle_m['id']}")
    _, s_resp = api("GET", f"/schedules/{sid}")
    _, insps = api("GET", "/inspections")
    target_insp = [i for i in insps if i.get('schedule_id') == sid]
    log(f"  排程状态: {s_resp.get('status')}")
    log(f"  车辆状态: {v_resp.get('status')}")
    log(f"  机位状态: {m_resp.get('status')}")
    log(f"  关联质检: {len(target_insp)}条")
    check("排程=completed", s_resp.get('status') == 'completed')
    check("机位释放=idle", m_resp.get('status') == 'idle')
    check("车辆回到waiting (待质检)", v_resp.get('status') == 'waiting')
    check("自动创建1条质检记录", len(target_insp) == 1)
    iid = target_insp[0]['id'] if target_insp else None

    # STEP 6: 质检不合格 → 车辆offline
    hr("【Step 6】质检不合格 → 车辆offline下线锁定")
    s, r = api("PUT", f"/inspections/{iid}", {
        "post_diameter_left": 838,
        "post_diameter_right": 836,
        "result": "fail",
        "inspector": "PyTest-QC",
        "remark": "表面粗糙度不达标"
    })
    log(f"  HTTP {s}: {json.dumps(r, ensure_ascii=False)[:150]}")
    check("质检提交成功", s == 200)
    _, v_resp = api("GET", f"/vehicles/{vid}")
    log(f"  车辆状态: {v_resp.get('status')}")
    check("质检不合格→车辆offline", v_resp.get('status') == 'offline')

    # STEP 7: 下线锁定禁止直接上线
    hr("【Step 7】offline禁止直接改online")
    s, r = api("PUT", f"/vehicles/{vid}", {"status": "online"})
    log(f"  HTTP {s}: {json.dumps(r, ensure_ascii=False)[:150]}")
    check("拒绝请求 (HTTP 400)", s == 400)
    check("错误信息含'下线锁定'或'质检'字眼",
          'error' in r and ('下线' in r['error'] or '质检' in r['error']))
    _, v_resp = api("GET", f"/vehicles/{vid}")
    check(f"车辆状态保持offline (实际={v_resp.get('status')})", v_resp.get('status') == 'offline')

# ========== Step 8: 完整合格流程 ==========
hr("【Step 8】完整合格流程: 镟修→质检合格→车辆自动online+更新轮径")
# 找另一辆waiting车
v2 = None
for v in vehicles:
    if v['status'] == 'waiting' and (vid is None or v['id'] != vid):
        v2 = v
        break
if v2 is None:
    # 新建一辆
    vno2 = f"G2024-PY2-{int(time.time())}"
    _, v2 = api("POST", "/vehicles", {
        "vehicle_no": vno2,
        "wheel_diameter_left": 839,
        "wheel_diameter_right": 834.5,
        "status": "online"
    })
    vid2 = v2['id']
else:
    vid2 = v2['id']
    # 确保是waiting，如果不是online且priority则等下检查
log(f"  使用车辆: ID={vid2} ({v2.get('vehicle_no','')}) 修前轮径={v2.get('wheel_diameter_left')}/{v2.get('wheel_diameter_right')}")

# 排程
_, s2 = api("POST", "/schedules", {
    "vehicle_id": vid2,
    "machine_id": idle_m['id'],
    "operator": "Test2"
})
sid2 = s2.get('id')
check("Step8: 创建排程成功", s2.get('id') is not None)
# 开始
api("PUT", f"/schedules/{sid2}", {"status": "in_progress"})
# 完成
api("PUT", f"/schedules/{sid2}", {"status": "completed"})
# 找质检
_, insps = api("GET", "/inspections")
i2 = next((i for i in insps if i.get('schedule_id') == sid2), None)
check("Step8: 自动创建质检", i2 is not None)
iid2 = i2['id'] if i2 else None

# 质检合格
POST_L, POST_R = 839.0, 838.5
log(f"  提交质检合格: 修后={POST_L}/{POST_R} 差值=0.5mm")
s, r = api("PUT", f"/inspections/{iid2}", {
    "post_diameter_left": POST_L,
    "post_diameter_right": POST_R,
    "result": "pass",
    "inspector": "PyTest-QC2"
})
check("Step8: 质检提交成功", s == 200)

_, v2_resp = api("GET", f"/vehicles/{vid2}")
log(f"  车辆最终状态: {v2_resp.get('status')}")
log(f"  车辆修后轮径: {v2_resp.get('wheel_diameter_left')}/{v2_resp.get('wheel_diameter_right')}")
check("Step8: 质检合格→online", v2_resp.get('status') == 'online')
check(f"Step8: 左轮径={POST_L} (实际={v2_resp.get('wheel_diameter_left')})",
      float(v2_resp.get('wheel_diameter_left', 0)) == float(POST_L))
check(f"Step8: 右轮径={POST_R} (实际={v2_resp.get('wheel_diameter_right')})",
      float(v2_resp.get('wheel_diameter_right', 0)) == float(POST_R))

# ========== 汇总 ==========
hr(f"验证完成: {PASS} 通过 / {FAIL} 失败")
sys.exit(0 if FAIL == 0 else 1)
