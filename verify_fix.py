#!/usr/bin/env python3
import requests, json, time, sys
API = "http://localhost:19487/api"
PASS=FAIL=0

def check(name, cond, d=""):
    global PASS, FAIL
    if cond: PASS+=1; print(f"✅ {name}")
    else: FAIL+=1; print(f"❌ {name} -- {d}")

def j(r):
    try: return r.status_code, r.json()
    except: return r.status_code, r.text

nv = {"vehicle_no": "VFY-"+str(int(time.time())%10000), "wheel_diameter_left": 840, "wheel_diameter_right": 840}
sc, v = j(requests.post(f"{API}/vehicles", json=nv))
check("0. 创建测试车", sc==201, f"{sc} {v}")
if sc!=201: sys.exit(1)
vid = v["id"]

ms = requests.get(f"{API}/machines").json()
m = [x for x in ms if not x["maintenance_flag"] and x["status"]=="idle"][0]

# === 1. 第一次排程+质检fail ===
s1 = requests.post(f"{API}/schedules", json={"vehicle_id": vid, "machine_id": m["id"]}).json()
requests.put(f"{API}/schedules/{s1['id']}", json={"status":"in_progress"})
requests.put(f"{API}/schedules/{s1['id']}", json={"status":"completed"})
insps = [i for i in requests.get(f"{API}/inspections").json() if i["schedule_id"]==s1["id"] and i["result"]=="pending"]
i1id = insps[0]["id"]
sc, rj = j(requests.put(f"{API}/inspections/{i1id}", json={"post_diameter_left":839, "post_diameter_right":830, "result":"fail"}))
check(f"1. 质检fail成功 code=200", sc==200, f"{sc} {rj}")
vnow = requests.get(f"{API}/vehicles/{vid}").json()
check(f"2. 车辆变为offline", vnow["status"]=="offline", vnow["status"])

# === 验证A-E: 各种绕过 ===
sc, rj = j(requests.put(f"{API}/inspections/{i1id}", json={"post_diameter_left":838, "post_diameter_right":838, "result":"pass"}))
check("A. 已fail记录禁止改pass (400)", sc==400, f"{sc} {str(rj.get('error',''))[:70]}")

sc, rj = j(requests.put(f"{API}/vehicles/{vid}", json={"status":"online"}))
check("B. offline车PUT→online禁止 (400)", sc==400, f"{sc} {str(rj.get('error',''))[:70]}")

sc, rj = j(requests.put(f"{API}/vehicles/{vid}", json={"status":"waiting"}))
check("C. offline车PUT→waiting禁止 (400)", sc==400, f"{sc} {str(rj.get('error',''))[:70]}")

sc, rj = j(requests.post(f"{API}/inspections", json={"schedule_id": s1["id"], "vehicle_id": vid}))
check("D. 已判定排程禁止新建质检 (400)", sc==400, f"{sc} {str(rj.get('error',''))[:70]}")

vnow = requests.get(f"{API}/vehicles/{vid}").json()
check("E. 绕过尝试后车辆仍为offline", vnow["status"]=="offline", vnow["status"])

# === 正确流程: 重新排程 ===
print("\n--- 正确回上线流程 ---")
sc2, s2 = j(requests.post(f"{API}/schedules", json={"vehicle_id": vid, "machine_id": m["id"]}))
check("F. offline车重新排程成功 (201)", sc2==201, f"{sc2} {str(s2.get('error','OK'))[:70]} s2_id={s2.get('id')}")
if sc2 != 201:
    print("排程失败，终止")
else:
    s2id = s2["id"]
    sc, _ = j(requests.put(f"{API}/schedules/{s2id}", json={"status":"in_progress"}))
    check("G. 新排程开始镟修 (200)", sc==200, f"{sc}")
    sc, _ = j(requests.put(f"{API}/schedules/{s2id}", json={"status":"completed"}))
    check("H. 新排程完成镟修 (200)", sc==200, f"{sc}")
    insps2 = [i for i in requests.get(f"{API}/inspections").json() if i["schedule_id"]==s2id and i["result"]=="pending"]
    check("I. 新排程自动生成pending质检", len(insps2)>=1, f"count={len(insps2)}")
    if insps2:
        sc, rj = j(requests.put(f"{API}/inspections/{insps2[0]['id']}", json={"post_diameter_left":838, "post_diameter_right":838.1, "result":"pass"}))
        check("J. 新排程质检pass成功 (200)", sc==200, f"{sc} {str(rj.get('error','OK'))[:90]}")
        vend = requests.get(f"{API}/vehicles/{vid}").json()
        check("K. 车辆正确回online", vend["status"]=="online", f"status={vend['status']}")
        check("L. 修后轮径已更新", vend["wheel_diameter_left"]==838, f"l={vend['wheel_diameter_left']} r={vend['wheel_diameter_right']}")

# === 附加: fail→pass回online后，再排程质检pass不应被历史影响 ===
print("\n--- 附加: 回online后再次正常排程质检 ---")
sc3, s3 = j(requests.post(f"{API}/schedules", json={"vehicle_id": vid, "machine_id": m["id"]}))
check("M. online车再次排程", sc3==201, f"{sc3}")
if sc3 == 201:
    requests.put(f"{API}/schedules/{s3['id']}", json={"status":"in_progress"})
    requests.put(f"{API}/schedules/{s3['id']}", json={"status":"completed"})
    insps3 = [i for i in requests.get(f"{API}/inspections").json() if i["schedule_id"]==s3["id"] and i["result"]=="pending"]
    if insps3:
        sc, rj = j(requests.put(f"{API}/inspections/{insps3[0]['id']}", json={"post_diameter_left":837, "post_diameter_right":837.05, "result":"pass"}))
        check("N. 再次排程质检pass (历史fail不影响) (200)", sc==200, f"{sc} {str(rj.get('error','OK'))[:80]}")
        vend2 = requests.get(f"{API}/vehicles/{vid}").json()
        check("O. 车仍是online", vend2["status"]=="online", f"status={vend2['status']}")

print(f"\n===== 结果: PASS={PASS} FAIL={FAIL} 总计={PASS+FAIL} =====")
sys.exit(0 if FAIL==0 else 1)
