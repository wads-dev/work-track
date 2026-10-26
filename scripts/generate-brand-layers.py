#!/usr/bin/env python3
"""Generate aligned layers from the approved canonical icon. No publishing."""
import argparse
from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET
NS='http://www.w3.org/2000/svg'
ET.register_namespace('',NS)
def tag(n): return '{'+NS+'}'+n
def kind(e): return e.tag.rsplit('}',1)[-1]
STYLE=('fill','fill-rule','fill-opacity','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-opacity')
def flatten(e, inherited=None):
    e=deepcopy(e); styles=dict(inherited or {})
    for key in STYLE:
        if key in e.attrib: styles[key]=e.get(key)
    if kind(e)=='g':
        for key in STYLE: e.attrib.pop(key,None)
        e[:]=[flatten(c,styles) for c in e]
    elif kind(e) in ('path','rect','circle'):
        for key,value in styles.items(): e.set(key,value)
    return e

def generate(source, dest, app, check=False):
    root=ET.parse(source).getroot()
    art=[deepcopy(e) for e in root if kind(e) not in ('title','desc')]
    assert root.get('viewBox')=='0 0 256 256'
    background_group=art.pop(0)
    assert kind(background_group)=='g' and len(background_group)==2
    rect,signature=map(deepcopy,background_group)
    color=rect.get('fill')
    full=deepcopy(rect);full.attrib={'x':'0','y':'0','width':'256','height':'256','fill':color}
    if app=='android2mac':
        assert len(art)==2
        devices,signal=art
        signal=flatten(signal)
        white_signal=ET.Element(tag('g')); accent_signal=ET.Element(tag('g'))
        for e in signal:
            (white_signal if e.get('stroke')=='#FFF8FD' else accent_signal).append(e)
        white=[flatten(devices),white_signal]; accent=[accent_signal]
    elif app=='client':
        assert len(art)==1
        group=art[0]; paths=list(group[0]);assert len(paths)==3
        white_group=deepcopy(group);white_group[0][:]=paths[:2]
        accent_group=deepcopy(group);accent_group[0][:]=paths[2:]
        white=[white_group];accent=[accent_group]
    else:
        assert app=='worktrack' and len(art)==4
        defs,body,document,point=art
        assert kind(defs)=='defs' and body.get('mask')
        white=[defs,body];accent=[document,point]
    white=list(map(flatten,white));accent=list(map(flatten,accent))
    def group(parts,transform):
        g=ET.Element(tag('g'),{'transform':transform});g.extend(deepcopy(parts));return g
    def output(name,parts,view='0 0 256 256'):
        svg=ET.Element(tag('svg'),{'width':'1024','height':'1024','viewBox':view,'role':'img'})
        ET.SubElement(svg,tag('title')).text=app+' — '+name
        svg.extend(deepcopy(parts));ET.indent(svg)
        data=ET.tostring(svg,encoding='utf-8',xml_declaration=True)
        path=dest/(name+'.svg')
        if check:
            if not path.exists() or path.read_bytes()!=data: raise ValueError('Stale layer: '+str(path))
        else:
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    output('master/background',[full,signature])
    output('master/foreground',white+accent)
    output('master/composite',[full,signature]+white+accent)
    output('apple/background',[full,signature])
    output('apple/01-white',white)
    output('apple/02-accent',accent)
    output('apple/foreground',white+accent)
    output('apple/composite',[full,signature]+white+accent)
    output('apple/00-signature',[signature])
    # Android launcher art is reduced uniformly for its native safe zone.
    scale=4.7/6.1 if app=='client' else .60
    tr='translate(128 128) scale('+str(scale)+') translate(-128 -128)'
    asig=group([signature],tr);afg=group(white+accent,tr)
    # Preserve Client store tooling's existing 1024-unit coordinate contract.
    def android_output(name,parts):
        if app=='client': output(name,[group(parts,'scale(4)')],'0 0 1024 1024')
        else: output(name,parts)
    android_output('android/background',[full,asig])
    android_output('android/foreground',[afg])
    android_output('android/composite',[full,asig,afg])
    mono=deepcopy(afg)
    def monochrome(e,in_defs=False):
        in_defs=in_defs or kind(e) in ('defs','mask','clipPath')
        if not in_defs:
            for attr in ('fill','stroke'):
                if attr in e.attrib and e.get(attr)!='none':e.set(attr,'#FFFFFF')
        for child in e:monochrome(child,in_defs)
    monochrome(mono);android_output('android/monochrome',[mono])
    if app=='client':
        output('apple/01-mark',white)
    if app=='android2mac':
        output('macos/01-wads-signature',[signature])
        output('macos/02-devices',white)
        output('macos/03-transmission',accent)
    print(('Verified' if check else 'Generated')+' layers for '+app)
    return color

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    root=Path(__file__).resolve().parent.parent
    config=__import__('json').loads((root/'assets/brand-config.json').read_text())
    generate(root/config['source'],root/config['layers'],config['app'],args.check)
if __name__=='__main__':main()
