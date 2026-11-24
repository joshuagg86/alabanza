"""Generate launcher icon density variants from icono-512.png.
Uses the user's square ICEGH logo as the source. Only run when source exists."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

source=Path('icono-512.png')
if not source.is_file():
    print('Launcher icon source not uploaded yet; keeping Capacitor placeholders.')
    raise SystemExit(0)
base=Image.open(source).convert('RGBA')
if base.size != (512,512):
    raise SystemExit('icono-512.png must be 512 x 512')
res=Path('android/app/src/main/res')
bg=base.getpixel((0,0))[:3]
sizes={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
for density,size in sizes.items():
    path=res/f'mipmap-{density}'
    path.mkdir(parents=True,exist_ok=True)
    square=ImageOps.fit(base,(size,size),method=Image.Resampling.LANCZOS)
    square.save(path/'ic_launcher.png')
    circle=Image.new('RGBA',(size,size),(0,0,0,0))
    mask=Image.new('L',(size,size),0)
    ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
    circle.paste(square,(0,0),mask)
    circle.save(path/'ic_launcher_round.png')
    # Adaptive launcher foreground: transparent artwork on centered safe zone.
    # Use original navy background to create the background layer separately.
    foreground=Image.new('RGBA',(size,size),(0,0,0,0))
    art=base.copy()
    px=art.load()
    for y in range(art.height):
        for x in range(art.width):
            r,g,b,a=px[x,y]
            if abs(r-bg[0])<10 and abs(g-bg[1])<10 and abs(b-bg[2])<10:
                px[x,y]=(r,g,b,0)
    bbox=art.getbbox()
    if bbox:
        art=art.crop(bbox)
        limit=round(size*0.62)
        art.thumbnail((limit,limit),Image.Resampling.LANCZOS)
        foreground.alpha_composite(art,((size-art.width)//2,(size-art.height)//2))
    foreground.save(path/'ic_launcher_foreground.png')
    Image.new('RGB',(size,size),bg).save(path/'ic_launcher_background.png')
print('Android launcher assets generated for five density buckets.')
