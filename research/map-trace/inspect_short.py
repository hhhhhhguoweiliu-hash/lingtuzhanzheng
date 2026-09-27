from pathlib import Path
import cv2
import numpy as np
root=Path(__file__).resolve().parents[2]
im=cv2.imread(str(root/'references/frames/S_000s.jpg'))
hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
mask=((hsv[:,:,2]<160)&(hsv[:,:,1]<45)).astype(np.uint8)*255
mask[:320]=0;mask[1150:]=0;mask[:,:40]=0;mask[:,510:]=0
centers=[(116,412),(181,416),(259,430),(332,451),(166,512),(241,502),(166,615),(236,582),(380,627),(271,789),(369,756),(457,793),(335,810),(394,839),(482,867),(315,880),(376,911),(441,921),(250,974),(315,978),(485,1019),(244,1117)]
for c in centers:cv2.circle(mask,c,17,255,-1)
mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
count,labels,stats,cents=cv2.connectedComponentsWithStats(mask)
out=im.copy()
for i,st in enumerate(stats):
    if i==0 or st[4]<300:continue
    color=tuple(int(v) for v in np.random.default_rng(i).integers(20,245,3))
    out[labels==i]=color
    x,y,w,h,a=st
    cv2.putText(out,str(i),(x,y),cv2.FONT_HERSHEY_SIMPLEX,.5,(0,0,0),1)
    print(i,st.tolist(),cents[i].tolist())
cv2.imwrite(str(root/'research/map-trace/S-components.png'),out)
cv2.imwrite(str(root/'research/map-trace/S-mask.png'),mask)
