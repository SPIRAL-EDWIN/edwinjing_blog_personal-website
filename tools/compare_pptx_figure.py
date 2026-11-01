#!/usr/bin/env python3
"""Compare an OOXML reference with an SVG draft; incomplete evidence is a failure.

R1 is read by reference_from_ooxml directly from the PPTX. R2 must be a full-slide
PowerPoint/Keynote raster at 3 pixels/point. No original PowerPoint material is
written into the published site. This tool does not pretend pixel segmentation
can isolate overlapping objects; unmeasured requirements remain explicit.
"""
import argparse, json, math, re, subprocess, tempfile, xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageChops
from reference_from_ooxml import build_reference

NS={'s':'http://www.w3.org/2000/svg'}
ROOT=Path(__file__).resolve().parent.parent
NUM=r'[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?'
def tag(x): return x.tag.rsplit('}',1)[-1]
def f(x,k,d=0): return float(x.get(k,d))
def box(el):
    if tag(el) in ('rect','image','svg'):
        return [f(el,'x'),f(el,'y'),f(el,'width'),f(el,'height')]
    if tag(el)=='polygon':
        n=[float(x) for x in re.findall(NUM,el.get('points',''))]; xs=n[::2]; ys=n[1::2]
        if xs and ys:return [min(xs),min(ys),max(xs)-min(xs),max(ys)-min(ys)]
    return None
def pts(path):
    # Accept only absolute M/L/H/V geometry; reject curves, transformations and markers.
    d=path.get('d',''); toks=re.findall(r'[A-Za-z]|'+NUM,d); commands=[x for x in toks if x.isalpha()]
    if any(c not in ('M','L','H','V') for c in commands):return None
    result=[]; mode=None; x=y=0.; i=0
    try:
        while i<len(toks):
            if toks[i].isalpha():mode=toks[i];i+=1
            if mode in ('M','L'):x=float(toks[i]);y=float(toks[i+1]);i+=2;mode='L'
            elif mode=='H':x=float(toks[i]);i+=1
            elif mode=='V':y=float(toks[i]);i+=1
            else:return None
            result.append([x,y])
    except (ValueError,IndexError):return None
    return result

def screenshot(svg, outfile, width, height):
    node='/Users/edwin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
    mod='/Users/edwin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
    source='''const {chromium}=require(process.argv[1]); (async()=>{const b=await chromium.launch({headless:true,executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'}); const p=await b.newPage({viewport:{width:+process.argv[4],height:+process.argv[5]},deviceScaleFactor:1}); await p.goto(process.argv[2]); await p.locator('svg').first().screenshot({path:process.argv[3],animations:'disabled'}); await b.close()})().catch(e=>{console.error(e);process.exit(1)});'''
    subprocess.run([node,'-e',source,mod,svg.resolve().as_uri(),str(outfile.resolve()),str(width),str(height)],check=True,timeout=60)

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--source',type=Path,default=ROOT/'sandbox/figure-sources/bipedalwbc/source.pptx');a.add_argument('--svg',required=True,type=Path);a.add_argument('--r2',type=Path,default=ROOT/'output/fidelity/reference/powerpoint.png');a.add_argument('--out',required=True,type=Path);a.add_argument('--rendered-png',type=Path,help='Pre-rendered SVG at 3px/pt; otherwise use Edge/Playwright');args=a.parse_args()
    out=args.out;out.mkdir(parents=True,exist_ok=True); ref=build_reference(args.source); root=ET.parse(args.svg).getroot()
    view=[float(x) for x in root.get('viewBox','').replace(',',' ').split()];
    if len(view)!=4:raise ValueError('SVG must supply a four-number viewBox')
    groups=[x for x in root.iter() if x.get('data-el','').startswith('pptx-')]; byid={x.get('data-el'):x for x in groups}; reports=[]
    expected=[f"pptx-{x['id']}" for x in ref['elements']]; actual=[x.get('data-el') for x in groups]
    for item in ref['elements']:
        ident=f"pptx-{item['id']}"; g=byid.get(ident); row={'id':item['id'],'kind':item['kind'],'status':'partial','issues':[]}
        if g is None:row['status']='fail';row['issues'].append('missing SVG element');reports.append(row);continue
        direct=list(g); shape=next((e for e in direct if tag(e) in ('rect','image','svg','polygon')),None)
        if item['kind']=='cxnSp':
            path=next((e for e in direct if tag(e)=='path'),None); observed=pts(path) if path is not None and not path.get('transform') and not g.get('transform') else None; target=item.get('points_pt',[])
            heads=[e for e in direct if tag(e)=='path' and e is not path]
            triangle=None
            if heads:
                d=heads[0].get('d',''); values=[float(t) for t in re.findall(NUM,d)]
                if len(values)==6 and re.fullmatch(r'[MLZmlz0-9eE+.,\s-]+',d):triangle=[values[0:2],values[2:4],values[4:6]]
            if triangle and observed and len(observed)==len(target):
                tip,left,right=triangle; row['arrow_tip_delta_pt']=math.dist(tip,target[-1]); row['arrow_base_width_pt']=math.dist(left,right)
                midpoint=[(left[j]+right[j])/2 for j in (0,1)]; row['arrow_length_pt']=math.dist(tip,midpoint); row['stroke_end_to_base_delta_pt']=math.dist(observed[-1],midpoint)
                observed[-1]=tip
                if row['arrow_tip_delta_pt']>.05:row['issues'].append('arrow tip tolerance exceeded')
                if row['stroke_end_to_base_delta_pt']>.05:row['issues'].append('stroke does not terminate at arrow base')
            else:row['issues'].append('explicit three-point arrowhead not measurable')
            if observed is None or len(observed)!=len(target):row['issues'].append('connector path missing, transformed, unsupported or vertex count differs')
            else:row['vertex_max_delta_pt']=max(math.dist(p,q) for p,q in zip(observed,target));row['issues'] += ['vertex tolerance exceeded'] if row['vertex_max_delta_pt']>.05 else []
            if path is not None and (path.get('marker-end') or path.get('marker-start')):row['issues'].append('shared marker used; explicit arrowhead required')
            row['issues'].append('arrow tip/base/length and stroke termination not independently measured')
        elif shape is None:row['issues'].append('no directly measurable shape box')
        elif shape.get('transform') or g.get('transform'):row['issues'].append('transformed SVG geometry not independently measured')
        else:
            observed=box(shape); target=item['box_pt']
            clip=shape.get('clip-path',''); match=re.fullmatch(r'url\(#([^)]*)\)',clip)
            if match:
                owner=next((e for e in root.iter() if e.get('id')==match.group(1)),None)
                clipped=next((box(e) for e in owner if box(e) is not None),None) if owner is not None else None
                if clipped is None: row['issues'].append('clip window not measurable')
                else: observed=clipped;row['box_measure']='clip window (not image source mapping)'
            if observed is not None:
                row['box_delta_pt']=[round(abs(p-q),6) for p,q in zip(observed,target)]
                if max(row['box_delta_pt'])>.1:row['issues'].append('box tolerance exceeded')
        if item.get('preset')=='trapezoid': row['issues'].append('trapezoid corners not independently measured')
        if any(p.get('runs') for p in item.get('text',{}).get('paragraphs',[])):row['issues'].append('text baseline, ink edges and font metrics not independently measured')
        if item['kind']=='pic':row['issues'].append('image or glyph crop ink bounds not independently measured')
        row['issues'].append('stroke/fill and visual occlusion not independently measured')
        reports.append(row)
    result={'pass':False,'summary':'NOT VERIFIED: incomplete numeric and visual segmentation evidence is a failure, irrespective of apparent similarity.', 'paint_order_matches':actual==expected,'duplicate_svg_ids':sorted({v for v in actual if actual.count(v)>1}),'expected_count':len(expected),'actual_count':len(actual),'viewBox':view,'elements':reports,'unverified':['PowerPoint arrowhead size','text baselines and ink edges','individual image and glyph ink bounds','stroke/color equivalence','hidden origin actual opacity','residual connected components outside antialiasing']}
    if args.r2.exists():
        image=Image.open(args.r2).convert('RGB');sx=image.width/ref['slide_pt'][0];sy=image.height/ref['slide_pt'][1]
        if abs(sx-3)>.01 or abs(sy-3)>.01:raise ValueError(f'R2 must be 3px/pt: actual {sx:g}x{sy:g}')
        x,y,w,h=view;crop=image.crop((round(x*sx),round(y*sy),round((x+w)*sx),round((y+h)*sy)));crop.save(out/'reference-crop.png')
        try:
            if args.rendered_png: render=Image.open(args.rendered_png).convert('RGB')
            else:
                screenshot(args.svg,out/'render.png',round(w*3),round(h*3));render=Image.open(out/'render.png').convert('RGB')
            if render.size!=crop.size:result['raster_error']=f'Size mismatch: SVG {render.size}, reference {crop.size}; no resampling performed'
            else:
                red=crop.convert('L');cyan=render.convert('L');Image.merge('RGB',(red,cyan,cyan)).save(out/'overlay.png')
                diff=ImageChops.difference(crop,render);diff.save(out/'diff.png')
                ranked=[]
                for item in ref['elements']:
                    bx,by,bw,bh=item['box_pt']; region=(max(0,round((bx-x)*3)),max(0,round((by-y)*3)),min(crop.width,round((bx+bw-x)*3)),min(crop.height,round((by+bh-y)*3)))
                    if region[2]<=region[0] or region[3]<=region[1]:continue
                    d=diff.crop(region).convert('L');hist=d.histogram(); score=sum(i*n for i,n in enumerate(hist))/(d.width*d.height)
                    ranked.append({'id':item['id'],'mean_absolute_diff':round(score,3),'region_px':region})
                ranked.sort(key=lambda v:v['mean_absolute_diff'],reverse=True);result['worst_regions']=ranked[:20]
                for entry in ranked[:20]:diff.crop(entry['region_px']).save(out/f"worst-{entry['id']}.png")
                result['raster_note']='Difference is diagnostic only; includes overlapping elements, font differences and antialiasing; no tolerance claimed.'
        except (OSError,subprocess.SubprocessError) as exc:result['raster_error']=str(exc)
    else:result['raster_error']='R2 reference raster not found'
    (out/'report.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f"{out/'report.json'}: {'PASS' if result['pass'] else 'NOT VERIFIED / FAIL'}")
    return 0 if result['pass'] else 1
if __name__=='__main__':raise SystemExit(main())
