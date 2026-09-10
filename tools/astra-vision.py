#!/usr/bin/env python3
"""THE MODEL IDENTIFIES. CODE MEASURES.
Astra reads the driveway centreline out of the satellite image and returns ordered
PIXEL FRACTIONS. It is never asked for a distance, a bearing or a side.
Code converts pixels to lat/lon through the known projection, then measures."""
import json, base64, math, subprocess, urllib.request, sys

CEN=(41.16531,-73.467798); Z=17; SIZE=640; SCALE=2   # reframed on the drive
KEY=subprocess.run(["gcloud","secrets","versions","access","latest","--secret=openai-api-key",
                    "--project=meerkatops-fireground"],capture_output=True,text=True).stdout.strip()
img=base64.b64encode(open("/tmp/sat.png","rb").read()).decode()

sysp=("You read aerial imagery and report GEOMETRY AS PIXEL FRACTIONS. You never state a distance, "
 "a length, a bearing or a compass direction — those are computed downstream from your points. "
 "Return ONLY JSON:\n"
 '{"driveway":{"found":true,"centreline":[[x,y],...],"entry_index":0,"structure_index":-1,'
 '"confidence":"HIGH|MEDIUM|LOW","unreadable":[]},'
 '"structure":{"centroid":[x,y],"which_building":""},'
 '"obstruction_hints":{"left_of_travel":[],"right_of_travel":[]}}\n'
 "x and y are fractions of image width and height, 0,0 top-left, 1,1 bottom-right. Order the "
 "centreline from the PUBLIC ROAD ENTRY to the STRUCTURE. Give 8 to 20 points, enough to follow "
 "every bend. If the canopy hides a stretch, still place points along your best reading of the "
 "course and name that stretch in unreadable.")
usrp=("This is a 1280x1280 aerial framed on the private drive at Silver Hill Hospital, New Canaan CT. A structure fire is in the "
 "Lodge (Michael's House), at the rear of the campus, reached by a long single-track private drive "
 "off Valley Rd. Trace the CENTRELINE of that private drive, from where it meets the public road to "
 "where it reaches the Lodge. Also give the Lodge centroid. Then, looking along entry->structure, "
 "say what you can see beside the drive on each side.")
body=json.dumps({"model":"gpt-6-astra","messages":[
 {"role":"system","content":sysp},
 {"role":"user","content":[{"type":"text","text":usrp},
   {"type":"image_url","image_url":{"url":"data:image/png;base64,"+img}}]}]}).encode()
r=urllib.request.Request("https://api.openai.com/v1/chat/completions",data=body,
  headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
try:
    out=json.loads(urllib.request.urlopen(r,timeout=240).read().decode())["choices"][0]["message"]["content"]
except urllib.error.HTTPError as e:
    print("HTTP",e.code,e.read().decode()[:500]); sys.exit(1)
print(out[:1800]); open("/tmp/vision.json","w").write(out)

# ---- CODE MEASURES, from here down the model contributes nothing ----
try:
    d=json.loads(out[out.index("{"):out.rindex("}")+1])
except Exception as e:
    print("\n(could not parse)",e); sys.exit(0)
dw=d.get("driveway",{})
if not dw.get("centreline"): print("\nno centreline returned"); sys.exit(0)
W=SIZE*SCALE
def latlon(fx,fy):
    n=256*(2**Z)
    cx=(CEN[1]+180.0)/360.0*n
    s=math.sin(math.radians(CEN[0])); cy=(0.5-math.log((1+s)/(1-s))/(4*math.pi))*n
    # image pixels are at SCALE; world pixels = image px / SCALE
    wx=cx+(fx*W-W/2)/SCALE; wy=cy+(fy*W-W/2)/SCALE
    lon=wx/n*360.0-180.0
    lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*wy/n))))
    return lat,lon
pts=[latlon(x,y) for x,y in dw["centreline"]]
def hav(a,b):
    R=20902231.0; p1,p2=math.radians(a[0]),math.radians(b[0])
    return 2*R*math.asin(math.sqrt(math.sin((p2-p1)/2)**2+math.cos(p1)*math.cos(p2)*
        math.sin(math.radians(b[1]-a[1])/2)**2))
L=sum(hav(pts[i],pts[i+1]) for i in range(len(pts)-1))
print(f"\nCODE MEASURES the points Astra returned:")
print(f"  vertices            {len(pts)}")
print(f"  driveway length     {L:.0f} ft   (department figure 823 ft)")
print(f"  entry               {pts[0][0]:.6f}, {pts[0][1]:.6f}")
print(f"  structure end       {pts[-1][0]:.6f}, {pts[-1][1]:.6f}")
print(f"  confidence          {dw.get('confidence')}")
json.dump([list(p) for p in pts],open("docs/design/drive-vision.json","w"))
