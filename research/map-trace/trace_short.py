"""Vector annotation of S; subtitle-obscured central borders are estimates."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
im=cv2.imread(str(ROOT/'references/frames/S_000s.jpg'))
hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
grey=((hsv[:,:,2]<174)&(hsv[:,:,1]<45)).astype(np.uint8)*255

def pts(s):return [[int(t) for t in p.split(',')] for p in s.split()]
nodes=[]
def add(id,xy,border,owner='neutral',manual=False):
    p=np.array(pts(border),np.int32)
    if owner=='neutral' and not manual:
        envelope=np.zeros(grey.shape,np.uint8);cv2.fillPoly(envelope,[p],255)
        mask=grey.copy();cv2.circle(mask,tuple(xy),17,255,-1)
        mask=cv2.bitwise_and(mask,envelope)
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
        cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        p=cv2.approxPolyDP(max(cs,key=cv2.contourArea),1.0,True)[:,0,:]
    nodes.append(dict(id=id,owner=owner,garrison=70 if owner=='neutral' else 150,anchor=dict(x=xy[0],y=xy[1]),labelAnchor=dict(x=xy[0],y=xy[1]+31),polygons=[[dict(x=int(x),y=int(y)) for x,y in p]],neighbors=[],kind='normal'))

add('S_NW',[116,412],'141,341 155,342 170,357 157,371 151,390 155,413 150,427 148,467 137,469 121,460 111,455 102,472 85,482 84,451 77,440 62,437 58,423 62,407 70,394 83,388 95,375 110,367 117,354')
add('S_N1',[181,417],'163,367 174,374 180,389 195,390 205,400 214,410 230,413 234,427 218,435 202,435 194,449 181,454 164,461 152,466 152,428 157,414 153,398 154,382')
add('S_N2',[259,430],'280,378 293,379 300,391 299,410 294,415 298,432 292,439 285,452 273,452 268,471 254,475 249,482 236,481 233,471 222,466 213,470 210,461 215,451 208,439 224,435 238,429 238,416 253,407 268,395')
add('S_N3',[332,451],'299,408 306,404 317,414 336,414 340,404 351,404 356,414 367,415 367,431 355,435 350,444 339,452 338,471 330,488 312,486 302,486 295,498 282,497 266,487 264,474 272,458 276,449 287,449 294,437 300,431')
add('S_MW',[166,512],'153,466 169,460 185,454 194,449 203,438 211,449 210,461 201,471 205,487 218,507 224,520 216,531 220,549 210,557 195,549 181,547 174,555 147,559 134,558 130,546 131,529 140,512 145,498 151,489 144,477')
add('S_M1',[241,502],'207,472 220,469 229,474 233,484 245,485 252,476 263,478 266,494 274,500 286,501 289,515 280,519 267,515 253,512 245,515 232,519 221,512 212,503 207,491')
add('S_W',[166,615],'133,561 145,564 159,558 173,559 176,578 181,594 191,607 200,619 215,616 234,611 235,645 229,654 218,658 214,668 205,665 196,659 185,649 177,647 177,657 164,664 148,671 137,665 138,657 124,653 113,647 124,635 112,632 99,633 92,627 94,617 106,612 105,601 113,590 113,578 121,572 120,564')
add('S_C',[236,582],'181,550 195,551 207,558 218,552 221,542 216,533 225,532 235,536 242,526 253,519 267,519 279,522 286,521 282,541 277,553 269,563 267,579 272,592 282,601 281,610 271,621 268,644 259,656 245,654 239,647 238,611 215,613 201,616 191,604 183,587 177,571')
# The large purple outline is visible; no original game asset is copied.
add('S_PURPLE',[337,556],'301,487 320,488 323,502 335,507 351,511 360,519 366,531 378,541 386,551 394,551 399,558 404,560 407,571 399,575 396,590 387,601 375,604 361,602 344,603 325,602 307,607 296,606 283,612 272,601 269,589 268,575 271,564 280,552 282,533 289,526 293,512 296,503','magenta',True)
add('S_CE',[381,627],'307,607 326,606 348,606 371,607 387,604 393,590 401,578 408,578 414,595 423,611 433,632 439,644 436,653 420,657 403,655 390,650 376,654 365,653 354,657 343,650 333,648 326,631 313,627 303,616')
# All supplied S keyframes carry the same large opaque subtitle. These three
# internal outlines use visible perimeter and a minimal contiguous partition.
add('S_RED',[310,646],'291,613 302,614 315,628 326,632 333,647 344,652 359,659 369,671 353,685 338,692 316,682 303,674 281,673 269,659 279,648 277,635 274,626','red',True)
add('S_GREEN',[293,717],'220,657 240,659 254,654 267,657 280,674 302,677 316,686 338,695 353,689 360,702 356,719 345,732 333,739 318,750 302,759 281,755 266,749 251,736 233,730 215,723 219,714 231,714 232,701 225,693 226,682 219,677','green',True)
add('S_BLUE',[414,700],'373,659 387,653 402,657 419,660 434,657 445,664 455,676 469,680 477,696 486,710 489,723 485,735 473,740 457,738 441,740 426,737 413,741 394,736 380,733 360,728 359,714 363,697 361,683','blue',True)
add('S_SW1',[271,790],'245,740 259,744 270,751 284,756 307,758 307,770 296,779 303,791 305,808 297,816 283,821 281,832 269,843 254,846 247,837 240,836 239,823 232,816 228,800 231,792 224,783 219,783 217,767 222,755 232,750')
add('S_C1',[369,756],'343,733 358,730 380,736 394,739 411,743 421,740 423,749 411,758 402,767 387,767 378,772 366,780 355,785 343,777 332,776 323,770 315,770 321,759 332,750')
add('S_E1',[457,793],'421,744 438,741 455,743 474,742 480,737 491,734 496,737 494,754 497,766 494,782 498,793 494,806 493,821 482,822 471,818 465,826 452,825 441,834 430,844 422,835 415,821 408,817 402,802 400,785 405,773 405,767 414,757')
add('S_C2',[335,810],'314,774 328,779 340,778 353,786 357,798 361,814 367,818 365,834 361,849 342,849 327,846 310,846 299,840 292,829 301,819 310,814 309,799 302,789')
add('S_C3',[394,839],'378,773 389,771 401,774 398,789 400,805 407,817 417,823 422,838 431,850 436,863 428,881 414,885 402,881 386,883 374,873 372,858 365,849 370,833 365,818 369,802 374,795')
add('S_E2',[482,867],'435,844 452,829 465,830 472,822 484,827 493,825 496,843 503,838 507,850 504,869 500,880 500,895 494,905 489,916 478,916 465,910 458,900 446,896 435,895 424,889 431,882 440,864 434,851')
add('S_S1',[315,880],'256,851 270,852 287,840 297,846 311,850 330,850 344,853 366,853 370,865 358,868 350,878 345,892 348,904 341,919 326,921 309,919 298,921 293,908 281,906 274,911 260,910 249,915 244,901 249,889 244,884 250,878 247,868 258,861 249,858')
add('S_S2',[376,911],'359,872 370,870 382,886 398,887 407,893 405,909 411,921 406,933 410,943 418,944 422,953 435,951 436,964 434,977 422,980 412,975 403,978 397,972 387,969 386,978 376,982 362,980 359,967 360,956 351,943 347,930 343,918 352,905 350,890')
add('S_S3',[441,921],'413,895 428,896 440,902 452,903 462,910 474,917 481,931 473,944 461,947 455,956 440,957 433,952 424,956 417,948 408,941 411,931 414,924 410,911')
add('S_SW2',[250,974],'239,909 252,919 266,915 278,913 289,914 293,925 297,938 303,946 300,961 294,968 291,982 295,995 294,1007 284,1013 278,1025 262,1026 251,1021 236,1026 226,1018 215,1020 209,1013 216,1000 210,992 217,982 207,977 214,967 211,955 219,948 212,946 216,938 229,936 233,924 232,918')
add('S_S4',[315,978],'299,923 312,925 329,925 341,925 348,944 355,952 355,971 360,986 355,998 357,1012 350,1015 345,1005 333,1007 330,1017 316,1016 310,1028 299,1022 291,1021 296,1010 300,999 295,983 299,970 306,958 306,944 300,935')
add('S_ISLAND_E',[485,1019],'486,987 501,983 504,990 498,1004 499,1016 494,1025 490,1040 486,1055 474,1055 470,1042 474,1030 472,1016 478,1005 479,996',manual=True)
add('S_ISLAND_S',[244,1117],'223,1105 236,1099 253,1101 268,1105 270,1116 263,1130 254,1135 238,1134 228,1131 217,1136 207,1131 207,1121 213,1111',manual=True)

edges=[
('S_NW','S_N1'),('S_NW','S_MW'),('S_N1','S_N2'),('S_N1','S_MW'),('S_N2','S_N3'),('S_N2','S_M1'),('S_N2','S_MW'),('S_N3','S_M1'),('S_N3','S_PURPLE'),
('S_MW','S_M1'),('S_MW','S_W'),('S_MW','S_C'),('S_M1','S_C'),('S_M1','S_PURPLE'),('S_W','S_C'),('S_W','S_GREEN'),('S_C','S_PURPLE'),('S_C','S_RED'),('S_C','S_GREEN'),
('S_PURPLE','S_RED'),('S_PURPLE','S_CE'),('S_CE','S_RED'),('S_CE','S_BLUE'),('S_RED','S_GREEN'),('S_RED','S_BLUE'),('S_GREEN','S_BLUE'),('S_GREEN','S_SW1'),('S_GREEN','S_C1'),
('S_BLUE','S_C1'),('S_BLUE','S_E1'),('S_SW1','S_C1'),('S_SW1','S_C2'),('S_SW1','S_S1'),('S_C1','S_C2'),('S_C1','S_C3'),('S_C1','S_E1'),('S_E1','S_C3'),('S_E1','S_E2'),
('S_C2','S_C3'),('S_C2','S_S1'),('S_C3','S_E2'),('S_C3','S_S1'),('S_C3','S_S2'),('S_E2','S_S3'),('S_S1','S_S2'),('S_S1','S_SW2'),('S_S1','S_S4'),('S_S2','S_S3'),('S_S2','S_S4'),('S_S3','S_ISLAND_E'),('S_SW2','S_S4'),('S_SW2','S_ISLAND_S'),('S_S4','S_ISLAND_S')]
lookup={n['id']:n for n in nodes}
for a,b in edges:lookup[a]['neighbors'].append(b);lookup[b]['neighbors'].append(a)
# Resolve tiny overlapping hand envelopes. No two game polygons share pixels.
occupied=np.zeros(grey.shape,np.uint8)
for n in nodes:
    mask=np.zeros(grey.shape,np.uint8);p=np.array([[p['x'],p['y']] for p in n['polygons'][0]],np.int32);cv2.fillPoly(mask,[p],255)
    if np.any(mask & occupied):
        mask[cv2.dilate(occupied,np.ones((3,3),np.uint8))>0]=0
        cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        p=max(cs,key=cv2.contourArea)[:,0,:]
        n['polygons']=[[dict(x=int(x),y=int(y)) for x,y in p]]
    cv2.fillPoly(occupied,[p],255)

# Decorative southeast land from visible reference silhouette. The chat icon
# is an interior hole, ignored by RETR_EXTERNAL; this is never a playable node.
back=grey.copy();back[:962]=0;back[:,:410]=0
back=cv2.morphologyEx(back,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
cs,_=cv2.findContours(back,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
background=[]
for c in cs:
    if cv2.contourArea(c)>85:
        p=cv2.approxPolyDP(c,1.8,True)[:,0,:]
        # Exclude the independent playable east island.
        x,y,w,h=cv2.boundingRect(c)
        if y<1060 and x<510:continue
        background.append([dict(x=int(x),y=int(y)) for x,y in p])

data=dict(id='short-reference',width=720,height=1372,nodes=nodes)
(ROOT/'research/map-trace/short-map.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
out="import type { GameMap, Point } from '../sim/types';\n\n/** S source trace; subtitle-obscured central boundaries and start armies are candidates. */\nexport const shortMap: GameMap = "+json.dumps(data,ensure_ascii=False,indent=2)+';\n\n'
out+='/** Decorative southeast geography; never owned or used for battle. */\nexport const shortBackground: Point[][] = '+json.dumps(background)+';\n'
out+="export const shortMapAppearance = { background: '#d1d1d1', decorativeLand: '#969796', neutral: '#969896', blue: '#58c9ed', green: '#4cdfb0', magenta: '#d56bd0', red: '#f55853', territoryBorder: '#d3d3cf' } as const;\n"
(ROOT/'src/maps/short.ts').write_text(out,encoding='utf-8')
pic=Image.open(ROOT/'references/frames/S_000s.jpg').convert('RGBA');ol=Image.new('RGBA',pic.size);d=ImageDraw.Draw(ol)
for n in nodes:
    p=[(p['x'],p['y']) for p in n['polygons'][0]];d.line(p+[p[0]],fill=(230,0,0,255),width=2)
    x,y=n['anchor']['x'],n['anchor']['y'];d.ellipse((x-3,y-3,x+3,y+3),fill=(0,255,0,255));d.text((x+3,y-14),n['id'],fill=(0,0,0,255),stroke_width=1,stroke_fill=(255,255,255,255))
Image.alpha_composite(pic,ol).convert('RGB').save(ROOT/'research/map-trace/S-annotation-overlay.jpg',quality=95)
print('Wrote',len(nodes),'nodes;',sum(len(n['polygons'][0]) for n in nodes),'vertices;',len(background),'decorative shapes')
