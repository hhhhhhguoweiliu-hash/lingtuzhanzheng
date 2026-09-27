"""Trace source geometry into editable vector annotations; no source image is shipped.

Requires numpy, opencv-python-headless, Pillow. The automatic masks are confined
to manually observed territorial envelopes so overlays do not join neighbors.
The circles obscure parts of the four central outlines: these are manually
traced from the visible borders in L_001s and checked against L_052s.
"""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
im = cv2.imread(str(ROOT/'references/frames/L_001s.jpg'))
b,g,r = [im[:,:,i].astype(int) for i in range(3)]
grey = ((np.max(im,axis=2)-np.min(im,axis=2)<44)&(np.max(im,axis=2)<191)).astype(np.uint8)*255
grey[:210]=0;grey[925:]=0

def points(s):
    return [[int(x) for x in pair.split(',')] for pair in s.split()]

def smoothmask(mask, manual, center=None):
    region=np.zeros(mask.shape,np.uint8)
    cv2.fillPoly(region,[np.array(manual,np.int32)],255)
    mask=cv2.bitwise_and(mask,region)
    if center:
        cv2.circle(mask,center,17,255,-1)
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    c=max(cs,key=cv2.contourArea)
    c=cv2.approxPolyDP(c,1.35,True)
    return c[:,0,:].tolist()

nodes=[]
def add(id,anchor,owner='neutral',polygon=None,auto=None,envelope=None,kind='normal',neighbors=None,**kw):
    if auto is not None:polygon=smoothmask(auto,envelope,tuple(anchor) if owner=='neutral' else None)
    nodes.append(dict(id=id,anchor=dict(x=anchor[0],y=anchor[1]),labelAnchor=dict(x=anchor[0],y=anchor[1]+30),owner=owner,garrison=200 if owner!='neutral' else 125,polygons=[[dict(x=x,y=y) for x,y in polygon]],neighbors=neighbors or [],kind=kind,**kw))

# Masks from the three distinct visible ownership fills.
blue=((b-r>32)&(g-r>25)&(g>130)).astype(np.uint8)*255
brown=((r-g>12)&(g-b>10)&(r<230)).astype(np.uint8)*255
magenta=((r-g>25)&(b-g>18)).astype(np.uint8)*255
add('L_SW',[117,786],'blue',auto=blue,envelope=points('0,670 178,670 178,690 211,687 251,712 256,743 240,755 248,800 213,839 151,871 108,898 28,925 0,925'))
add('L_N',[226,395],'brown',auto=brown,envelope=points('140,211 280,211 285,460 140,460'))
add('L_E',[481,625],'magenta',auto=magenta,envelope=points('430,566 531,566 531,671 430,671'))

# These six envelopes only isolate observed components; their coast details
# come from pixels, and opaque icons are filled before boundary extraction.
add('L_NE1',[302,408],auto=grey,envelope=points('289,367 325,367 329,402 321,430 332,438 368,441 369,459 359,470 366,485 357,496 341,494 324,478 312,477 309,464 299,478 286,491 278,492 286,467 284,450 280,438 284,424'))
add('L_NE2',[389,408],auto=grey,envelope=points('338,346 363,343 374,367 400,379 414,393 428,434 396,437 376,433 365,438 355,413 352,398 364,398 354,374 359,369 341,365'))
add('L_NE3',[528,454],auto=grey,envelope=points('365,440 396,438 431,439 476,430 499,416 526,422 548,407 566,399 571,383 588,379 596,373 648,356 658,397 630,405 614,422 581,437 570,463 550,489 540,529 532,542 532,555 519,553 504,567 487,554 498,523 511,519 516,501 501,492 487,490 489,469 475,477 466,472 457,482 445,477 442,491 424,485 411,489 402,484 387,489 380,494 381,505 371,509 365,495 372,478 366,465'))
add('L_SE',[423,711],auto=grey,envelope=points('398,664 454,664 464,717 452,726 450,756 432,794 416,794 401,751 399,721'))

# Fine visible-border annotation for the regions beneath translucent patterned
# circles. Areas hidden by dot/army overlays remain estimated, at ~3–5 px.
add('L_HEX_NW',[168,507],kind='special_unknown',coverageRadius=110,polygon=points('98,410 110,411 119,418 122,430 139,432 145,444 162,445 168,434 173,439 174,452 187,451 194,456 203,453 218,459 228,461 238,463 248,461 260,464 267,461 279,463 282,470 272,488 280,499 276,513 281,521 264,527 260,536 253,529 244,534 239,543 236,553 224,564 212,566 206,570 196,564 191,559 180,559 174,552 171,563 158,570 151,574 142,567 135,572 128,579 122,576 115,568 106,566 97,565 90,571 80,562 72,562 67,553 59,549 66,540 77,536 83,528 93,526 97,516 104,511 111,515 118,510 110,501 95,500 98,491 89,484 96,478 112,475 115,465 107,459 99,464 90,459 98,449 92,443 97,435 88,426'))
add('L_W',[142,631],polygon=points('68,575 81,578 90,574 99,581 111,580 117,588 128,589 132,580 143,584 152,578 162,582 172,568 178,569 180,578 190,581 199,576 210,573 217,577 228,565 238,562 240,551 250,545 258,534 265,536 270,545 268,556 273,567 272,586 264,594 261,606 251,607 247,611 239,608 234,615 224,617 218,626 208,626 205,633 197,631 189,635 184,642 192,648 194,655 202,652 208,660 212,671 225,679 223,688 210,690 204,682 196,687 193,679 186,684 188,692 183,700 174,697 173,705 163,702 157,710 149,704 143,698 132,698 123,690 112,692 105,689 97,693 92,687 99,677 108,668 116,659 115,652 104,653 98,645 98,630 91,621 80,621 73,610 73,601 65,594 70,585'))
add('L_HEX_C',[277,640],kind='special_unknown',coverageRadius=121,polygon=points('281,497 286,501 293,505 297,513 307,519 318,519 327,527 335,529 331,539 317,540 310,546 297,547 297,557 289,562 284,573 292,582 307,582 317,591 318,606 309,615 307,628 315,640 320,652 327,661 331,676 329,692 332,711 332,728 339,741 330,745 319,747 315,737 308,733 310,747 299,745 292,739 285,743 282,724 285,716 282,711 277,714 274,728 264,735 253,737 245,742 240,741 245,732 256,725 258,716 250,710 244,713 239,707 234,700 226,699 225,687 225,678 217,674 211,660 203,650 197,652 196,643 189,641 197,636 207,639 211,631 221,632 227,622 239,621 244,612 254,615 260,608 266,599 275,594 280,582 279,570 276,559 281,548 276,538 275,527 286,524 284,515 280,512'))
add('L_BONUS',[382,589],bonusLabel='+100',polygon=points('398,541 409,554 410,577 408,594 409,613 402,622 389,625 377,621 366,613 361,604 360,590 365,579 374,568 377,558 389,548'))
add('L_S',[359,772],polygon=points('276,752 288,755 299,753 305,760 318,758 328,753 336,757 342,751 348,748 352,741 358,751 367,748 373,751 378,747 387,753 388,767 395,769 396,775 400,780 398,786 389,785 385,791 375,788 366,791 353,789 341,788 325,789 311,793 299,790 287,786 275,789 264,787 265,778 278,771 278,766 272,761'))

# Graph neighbors are inferred from visible adjacency / gap crossing, not a
# claim that the original game forbids non-neighbor targeting.
graph={
'L_SW':['L_W','L_HEX_C','L_S'],
'L_N':['L_HEX_NW','L_NE1'],
'L_E':['L_BONUS','L_SE','L_NE3'],
'L_NE1':['L_N','L_HEX_NW','L_HEX_C','L_NE2','L_NE3'],
'L_NE2':['L_NE1','L_NE3'],
'L_NE3':['L_NE1','L_NE2','L_BONUS','L_E'],
'L_HEX_NW':['L_N','L_NE1','L_W','L_HEX_C'],
'L_W':['L_SW','L_HEX_NW','L_HEX_C'],
'L_HEX_C':['L_SW','L_W','L_HEX_NW','L_NE1','L_BONUS','L_S'],
'L_BONUS':['L_HEX_C','L_NE3','L_E','L_SE'],
'L_SE':['L_E','L_BONUS','L_S'],
'L_S':['L_SW','L_HEX_C','L_SE']}
for n in nodes:n['neighbors']=graph[n['id']]

# Remove a handful of pixels where hand-estimated, obscured shared borders
# crossed. This keeps hit-test ownership unambiguous while retaining gaps.
occupied=np.zeros(grey.shape,np.uint8)
for n in nodes:
    mask=np.zeros(grey.shape,np.uint8)
    poly=np.array([[p['x'],p['y']] for p in n['polygons'][0]],np.int32)
    cv2.fillPoly(mask,[poly],255)
    if np.any(mask & occupied):
        mask[cv2.dilate(occupied,np.ones((3,3),np.uint8))>0]=0
        cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        # Collinear compression preserves raster edge ownership exactly.
        poly=max(cs,key=cv2.contourArea)[:,0,:]
        n['polygons']=[[dict(x=int(x),y=int(y)) for x,y in poly]]
    cv2.fillPoly(occupied,[poly],255)

water=points('0,388 19,398 41,405 63,405 85,411 89,438 80,460 67,481 60,505 58,532 57,553 51,561 57,575 49,589 45,605 25,615 0,617 0,1014 8,984 37,966 56,949 78,938 91,920 111,907 112,885 101,880 86,886 74,900 53,900 46,887 35,889 25,912 12,924 0,926')
data=dict(id='long-reference',width=720,height=1372,nodes=nodes)
(ROOT/'research/map-trace/long-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'src/maps').mkdir(parents=True,exist_ok=True)
header='''import type { GameMap, Point } from '../sim/types';

/** Hand reviewed vector trace of L_001s.jpg (720×1372).
 * Geometry is observed; starting 200 troops and adjacency are candidates.
 * Details and occlusion limits: references/MAP-ANNOTATION.md.
 */
'''
out=header+'export const longMap: GameMap = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n\n'
out+='/** Pale water visible on the left; decorative, never a playable node. */\n'
out+='export const longWater: Point[][] = '+json.dumps([[dict(x=x,y=y) for x,y in water]],ensure_ascii=False)+';\n'
out+="export const longMapAppearance = { background: '#d1d1d1', water: '#b8d8e3', neutral: '#989a98', blue: '#59c4ec', brown: '#bd8c66', magenta: '#d767cf', territoryBorder: '#d4d4d0' } as const;\n"
(ROOT/'src/maps/long.ts').write_text(out,encoding='utf-8')

# Inspection artifact: every actual edge and center can be compared to source.
pic=Image.open(ROOT/'references/frames/L_001s.jpg').convert('RGBA')
overlay=Image.new('RGBA',pic.size,(0,0,0,0));d=ImageDraw.Draw(overlay)
for i,n in enumerate(nodes):
    poly=[(p['x'],p['y']) for p in n['polygons'][0]]
    d.line(poly+[poly[0]],fill=(240,10,10,230),width=2)
    x,y=n['anchor']['x'],n['anchor']['y']
    d.ellipse((x-4,y-4,x+4,y+4),fill=(0,255,0,255))
    d.text((x+5,y-17),n['id'],fill=(0,0,0,255),stroke_width=2,stroke_fill=(255,255,255,255))
Image.alpha_composite(pic,overlay).convert('RGB').save(ROOT/'research/map-trace/L-annotation-overlay.jpg',quality=95)
print('Wrote',len(nodes),'nodes;',sum(len(n['polygons'][0]) for n in nodes),'boundary vertices')
