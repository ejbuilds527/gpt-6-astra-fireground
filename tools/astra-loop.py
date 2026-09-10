#!/usr/bin/env python3
"""Fireground: the real Astra decision loop.
   1 ASSEMBLE  code   fact pack from Firestore
   2 PROPOSE    gpt-6-astra
   3 CHECK      code
   4 CHALLENGE  gpt-5.6-sol, CLEAN CONTEXT
"""
import json, subprocess, urllib.request, sys, time

PROJ="meerkatops-fireground"
FS="https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents/"%PROJ

def sh(*a): return subprocess.run(a,capture_output=True,text=True).stdout.strip()
TOK=sh("gcloud","auth","print-access-token")
KEY=sh("gcloud","secrets","versions","access","latest","--secret=openai-api-key","--project="+PROJ)

def un(v):
    k=list(v)[0]; x=v[k]
    if k=="mapValue": return {a:un(b) for a,b in x.get("fields",{}).items()}
    if k=="arrayValue": return [un(i) for i in x.get("values",[])]
    if k=="integerValue": return int(x)
    if k=="nullValue": return None
    return x
def doc(p):
    r=urllib.request.Request(FS+p,headers={"Authorization":"Bearer "+TOK})
    return {k:un(v) for k,v in json.loads(urllib.request.urlopen(r).read().decode())["fields"].items()}

# ---------- 1 ASSEMBLE ----------
site=doc("sites/silver-hill"); scen=doc("scenarios/lodge-confirmed")
app=doc("settings/apparatus");  att=doc("settings/attack_scenario")
dump=doc("routes/dump-site");   hsr=doc("sources/hydrant_side_of_road")
pol=doc("settings/policy");     modes=doc("settings/supply_modes")

facts={}
def F(i,v,u,src): facts[i]={"value":v,"unit":u,"source":src}
F("F.SITE.address",site["address"],"","department record")
F("F.SITE.building",scen["building"],"","placed by the IC on arrival")
F("F.SITE.driveway_ft",scen["driveway_ft"],"ft","measured along the drive")
F("F.SITE.drive_single_track",True,"","department statement")
F("F.DEM.gpm",att["demand_gpm"],"gpm","1 3/4 smoothbore 180 + 2 1/2 BlitzFire 500")
F("F.DEM.tank_seconds",att["tank_seconds"],"s","750 gal E7 tank at demand")
for h in scen["hydrant_ranking"]:
    F("F.HYD.%s.ft"%h["id"],h["ft"],"ft","department record, from the Lodge")
    if h.get("status"): F("F.HYD.%s.status"%h["id"],h["status"],"","department record")
    if h.get("gpm"): F("F.HYD.%s.gpm"%h["id"],h["gpm"],"gpm","NFPA 291 flow test")
    if h.get("note"): F("F.HYD.%s.note"%h["id"],h["note"],"","department record")
for h in hsr["hydrants"]:
    F("F.HYD.%s.side"%h["id"],h["side"],"","computed: cross product against the routed polyline")
    if h.get("gpm"): F("F.HYD.%s.gpm"%h["id"],h["gpm"],"gpm","NFPA 291 flow test")
F("F.HYD.1-18.flow_test_days",696,"days","last tested 2024-10-14")
for u in app["units"]:
    F("F.APP.%s.hose_5in_ft"%u["id"],u.get("hose_5in_ft"),"ft","department, corrected 2026-09-10")
    F("F.APP.%s.tank_gal"%u["id"],u.get("tank_gal"),"gal","department")
    F("F.APP.%s.pump_gpm"%u["id"],u.get("pump_gpm"),"gpm","NFPA 1900 rated")
F("F.APP.first_alarm_rigs",2,"rigs","six career staff put two rigs on the road")
F("F.APP.hose_first_alarm_ft",4000,"ft","E7 1500 + E2 2500")
F("F.RT.dump.supply_ft",dump["supply_line_ft"],"ft","Google Directions, dump site to the fire")
F("F.RT.dump.cycle_min",dump["cycle_min"],"min","routed legs + fill + dump + manoeuvre")
F("F.RT.dump.tankers",dump["tankers_required"],"tankers","delivered gpm vs demand")
F("F.RT.dump.delivered_gpm",dump["delivered_gpm"],"gpm","2500 gal / cycle x tankers")
F("F.RT.relay.pull_ft",4754,"ft","Google Directions, hydrant 1-18 to the site")
F("F.RT.relay.hose_needed_ft",4800,"ft","pull rounded up to a whole hose section")
F("F.POL.intake_psi",pol.get("intake_psi",20),"psi","department policy")
F("F.POL.hose_max_psi",pol.get("hose_max_psi",180),"psi","NFPA 1962 marked max")
F("F.MODE.options",[m["id"] for m in modes["modes"]],"","settings/supply_modes")
F("F.TANKER.capacity_source","SYNTHETIC","","2500 gal assumed for every mutual aid tanker")

# the drive as GEOMETRY, not a scalar — a length has no sides
DRIVE=json.load(open("docs/design/drive-poly.json"))
F("F.SITE.drive_polyline",DRIVE,"lat,lon pairs",
  "Google Directions, Valley Rd drop to the Lodge, 28 vertices. THIS IS THE LINE LEFT AND RIGHT ARE DEFINED AGAINST.")
F("F.SITE.drive_direction","entry at the Valley Rd drop -> the Lodge","",
  "left and right are taken looking along this direction")
F("F.SITE.drive_entry",DRIVE[0],"lat,lon","the public-road end, where E7 drops")
F("F.SITE.drive_end",DRIVE[-1],"lat,lon","the Lodge end, where E7 parks and pumps")
F("F.SITE.drive_obstructions",
  {"left":["dry stone wall from 180 ft to 430 ft from the entry, hard against the edge",
           "drainage swale from 500 ft to 620 ft, soft ground"],
   "right":["mature trees set back 6 ft, trunks clear of the shoulder",
            "gravel turnout at 610 ft, firm"]},
  "","DEPARTMENT WALK-THROUGH, entered on the settings page. Recorded looking entry -> Lodge.")
F("F.SITE.drive_shoulder_width",{"left":2.0,"right":5.0},"ft",
  "DEPARTMENT WALK-THROUGH, narrowest clear width on each side, entered on the settings page.")
F("F.SITE.drive_entry_side_of_building","the Lodge front entry and the pump panel face the RIGHT side looking entry -> Lodge","",
  "department walk-through")
F("F.OPS.hose_od_charged",5.0,"in","5 in LDH, charged outside diameter")
F("F.OPS.lane_width_typical",12,"ft","a single-track drive lane")

# THE RULE, not the answer. Astra applies it; code supplies the geometry it needs.
F("F.RULE.no_road_crossing",
  "A supply line laid ACROSS a travel lane closes that road. Lay along ONE side. Think of walking "
  "a sidewalk from the driveway to the source without crossing. If the source sits on the far side, "
  "cross ONCE, AT THE SOURCE, and ramp that crossing. Never cross at the drop.",
  "","department practice")
F("F.SITE.drive_side_of_street","LEFT","",
  "COMPUTED: three vertices of the traced drive, 40/57/88 m off the Valley Rd centreline, all fall "
  "LEFT of travel entry->dump. This is the side the driveway connects to.")
F("F.RT.dump_side_of_street","RIGHT","",
  "COMPUTED: the dump site falls RIGHT of travel entry->dump, the opposite side from the driveway.")
F("F.SITE.drive_lay_side_options",["LEFT","RIGHT"],"","the two sides of the private drive")
F("F.RT.street_lay_side_options",["LEFT","RIGHT"],"","the two sides of Valley Rd")

print(f"1 ASSEMBLE   {len(facts)} facts\n")

def call(model,system,user,tag):
    body=json.dumps({"model":model,"messages":[{"role":"system","content":system},
                                               {"role":"user","content":user}]}).encode()
    r=urllib.request.Request("https://api.openai.com/v1/chat/completions",data=body,
        headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    t=time.time()
    try:
        d=json.loads(urllib.request.urlopen(r,timeout=180).read().decode())
    except urllib.error.HTTPError as e:
        print(f"{tag} HTTP {e.code}: {e.read().decode()[:400]}"); return None,0
    return d["choices"][0]["message"]["content"], time.time()-t

PACK=json.dumps(facts,indent=1)

# ---------- 2 PROPOSE ----------
sysp=("You are the water supply advisor on a working structure fire. You NEVER produce a number. "
 "Every distance, flow, time and side has already been measured and is in the fact pack. "
 "You choose between measured options and say why. Return ONLY JSON matching this shape:\n"
 '{"supply_mode":{"pick":"","why":"","grounded_in":[]},'
 '"fill_site":{"pick":"","why":"","grounded_in":[]},'
 '"lay_side_drive":{"pick":"LEFT|RIGHT","why":"","grounded_in":[]},'
 '"lay_side_street":{"pick":"LEFT|RIGHT","why":"","grounded_in":[]},'
 '"crossings":[{"where":"","why_unavoidable":"","grounded_in":[]}],'
 '"dump_site":{"pick":"","why":"","grounded_in":[]},'
 '"tanker_count":{"pick":0,"why":"","grounded_in":[]},'
 '"engine_assignments":[{"unit":"","direction":"LAY IN|LAY OUT|NO LAY","segment":"","role_at_end":""}],'
 '"unreadable":[]}\n'
 "Every grounded_in entry MUST be a fact id that exists in the pack. A pick you cannot ground is a "
 "pick you must not make.")
usrp=("FACT PACK:\n"+PACK+"\n\nThe incident commander has confirmed the fire is in the Lodge, at the "
 "rear of the campus, up a long single-track private drive. Decide how water reaches this fire.")
prop,t2=call("gpt-6-astra",sysp,usrp,"PROPOSE")
print(f"2 PROPOSE    gpt-6-astra   {t2:.1f}s")
print(prop[:2600] if prop else "(failed)")
open("/tmp/proposal.json","w").write(prop or "")

# ---------- 4 CHALLENGE, clean context ----------
if prop:
    syss=("You are an adversarial reviewer on a fire ground decision. You did NOT make this proposal "
     "and you have NOT seen the reasoning that produced it. Attack it. Do not grade it, do not praise "
     "it. Find what it MISSED, what it asserted on a fact that does not support it, which placement "
     "you would have made differently, what fails at 03:00 in the rain, which number is stale, and "
     "what is SYNTHETIC being treated as measured. Return ONLY JSON:\n"
     '{"challenges":[{"target":"","severity":"BLOCK|QUESTION|NOTE","claim":"","grounded_in":[],'
     '"test":"","would_have_picked":""}]}\n'
     "A challenge you cannot ground in a fact id from the pack is speculation. Discard it yourself.")
    usrs="FACT PACK:\n"+PACK+"\n\nPROPOSAL UNDER REVIEW:\n"+prop
    ch,t4=call("gpt-5.6-sol",syss,usrs,"CHALLENGE")
    print(f"\n4 CHALLENGE  gpt-5.6-sol (clean context)   {t4:.1f}s")
    print(ch[:2600] if ch else "(failed)")
    open("/tmp/challenges.json","w").write(ch or "")
