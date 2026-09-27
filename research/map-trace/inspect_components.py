from pathlib import Path
import cv2
import numpy as np

root = Path(__file__).resolve().parents[2]
im = cv2.imread(str(root / 'references/frames/L_001s.jpg'))
hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
mask=((hsv[:,:,2]<191)&(hsv[:,:,1]<65)).astype(np.uint8)*255
mask[:210]=0
mask[925:]=0
# 3 px opening removes most decorative circle dots without altering geography.
mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
count,labels,stats,cents=cv2.connectedComponentsWithStats(mask)
out=im.copy()
for i,st in enumerate(stats):
    if i==0 or st[4]<100:continue
    color=tuple(int(v) for v in np.random.default_rng(i).integers(20,245,3))
    out[labels==i]=color
    x,y,w,h,a=st
    cv2.putText(out,str(i),(x,y),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,0),1)
    print(i,st.tolist(),cents[i].tolist())
cv2.imwrite(str(root/'research/map-trace/components.png'),out)
cv2.imwrite(str(root/'research/map-trace/mask.png'),mask)
