#!/usr/bin/env python3
"""Generate WorkTrack web/PWA raster assets. Requires macOS Swift/AppKit and ImageMagick 7."""
from pathlib import Path
import subprocess
import tempfile
import sys
ROOT=Path(__file__).resolve().parent.parent
subprocess.run([sys.executable,str(ROOT/'scripts/generate-brand-layers.py')],check=True)
PUBLIC=ROOT/'apps/frontend/public'
with tempfile.TemporaryDirectory(prefix='worktrack-brand-') as temp:
    temp=Path(temp)
    helper=temp/'render.swift'
    helper.write_text('''import AppKit
let source = CommandLine.arguments[1]
let target = CommandLine.arguments[2]
guard let image = NSImage(contentsOfFile: source) else { fatalError("Cannot load SVG") }
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
image.draw(in: NSRect(x: 0, y: 0, width: 1024, height: 1024), from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: target))
''')
    def render(source,dest):
        subprocess.run(['swift','-module-cache-path',str(temp/'cache'),str(helper),str(source),str(dest)],check=True)
    normal=temp/'normal.png';render(PUBLIC/'brand.svg',normal)
    maskable_svg=temp/'maskable.svg'
    layers=ROOT/'assets/app-icon'
    import xml.etree.ElementTree as E
    ns='{http://www.w3.org/2000/svg}'
    r=E.parse(layers/'master/background.svg').getroot()
    fg=E.parse(layers/'master/foreground.svg').getroot()
    # Keep meaningful art inside maskable safe circle; solid base fills every pixel.
    g=E.Element(ns+'g',{'transform':'translate(128 128) scale(.72) translate(-128 -128)'})
    for el in list(r)[2:]:r.remove(el);g.append(el)
    for el in fg:
        if el.tag!=ns+'title':g.append(el)
    r.append(g);E.ElementTree(r).write(maskable_svg)
    maskable=temp/'maskable.png';render(maskable_svg,maskable)
    for name,size,source in [('pwa-192.png',192,normal),('pwa-512.png',512,normal),('apple-touch-icon.png',180,normal),('pwa-maskable-512.png',512,maskable)]:
        subprocess.run(['magick',str(source),'-resize',f'{size}x{size}','-strip',str(PUBLIC/name)],check=True)
    subprocess.run(['magick',str(normal),'-define','icon:auto-resize=64,48,32,16',str(PUBLIC/'favicon.ico')],check=True)
print('Generated web/PWA icons; no deployment.')
