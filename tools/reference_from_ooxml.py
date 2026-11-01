#!/usr/bin/env python3
"""Independent numeric slide reference read directly from OOXML, not the renderer.

This is geometry and source metadata, not an assertion of PowerPoint text metrics.
"""
import argparse
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

N = {'p':'http://schemas.openxmlformats.org/presentationml/2006/main',
     'a':'http://schemas.openxmlformats.org/drawingml/2006/main',
     'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
EMU_PER_PT = 12700

def local(tag):
    return tag.rsplit('}', 1)[-1]

def attrs(element):
    return dict(element.attrib) if element is not None else {}

def num(element, key, default=0):
    return float(element.get(key, default)) if element is not None else float(default)

def color(element):
    if element is None:
        return None
    for child in element:
        if local(child.tag) in ('srgbClr', 'schemeClr', 'sysClr', 'prstClr'):
            return {'type': local(child.tag), 'value': child.get('val'),
                    'modifiers': {local(x.tag): x.get('val') for x in child}}
    return None

def build_reference(source):
    with ZipFile(source) as archive:
        slide = ET.fromstring(archive.read('ppt/slides/slide1.xml'))
        pres = ET.fromstring(archive.read('ppt/presentation.xml'))
        theme = ET.fromstring(archive.read('ppt/theme/theme1.xml'))
        rels = ET.fromstring(archive.read('ppt/slides/_rels/slide1.xml.rels'))
        relationships = {r.get('Id'): r.get('Target') for r in rels}
    size = pres.find('p:sldSz', N)
    colors = {}
    scheme = theme.find('.//a:clrScheme', N)
    for slot in scheme if scheme is not None else []:
        child = next(iter(slot), None)
        if child is not None:
            colors[local(slot.tag)] = child.get('lastClr') or child.get('val')
    line_styles = []
    stylelist = theme.find('.//a:fmtScheme/a:lnStyleLst', N)
    for line in stylelist if stylelist is not None else []:
        line_styles.append({'width_pt': num(line, 'w') / EMU_PER_PT,
                            'color': color(line.find('a:solidFill', N)),
                            'dash': attrs(line.find('a:prstDash', N)).get('val')})
    elements = []
    def visit(parent, transform=(1.,1.,0.,0.)):
        sx, sy, tx, ty = transform
        for el in parent:
            kind = local(el.tag)
            if kind not in ('sp', 'pic', 'cxnSp', 'grpSp'):
                continue
            nv = el.find('.//p:cNvPr', N)
            xf = el.find('./p:grpSpPr/a:xfrm', N) if kind == 'grpSp' else el.find('./p:spPr/a:xfrm', N)
            if xf is None or nv is None:
                continue
            off, ext = xf.find('a:off', N), xf.find('a:ext', N)
            x,y,w,h = num(off,'x'),num(off,'y'),num(ext,'cx'),num(ext,'cy')
            if kind == 'grpSp':
                co,ce=xf.find('a:chOff',N),xf.find('a:chExt',N)
                gx,gy=w/num(ce,'cx',1),h/num(ce,'cy',1)
                visit(el,(sx*gx,sy*gy,tx+sx*(x-num(co,'x')*gx),ty+sy*(y-num(co,'y')*gy)))
                continue
            rotation=num(xf,'rot')/60000
            raw=[(tx+sx*x)/EMU_PER_PT,(ty+sy*y)/EMU_PER_PT,sx*w/EMU_PER_PT,sy*h/EMU_PER_PT]
            # Rotation is evaluated in the child's frame before group scaling.
            if round(rotation)%180 == 90:
                vx=x+(w-h)/2; vy=y+(h-w)/2; vw,vh=h,w
            else:
                vx,vy,vw,vh=x,y,w,h
            visual=[(tx+sx*vx)/EMU_PER_PT,(ty+sy*vy)/EMU_PER_PT,sx*vw/EMU_PER_PT,sy*vh/EMU_PER_PT]
            sp=el.find('p:spPr',N); geom=sp.find('a:prstGeom',N) if sp is not None else None
            adj={g.get('name'):g.get('fmla') for g in geom.findall('a:avLst/a:gd',N)} if geom is not None else {}
            line=sp.find('a:ln',N) if sp is not None else None
            body=el.find('.//a:bodyPr',N)
            paragraphs=[]
            for para in el.findall('.//a:p',N):
                runs=[]
                for run in para:
                    if local(run.tag) not in ('r','fld','br'): continue
                    prop=run.find('a:rPr',N); text=run.find('a:t',N)
                    runs.append({'text':text.text if text is not None and text.text else '',
                                 'properties':attrs(prop),'latin':attrs(prop.find('a:latin',N)) if prop is not None else {},
                                 'color':color(prop.find('a:solidFill',N)) if prop is not None else None})
                paragraphs.append({'properties':attrs(para.find('a:pPr',N)), 'runs':runs})
            bodyprops=attrs(body)
            insets={k:int(bodyprops.get(k, default))/EMU_PER_PT for k,default in
                    [('lIns',91440),('rIns',91440),('tIns',45720),('bIns',45720)]}
            crop=attrs(el.find('.//a:srcRect',N))
            blip=el.find('.//a:blip',N)
            embedded=blip.get('{%s}embed'%N['r']) if blip is not None else None
            alt=el.find('.//{http://schemas.microsoft.com/office/drawing/2016/SVG/main}svgBlip')
            if alt is not None: embedded=alt.get('{%s}embed'%N['r'])
            item={'id':int(nv.get('id')),'name':nv.get('name',''),'z':len(elements)+1,'kind':kind,
                  'box_pt':visual,'raw_box_pt':raw,'rotation':rotation,'flipH':xf.get('flipH')=='1','flipV':xf.get('flipV')=='1',
                  'preset':geom.get('prst') if geom is not None else None,'adjustments':adj,
                  'fill':color(sp.find('a:solidFill',N)) if sp is not None else None,
                  'no_fill':sp is not None and sp.find('a:noFill',N) is not None,
                  'gradient_xml':ET.tostring(sp.find('a:gradFill',N),encoding='unicode') if sp is not None and sp.find('a:gradFill',N) is not None else None,
                  'stroke':{'width_pt':num(line,'w')/EMU_PER_PT if line is not None and line.get('w') else None,
                            'no_fill':line is not None and line.find('a:noFill',N) is not None,
                            'color':color(line.find('a:solidFill',N)) if line is not None else None,
                            'dash':attrs(line.find('a:prstDash',N)).get('val') if line is not None else None,
                            'head':attrs(line.find('a:headEnd',N)) if line is not None else {},
                            'tail':attrs(line.find('a:tailEnd',N)) if line is not None else {}},
                  'text':{'body':bodyprops,'insets_pt':insets,'paragraphs':paragraphs},
                  'crop':{k:int(v) for k,v in crop.items()},'media':relationships.get(embedded),
                  'connections':{k:attrs(el.find('.//a:'+k,N)) for k in ('stCxn','endCxn')}}
            if kind=='cxnSp':
                def av(key,default): return float(adj.get(key,'val '+str(default)).split()[-1])/100000
                a,b,c=av('adj1',50000),av('adj2',50000),av('adj3',50000)
                paths={'line':[(0,0),(1,1)],'straightConnector1':[(0,0),(1,1)],'bentConnector2':[(0,0),(1,0),(1,1)],'bentConnector3':[(0,0),(a,0),(a,1),(1,1)],'bentConnector5':[(0,0),(a,0),(a,b),(c,b),(c,1),(1,1)]}
                if item['preset'] not in paths: raise ValueError('Unsupported connector: '+str(item['preset']))
                theta=math.radians(rotation); co,si=math.cos(theta),math.sin(theta)
                pts=[]
                for u,v in paths[item['preset']]:
                    if item['flipH']: u=1-u
                    if item['flipV']: v=1-v
                    dx=(u-.5)*w; dy=(v-.5)*h
                    pts.append([(tx+sx*(x+w/2+dx*co-dy*si))/EMU_PER_PT,
                                (ty+sy*(y+h/2+dx*si+dy*co))/EMU_PER_PT])
                item['points_pt']=pts
                if item['stroke']['width_pt'] is None:
                    ref=el.find('./p:style/a:lnRef',N)
                    idx=int(ref.get('idx','1')) if ref is not None else 1
                    if 1 <= idx <= len(line_styles): item['stroke']['width_pt']=line_styles[idx-1]['width_pt']
            elements.append(item)
    visit(slide.find('.//p:spTree',N))
    return {'slide_pt':[num(size,'cx')/EMU_PER_PT,num(size,'cy')/EMU_PER_PT],
            'theme_colors':colors,'theme_line_styles':line_styles,'elements':elements}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', default='sandbox/figure-sources/bipedalwbc/source.pptx')
    p.add_argument('--output', type=Path)
    args=p.parse_args(); data=build_reference(args.source)
    result=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(result,encoding='utf-8')
    else: print(result,end='')
if __name__=='__main__': main()
