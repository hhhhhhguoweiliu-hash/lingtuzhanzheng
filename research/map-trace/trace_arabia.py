"""Trace restored A battlefield. Coordinates measured in the 432x960 source."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
im=cv2.imread(str(ROOT/'media/analysis/A/A_016s.jpg'))
hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
gray=((hsv[:,:,2]<183)&(hsv[:,:,1]<45)).astype(np.uint8)*255
nodes=[]
def pts(s):return [[int(x) for x in p.split(',')] for p in s.split()]
def add(id,xy,border,owner='neutral',manual=False):
    p=np.array(pts(border),np.int32)
    if owner=='neutral' and not manual:
        area=np.zeros(gray.shape,np.uint8);cv2.fillPoly(area,[p],255)
        mask=gray.copy();cv2.circle(mask,tuple(xy),8,255,-1);mask&=area
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((2,2),np.uint8))
        cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        p=cv2.approxPolyDP(max(cs,key=cv2.contourArea),.65,True)[:,0,:]
    nodes.append(dict(id=id,owner=owner,garrison=80 if owner=='neutral' else (145 if owner=='blue' else 130),anchor=dict(x=xy[0],y=xy[1]),labelAnchor=dict(x=xy[0],y=xy[1]+14),polygons=[[dict(x=int(x),y=int(y)) for x,y in p]],neighbors=[],kind='normal'))
add('A_N',[100,326],'111,280 120,284 130,283 145,277 155,277 166,273 175,272 172,280 158,289 159,301 157,316 151,326 138,334 119,344 106,349 96,336 84,331 75,322 79,316 92,317 99,312 105,312 105,301 111,296')
add('A_BLUE',[81,349],'81,328 90,330 100,336 108,348 111,358 117,372 104,375 91,381 79,373 69,368 64,356 68,344 72,334','blue',True)
add('A_W',[75,390],'69,372 80,373 86,380 91,389 99,398 94,407 84,410 78,420 69,423 53,420 57,406 60,394 63,381')
add('A_NE',[229,403],'111,348 127,340 143,330 152,321 157,310 180,315 186,313 188,305 191,306 193,315 207,318 212,322 222,318 228,324 234,319 238,325 232,333 233,343 240,351 241,360 251,364 260,372 269,383 271,392 267,405 274,406 275,414 269,419 259,414 253,416 245,430 223,427 214,427 200,416 180,400 169,391 150,382 132,376 119,372')
add('A_NE_SMALL',[274,426],'255,416 267,414 275,417 281,423 280,434 270,437 250,432 247,430',manual=True)
add('A_C',[200,448],'87,378 102,375 117,374 133,378 148,383 163,389 181,402 198,417 214,429 243,432 236,442 224,456 216,465 213,467 217,479 214,487 219,493 206,496 194,505 181,507 175,519 168,524 158,532 154,536 146,535 138,548 132,541 125,540 119,533 110,529 105,516 95,509 91,497 88,485 81,477 78,466 68,453 60,450 44,448 46,433 50,423 68,426 79,423 86,413 97,410 102,399 95,389')
add('A_PURPLE',[279,477],'246,433 257,432 269,436 281,434 288,442 291,452 299,458 302,469 309,477 307,487 315,499 316,510 302,514 295,512 285,521 276,519 269,509 261,502 259,489 261,479 252,474 244,470 237,469 232,463 223,459 219,453 229,442 235,435','brown',True)
add('A_SC',[237,543],'214,466 224,462 235,470 246,475 256,479 257,494 260,504 270,512 275,524 272,544 270,567 269,586 265,598 247,602 225,604 212,600 204,592 200,580 195,570 196,561 192,553 183,551 176,543 171,531 175,519 182,510 193,510 198,503 208,498 220,497 221,489 216,480')
add('A_PINK',[316,565],'278,524 288,517 296,519 308,514 320,512 330,514 335,525 345,536 356,542 371,544 384,548 392,547 398,555 394,565 390,580 387,589 371,596 352,601 339,609 320,612 304,613 283,617 272,624 265,633 268,612 272,591 274,566','magenta',True)
add('A_S',[210,615],'121,539 131,544 135,551 144,547 152,540 158,533 167,525 173,541 182,554 192,556 192,571 198,583 201,595 213,603 226,607 245,606 265,601 263,620 261,639 255,644 249,639 230,638 215,634 195,637 190,638 188,649 181,653 176,642 168,631 162,619 159,610 149,600 140,591 133,578 131,566 127,558')
add('A_SE',[304,641],'190,643 195,640 215,638 231,642 248,642 255,646 265,637 274,627 286,621 305,617 321,616 337,613 343,627 349,640 348,650 339,656 334,666 318,673 304,676 287,682 279,690 266,692 253,697 238,700 230,705 213,706 207,711 194,713 189,709 187,699 186,684 182,667 183,654')
add('A_E',[363,626],'341,612 356,606 375,600 389,593 392,581 399,559 396,550 399,537 403,526 401,518 397,516 400,508 407,509 411,518 418,521 425,523 432,522 432,610 421,613 417,622 407,626 404,634 389,636 384,643 373,643 364,646 353,644 348,628')
edges=[('A_N','A_BLUE'),('A_N','A_NE'),('A_BLUE','A_W'),('A_BLUE','A_NE'),('A_BLUE','A_C'),('A_W','A_C'),('A_NE','A_C'),('A_NE','A_NE_SMALL'),('A_C','A_NE_SMALL'),('A_C','A_PURPLE'),('A_C','A_SC'),('A_C','A_S'),('A_NE_SMALL','A_PURPLE'),('A_PURPLE','A_SC'),('A_PURPLE','A_PINK'),('A_SC','A_S'),('A_SC','A_PINK'),('A_S','A_SE'),('A_PINK','A_SE'),('A_PINK','A_E'),('A_SE','A_E')]
lookup={n['id']:n for n in nodes}
for a,b in edges:lookup[a]['neighbors'].append(b);lookup[b]['neighbors'].append(a)
occupied=np.zeros(gray.shape,np.uint8)
for n in nodes:
    p=np.array([[p['x'],p['y']] for p in n['polygons'][0]],np.int32);mask=np.zeros(gray.shape,np.uint8);cv2.fillPoly(mask,[p],255)
    if np.any(mask&occupied):
        mask[cv2.dilate(occupied,np.ones((3,3),np.uint8))>0]=0
        cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);p=max(cs,key=cv2.contourArea)[:,0,:]
        n['polygons']=[[dict(x=int(x),y=int(y)) for x,y in p]]
    cv2.fillPoly(occupied,[p],255)

native=dict(id='arabia-native',width=432,height=960,nodes=nodes)
(ROOT/'research/map-trace/arabia-native.json').write_text(json.dumps(native,indent=2),encoding='utf-8')
pic=Image.open(ROOT/'media/analysis/A/A_016s.jpg').convert('RGBA');ol=Image.new('RGBA',pic.size);d=ImageDraw.Draw(ol)
for n in nodes:
    p=[(p['x'],p['y']) for p in n['polygons'][0]];d.line(p+[p[0]],fill=(230,0,0,255),width=1)
    x,y=n['anchor']['x'],n['anchor']['y'];d.ellipse((x-2,y-2,x+2,y+2),fill=(0,255,0,255));d.text((x+2,y-12),n['id'],fill=(0,0,0,255),stroke_width=1,stroke_fill=(255,255,255,255))
Image.alpha_composite(pic,ol).convert('RGB').resize((864,1920)).save(ROOT/'research/map-trace/A-annotation-overlay.jpg',quality=95)
scale=1372/960;offx=(720-432*scale)/2
def trans(p):return dict(x=round(p['x']*scale+offx,3),y=round(p['y']*scale,3))
normalized=json.loads(json.dumps(native));normalized.update(id='arabia-reference',width=720,height=1372)
for n in normalized['nodes']:
    n['anchor']=trans(n['anchor']);n['labelAnchor']=trans(n['labelAnchor']);n['polygons']=[[trans(p) for p in poly] for poly in n['polygons']]
(ROOT/'research/map-trace/arabia-map.json').write_text(json.dumps(normalized,indent=2),encoding='utf-8')
out="import type { GameMap } from '../sim/types';\n\n/** Restored A source (432x960); isotropically fitted into 720x1372. */\nexport const arabiaMap: GameMap = "+json.dumps(normalized,indent=2)+';\n'
out+="export const arabiaAppearance = { background: '#d1d1d1', neutral: '#979998', blue: '#23b5e7', brown: '#a46cf0', magenta: '#ee4b9b', territoryBorder: '#d4d4d0', sourceScale: 1372/960, sourceOffsetX: 51.3 } as const;\n"
(ROOT/'src/maps/arabia.ts').write_text(out,encoding='utf-8')
print('Wrote',len(nodes),'nodes to arabiaMap')
