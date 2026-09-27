"""Check traced map geometry and graph; run after either tracing script."""
from pathlib import Path
import json
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
reports=[]
for name in ('long-map','short-map','arabia-map'):
    data=json.loads((ROOT/f'research/map-trace/{name}.json').read_text(encoding='utf-8'))
    nodes=data['nodes'];lookup={n['id']:n for n in nodes}
    assert len(lookup)==len(nodes),'Duplicate node id'
    masks=[];outside=[]
    for n in nodes:
        polygon=np.array([[p['x'],p['y']] for p in n['polygons'][0]],np.int32)
        anchor=n['anchor'];a=(anchor['x'],anchor['y'])
        if cv2.pointPolygonTest(polygon,a,False)<0:outside.append(n['id'])
        mask=np.zeros((data['height'],data['width']),np.uint8)
        cv2.fillPoly(mask,[polygon],1);masks.append(mask)
        for nb in n['neighbors']:
            assert nb in lookup,(n['id'],nb,'missing neighbor')
            assert n['id'] in lookup[nb]['neighbors'],(n['id'],nb,'not symmetric')
    overlaps=sum(int(np.count_nonzero(masks[i]&masks[j])) for i in range(len(masks)) for j in range(i))
    visited=set();todo=[nodes[0]['id']]
    while todo:
        cur=todo.pop()
        if cur in visited:continue
        visited.add(cur);todo.extend(lookup[cur]['neighbors'])
    report=dict(map=name,nodeCount=len(nodes),anchorsOutside=outside,overlapPixels=overlaps,graphSymmetric=True,graphConnected=len(visited)==len(nodes))
    reports.append(report)
    assert not outside and overlaps==0 and report['graphConnected'],report
result=dict(status='PASS',checks=reports,scope='Static geometry and graph only; not a visual fidelity or original mechanism claim.')
(ROOT/'research/map-trace/validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
