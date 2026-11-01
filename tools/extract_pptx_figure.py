#!/usr/bin/env python3
"""Extract fixed geometry from the co-authored source slide; never copy PPTX into docs."""
import argparse, json, zipfile, posixpath
from pathlib import Path
from lxml import etree
from pptx import Presentation
EMU=12700
NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
P='{%s}'%NS['p']; A='{%s}'%NS['a']; R='{%s}'%NS['r']
def val(el,key,default=0): return float(el.get(key,default)) if el is not None else float(default)
def color(el):
 if el is None:return None
 for child in el:
  tag=etree.QName(child).localname
  if tag in ('srgbClr','schemeClr','sysClr','prstClr'):
   return {'type':tag,'value':child.get('val'),'modifiers':{etree.QName(c).localname:c.get('val') for c in child}}
 return None
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',default='sandbox/figure-sources/bipedalwbc/source.pptx');ap.add_argument('--output',default='docs/assets/data/project-figures/bipedalwbc.json');args=ap.parse_args()
 prs=Presentation(args.source)
 with zipfile.ZipFile(args.source) as z:
  root=etree.fromstring(z.read('ppt/slides/slide1.xml')); relroot=etree.fromstring(z.read('ppt/slides/_rels/slide1.xml.rels'))
  rels={x.get('Id'):posixpath.basename(x.get('Target','')) for x in relroot}
  output=[]
  def walk(parent,m=(1,1,0,0)):
   for el in parent:
    tag=etree.QName(el).localname
    if tag not in ('sp','pic','cxnSp','grpSp'):continue
    nv=el.find('.//p:cNvPr',NS); ident=int(nv.get('id'));name=nv.get('name','')
    x=el.find('./p:grpSpPr/a:xfrm',NS) if tag=='grpSp' else el.find('./p:spPr/a:xfrm',NS)
    if x is None:continue
    off=x.find('a:off',NS);ext=x.find('a:ext',NS); ox,oy=val(off,'x'),val(off,'y');w,h=val(ext,'cx'),val(ext,'cy');sx,sy,tx,ty=m
    if tag=='grpSp':
     co=x.find('a:chOff',NS);ce=x.find('a:chExt',NS);cx,cy=val(co,'x'),val(co,'y');cw,ch=val(ce,'cx',1),val(ce,'cy',1)
     walk(el,(sx*w/cw,sy*h/ch,tx+sx*(ox-cx*w/cw),ty+sy*(oy-cy*h/ch)));continue
    X,Y,W,H=(tx+sx*ox)/EMU,(ty+sy*oy)/EMU,sx*w/EMU,sy*h/EMU
    rot=val(x,'rot')/60000; visual=[X,Y,W,H]
    if round(rot)%180==90:visual=[X+(W-H)/2,Y+(H-W)/2,H,W]
    sp=el.find('p:spPr',NS);geom=sp.find('a:prstGeom',NS) if sp is not None else None
    adjustments={v.get('name'):v.get('fmla') for v in geom.findall('a:avLst/a:gd',NS)} if geom is not None else {}
    ln=sp.find('a:ln',NS) if sp is not None else None;fill=sp.find('a:solidFill',NS) if sp is not None else None
    runs=[]
    for rr in el.xpath('.//a:r|.//a:fld',namespaces=NS):
     rp=rr.find('a:rPr',NS);t=rr.find('a:t',NS);latin=rp.find('a:latin',NS) if rp is not None else None
     runs.append({'text':t.text if t is not None and t.text else '', 'font':latin.get('typeface') if latin is not None else None,'size_pt':val(rp,'sz')/100 if rp is not None and rp.get('sz') else None,'bold':rp.get('b')=='1' if rp is not None else False,'color':color(rp.find('a:solidFill',NS)) if rp is not None else None})
    blip=el.find('.//a:blip',NS); rid=blip.get(R+'embed') if blip is not None else None; svgblip=el.xpath('.//*[local-name()="svgBlip"]'); rid=(svgblip[0].get(R+'embed') if svgblip else rid); crop=el.find('.//a:srcRect',NS)
    bodypr=el.find('.//a:bodyPr',NS); pars=el.findall('.//a:p',NS); text_layout={'body':dict(bodypr.attrib) if bodypr is not None else {}, 'paragraphs':[dict(q.find('a:pPr',NS).attrib) if q.find('a:pPr',NS) is not None else {} for q in pars]}
    item={'text_layout':text_layout,'id':ident,'name':name,'z':len(output)+1,'kind':{'sp':'shape','pic':'picture','cxnSp':'connector'}[tag], 'box_pt':[round(q,6) for q in visual],'raw_box_pt':[round(q,6) for q in (X,Y,W,H)],'rotation':rot,'flipH':x.get('flipH')=='1','flipV':x.get('flipV')=='1','geometry':geom.get('prst') if geom is not None else None,'adjustments':adjustments,'fill':color(fill),'no_fill':sp is not None and sp.find('a:noFill',NS) is not None,'gradient':etree.tostring(sp.find('a:gradFill',NS),encoding='unicode') if sp is not None and sp.find('a:gradFill',NS) is not None else None,'stroke':{'no_fill':ln.find('a:noFill',NS) is not None,'color':color(ln.find('a:solidFill',NS)),'width_pt':val(ln,'w')/EMU if ln is not None and ln.get('w') else None,'dash':ln.find('a:prstDash',NS).get('val') if ln is not None and ln.find('a:prstDash',NS) is not None else None,'head':ln.find('a:headEnd',NS).get('type') if ln is not None and ln.find('a:headEnd',NS) is not None else None,'tail':ln.find('a:tailEnd',NS).get('type') if ln is not None and ln.find('a:tailEnd',NS) is not None else None} if ln is not None else None,'text_runs':runs,'media':rels.get(rid),'crop':{k:int(v) for k,v in crop.attrib.items()} if crop is not None else {},'stCxn':None,'endCxn':None}
    for k in ('stCxn','endCxn'):
     c=el.find('.//a:'+k,NS)
     if c is not None:item[k]={'id':int(c.get('id')),'idx':int(c.get('idx'))}
    if tag=='cxnSp':
     item['stroke']['width_pt']=1.5
     if item['stroke']['color'] is None: item['stroke']['color']={'type':'schemeClr','value':'dk1','modifiers':{}}
     item['edge_kind']='update' if ident in (112,67,83) else ('feedback' if ident in (39,106) else 'data')
     def adj(key,default):
      q=adjustments.get(key,'val '+str(default));return float(q.split()[-1])/100000
     g=item['geometry'];a1=adj('adj1',50000);a2=adj('adj2',50000);a3=adj('adj3',50000)
     coords={'line':[(0,0),(1,1)],'straightConnector1':[(0,0),(1,1)],'bentConnector2':[(0,0),(1,0),(1,1)],'bentConnector3':[(0,0),(a1,0),(a1,1),(1,1)],'bentConnector5':[(0,0),(a1,0),(a1,a2),(a3,a2),(a3,1),(1,1)]}.get(g,[(0,0),(1,1)])
     import math
     ang=math.radians(rot);cs,sn=math.cos(ang),math.sin(ang)
     pts=[]
     for u,v in coords:
      if item['flipH']:u=1-u
      if item['flipV']:v=1-v
      dx=(u-.5)*W;dy=(v-.5)*H
      pts.append([round(X+W/2+dx*cs-dy*sn,6),round(Y+H/2+dx*sn+dy*cs,6)])
     item['points_pt']=pts
    output.append(item)
  walk(root.find('.//p:spTree',NS))
 data={'schema':'pptx-fixed-geometry-v1','slide_pt':[prs.slide_width/EMU,prs.slide_height/EMU], 'elements':output}
 path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
