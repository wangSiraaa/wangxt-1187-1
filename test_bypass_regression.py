#!/usr/bin/env python3
"""质检绕过漏洞回归测试 - 验证所有绕过场景被拦截，正常回上线流程可工作"""
import requests, json, time, sys

API = "http://localhost:19487/api"
PASS = 0
FAIL = 0

def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"✅ {name}")
    else:
        FAIL += 1
        print(f"❌ {name} -- {detail}")

def assert_http(req, status_ok=range(200, 300)):
    try:
        return req.status_code, req.status_code in status_ok, req.json()
    except:
        return req.status_code, req.status_code in status_ok, req.text

def find_free_vehicle():
    vs = requests.get(f"{API}/vehicles").json()
    used = set()
    for s in requests.get(f"{API}/schedules").json():
        if s["status"] in ("pending", "in_progress"):
            used.add(s["vehicle_id"])
    for v in vs:
        if v["id"] not in used:
            return v
    return None

def find_free_machine():
    ms = requests.get(f"{API}/machines").json()
    for m in ms:
        if not m["maintenance_flag"] and m["status"] == "idle":
            return m
    return None

print("="*60)
print("质检绕过漏洞回归测试")
print("="*60)

# 准备测试车辆和机位
test_v = None
for _ in range(3):
    nv = {"vehicle_no": f"BYPASS-TEST-{int(time.time())%100000}-{_}",
          "wheel_diameter_left": 840.0, "wheel_diameter_right": 840.0, "status": "online"}
    r = requests.post(f"{API}/vehicles", json=nv)
    if r.status_code == 201:
        test_v = r.json()
        break
check("准备: 创建测试车辆", test_v is not None, r.text)
if not test_v: sys.exit(1)

test_m = find_free_machine()
check("准备: 获取空闲机位", test_m is not None)

# ==========================================================================
# 场景1: 正常合格流程（对照组，确保正常功能未破坏）
# ==========================================================================
print("\n--- 场景1: 正常合格流程（对照组）---")
s1 = requests.post(f"{API}/schedules", json={
    "vehicle_id": test_v["id"], "machine_id": test_m["id"], "operator": "tester"
})
sc1, ok1, s1j = assert_http(s1)
check("1.1 创建排程成功", ok1, s1.text)
s1id = s1j["id"]

r = requests.put(f"{API}/schedules/{s1id}", json={"status": "in_progress"})
check("1.2 开始镟修", r.status_code == 200, r.text)

r = requests.put(f"{API}/schedules/{s1id}", json={"status": "completed"})
check("1.3 完成镟修", r.status_code == 200, r.text)

insps = [i for i in requests.get(f"{API}/inspections").json()
         if i["schedule_id"] == s1id and i["vehicle_id"] == test_v["id"] and i["result"] == "pending"]
check("1.4 自动创建pending质检", len(insps) >= 1, f"found={len(insps)}")
i1id = insps[0]["id"]

r = requests.put(f"{API}/inspections/{i1id}", json={
    "post_diameter_left": 838.0, "post_diameter_right": 838.2,
    "result": "pass", "inspector": "tester"
})
check("1.5 判定pass成功", r.status_code == 200, r.text)

v = requests.get(f"{API}/vehicles/{test_v['id']}").json()
check("1.6 车辆status=online", v["status"] == "online", v["status"])
check("1.7 修后轮径已更新", v["wheel_diameter_left"] == 838.0, str(v))

# ==========================================================================
# 场景2: 直接修改已判定(pass)的质检记录（改为pass再改，或fail再改）
# ==========================================================================
print("\n--- 场景2: 修改已判定质检记录结论（绕过拦截）---")
r = requests.put(f"{API}/inspections/{i1id}", json={
    "result": "fail", "inspector": "hacker"
})
check("2.1 已pass记录禁止再改", r.status_code == 400, f"{r.status_code}: {r.text[:80]}")

# 再准备一个fail的记录，然后尝试改pass
v2 = find_free_vehicle()
check("2.2 获取自由车辆", v2 is not None)
if v2:
    s2 = requests.post(f"{API}/schedules", json={
        "vehicle_id": v2["id"], "machine_id": test_m["id"], "operator": "t"
    }).json()
    requests.put(f"{API}/schedules/{s2['id']}", json={"status": "in_progress"})
    requests.put(f"{API}/schedules/{s2['id']}", json={"status": "completed"})
    i2_list = [i for i in requests.get(f"{API}/inspections").json()
               if i["schedule_id"] == s2["id"] and i["result"] == "pending"]
    i2id = i2_list[0]["id"]
    r = requests.put(f"{API}/inspections/{i2id}", json={
        "post_diameter_left": 839, "post_diameter_right": 835, "result": "fail"
    })
    check("2.3 先判定fail", r.status_code == 200, r.text)
    v2_now = requests.get(f"{API}/vehicles/{v2['id']}").json()
    check("2.4 车辆变为offline", v2_now["status"] == "offline", v2_now["status"])
    # 关键测试：尝试直接把fail的记录改成pass！
    r = requests.put(f"{API}/inspections/{i2id}", json={
        "post_diameter_left": 838, "post_diameter_right": 838, "result": "pass"
    })
    check("2.5 已fail记录禁止改pass（核心绕过拦截！）", r.status_code == 400, f"{r.status_code}: {r.text[:100]}")
    v2_now = requests.get(f"{API}/vehicles/{v2['id']}").json()
    check("2.6 车辆仍为offline（未被绕过）", v2_now["status"] == "offline", v2_now["status"])

# ==========================================================================
# 场景3: offline车辆通过直接PUT车辆接口改状态
# ==========================================================================
print("\n--- 场景3: offline车辆直接PUT车辆接口改状态（绕过）---")
r_online = requests.put(f"{API}/vehicles/{v2['id']}", json={"status": "online"})
check("3.1 offline→online禁止（直接车辆接口）", r_online.status_code == 400, f"{r_online.status_code}: {r_online.text[:100]}")
r_waiting = requests.put(f"{API}/vehicles/{v2['id']}", json={"status": "waiting"})
check("3.2 offline→waiting禁止（绕过排程）", r_waiting.status_code == 400, f"{r_waiting.status_code}: {r_waiting.text[:100]}")
v2_now = requests.get(f"{API}/vehicles/{v2['id']}").json()
check("3.3 车辆仍为offline（状态未被篡改）", v2_now["status"] == "offline", v2_now["status"])

# ==========================================================================
# 场景4: offline车辆创建游离pending质检（不关联排程）直接pass
# ==========================================================================
print("\n--- 场景4: offline车辆创建游离质检（无排程）绕过 ---")
v2_now = requests.get(f"{API}/vehicles/{v2['id']}").json()
check("4.0 车辆确实offline", v2_now["status"] == "offline")
# POST游离质检（schedule_id随意或空，但严格校验应该需要排程）
r = requests.post(f"{API}/inspections", json={
    "schedule_id": s2["id"], "vehicle_id": v2["id"],  # 旧排程
    "post_diameter_left": 838, "post_diameter_right": 838
})
check("4.1 为已有判定结论的排程新建质检被拦截", r.status_code == 400, f"{r.status_code}: {r.text[:120]}")

# ==========================================================================
# 场景5: 同排程多pending质检绕过（人工插入第二条pending记录）
# ==========================================================================
print("\n--- 场景5: 同排程多pending质检绕过 ---")
v3 = find_free_vehicle()
check("5.1 获取自由车辆v3", v3 is not None)
if v3:
    s5 = requests.post(f"{API}/schedules", json={
        "vehicle_id": v3["id"], "machine_id": test_m["id"], "operator": "t"
    }).json()
    requests.put(f"{API}/schedules/{s5['id']}", json={"status": "in_progress"})
    requests.put(f"{API}/schedules/{s5['id']}", json={"status": "completed"})
    i5_list = [i for i in requests.get(f"{API}/inspections").json()
               if i["schedule_id"] == s5["id"] and i["result"] == "pending"]
    check("5.2 初始pending质检只有1条", len(i5_list) == 1, f"count={len(i5_list)}")
    # 尝试第二条pending（POST同排程同车）
    r_dup = requests.post(f"{API}/inspections", json={
        "schedule_id": s5["id"], "vehicle_id": v3["id"],
        "post_diameter_left": 838, "post_diameter_right": 838
    })
    check("5.3 同排程重复pending质检被拦截", r_dup.status_code == 400, f"{r_dup.status_code}: {r_dup.text[:120]}")

    # 第一条判定fail，第二条尝试直接建pending后判pass（通过手动SQL插入模拟第二条pending）
    i5_first = i5_list[0]["id"]
    r = requests.put(f"{API}/inspections/{i5_first}", json={
        "post_diameter_left": 839, "post_diameter_right": 835, "result": "fail"
    })
    check("5.4 第一条质检判定fail", r.status_code == 200, r.text)

    # 尝试POST新pending给这个已fail的排程
    r_dup2 = requests.post(f"{API}/inspections", json={
        "schedule_id": s5["id"], "vehicle_id": v3["id"],
        "post_diameter_left": 838, "post_diameter_right": 838
    })
    check("5.5 已fail排程新建pending质检拦截", r_dup2.status_code == 400, f"{r_dup2.status_code}: {r_dup2.text[:150]}")
    v3_now = requests.get(f"{API}/vehicles/{v3['id']}").json()
    check("5.6 车辆确实offline", v3_now["status"] == "offline", v3_now["status"])

# ==========================================================================
# 场景6: 非法状态车辆质检（非waiting）+ 排程未完成（非completed）
# ==========================================================================
print("\n--- 场景6: 非法状态/排程质检 ---")
# 找一个status不是waiting的车（比如maintaining的车，如果有）
all_v = requests.get(f"{API}/vehicles").json()
# 直接新建pending质检给online车（排程未完成）
v_online = [x for x in all_v if x["status"] == "online" and x["id"] not in (v2["id"], v3["id"])][0]
check("6.1 找到online车", v_online is not None)

# 创建排程，但不开始不完成（pending状态的排程），尝试质检
s6 = requests.post(f"{API}/schedules", json={
    "vehicle_id": v_online["id"], "machine_id": test_m["id"], "operator": "t"
}).json()
# pending排程不应该有质检记录，手动POST质检尝试
r = requests.post(f"{API}/inspections", json={
    "schedule_id": s6["id"], "vehicle_id": v_online["id"]
})
check("6.2 未完成(pending)排程禁止创建质检", r.status_code == 400, f"{r.status_code}: {r.text[:100]}")

# 开始镟修但不完成（in_progress），再试
requests.put(f"{API}/schedules/{s6['id']}", json={"status": "in_progress"})
r = requests.post(f"{API}/inspections", json={
    "schedule_id": s6["id"], "vehicle_id": v_online["id"]
})
check("6.3 in_progress排程禁止创建质检", r.status_code == 400, f"{r.status_code}: {r.text[:100]}")

# 取消s6排程，清理v_online状态
requests.put(f"{API}/schedules/{s6['id']}", json={"status": "cancelled"})

# ==========================================================================
# 场景7: 正确回上线流程（fail后重新排程→镟修→新质检pass）必须能工作！
# ==========================================================================
print("\n--- 场景7: 正确回上线流程（fail后重新排程镟修）---")
# 用v2（已offline，存在历史fail）
v2_id = v2["id"]
v2_now = requests.get(f"{API}/vehicles/{v2_id}").json()
check("7.0 起点：v2是offline", v2_now["status"] == "offline", v2_now["status"])

# Step: 重新排程（允许offline排程）
s7_new = requests.post(f"{API}/schedules", json={
    "vehicle_id": v2_id, "machine_id": test_m["id"], "operator": "repair_team"
})
check("7.1 offline车辆允许重新排程", s7_new.status_code == 201, f"{s7_new.status_code}: {s7_new.text[:100]}")
s7j = s7_new.json()

v2_now = requests.get(f"{API}/vehicles/{v2_id}").json()
check("7.2 排程后车辆变为waiting", v2_now["status"] == "waiting", v2_now["status"])

# Step: 开始镟修
r = requests.put(f"{API}/schedules/{s7j['id']}", json={"status": "in_progress"})
check("7.3 开始镟修", r.status_code == 200, r.text)
v2_now = requests.get(f"{API}/vehicles/{v2_id}").json()
check("7.4 镟修中车辆status=maintaining", v2_now["status"] == "maintaining", v2_now["status"])

# Step: 完成镟修
r = requests.put(f"{API}/schedules/{s7j['id']}", json={"status": "completed"})
check("7.5 完成镟修", r.status_code == 200, r.text)
v2_now = requests.get(f"{API}/vehicles/{v2_id}").json()
check("7.6 完成镟修车辆=waiting", v2_now["status"] == "waiting", v2_now["status"])

# Step: 找到新的pending质检并判定pass
i7_list = [i for i in requests.get(f"{API}/inspections").json()
           if i["schedule_id"] == s7j["id"] and i["vehicle_id"] == v2_id and i["result"] == "pending"]
check("7.7 新排程自动生成新pending质检", len(i7_list) >= 1, f"count={len(i7_list)}")

i7id = i7_list[0]["id"]
r = requests.put(f"{API}/inspections/{i7id}", json={
    "post_diameter_left": 837.5, "post_diameter_right": 837.6,
    "result": "pass", "inspector": "chief"
})
check("7.8 新排程质检pass成功（历史fail不拦截合法流程！）",
      r.status_code == 200, f"{r.status_code}: {r.text[:150]}")

v2_now = requests.get(f"{API}/vehicles/{v2_id}").json()
check("7.9 车辆正确回online（合法流程放行！）",
      v2_now["status"] == "online", v2_now["status"])
check("7.10 修后轮径正确更新",
      v2_now["wheel_diameter_left"] == 837.5 and v2_now["wheel_diameter_right"] == 837.6,
      str(v2_now))

# ==========================================================================
# 场景8: 旧排程质检fail后，尝试用旧排程的游离pending质检pass（如果存在的话）
# ==========================================================================
print("\n--- 场景8: 用fail前创建的旧pending质检尝试绕过 ---")
# 用v3（存在历史fail，排程s5）
# 尝试手动POST新pending给旧排程s5（应该被拦截，因为该排程已判定过fail）
r = requests.post(f"{API}/inspections", json={
    "schedule_id": s5["id"], "vehicle_id": v3["id"]
})
check("8.1 旧已判定fail排程禁止新建质检", r.status_code == 400, f"{r.status_code}: {r.text[:120]}")

# 用v3走正确的回上线流程
s8_new = requests.post(f"{API}/schedules", json={
    "vehicle_id": v3["id"], "machine_id": test_m["id"], "operator": "repair"
}).json()
requests.put(f"{API}/schedules/{s8_new['id']}", json={"status": "in_progress"})
requests.put(f"{API}/schedules/{s8_new['id']}", json={"status": "completed"})
i8_list = [i for i in requests.get(f"{API}/inspections").json()
           if i["schedule_id"] == s8_new["id"] and i["result"] == "pending"]
i8id = i8_list[0]["id"]
r = requests.put(f"{API}/inspections/{i8id}", json={
    "post_diameter_left": 838, "post_diameter_right": 838.1, "result": "pass", "inspector": "c"
})
check("8.2 合法回上线流程通过", r.status_code == 200, f"{r.status_code}: {r.text[:150]}")
v3_now = requests.get(f"{API}/vehicles/{v3['id']}").json()
check("8.3 v3回online成功", v3_now["status"] == "online", v3_now["status"])

# ==========================================================================
# 总结
# ==========================================================================
print("\n" + "="*60)
print(f"回归测试结果: 通过={PASS} / 失败={FAIL} / 总计={PASS+FAIL}")
if FAIL == 0:
    print("🎉 所有绕过场景均被拦截，正常回上线流程放行！")
else:
    print("⚠️  存在测试失败，请检查")
print("="*60)

sys.exit(0 if FAIL == 0 else 1)
