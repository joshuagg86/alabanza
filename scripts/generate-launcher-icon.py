"""Create Android icons with ICEGH navy background on every launcher shape."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
source = Path('icono-512.png')
if not source.exists():
    raise SystemExit('Missing icono-512.png: stop build rather than ship a placeholder.')
base = Image.open(source).convert('RGBA')
if base.size != (512, 512):
    raise SystemExit('icono-512.png must be 512x512.')
navy = base.getpixel((0, 0))[:3]  # user-supplied blue background
res = Path('android/app/src/main/res')
density_sizes = {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
for density, size in density_sizes.items():
    directory = res / f'mipmap-{density}'
    directory.mkdir(parents=True, exist_ok=True)
    square = ImageOps.fit(base,(size,size),method=Image.Resampling.LANCZOS)
    square.save(directory/'ic_launcher.png')
    mask = Image.new('L',(size,size),0)
    ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
    circular = Image.new('RGBA',(size,size),(0,0,0,0))
    circular.paste(square,(0,0),mask)
    circular.save(directory/'ic_launcher_round.png')
# Adaptive icons are rendered over the user's NAVY color, not the stock white Android layer.
# A 432x432 foreground with a centered 240x240 mark stays inside the round safe zone.
art = base.copy()
pixels = art.load()
for y in range(art.height):
    for x in range(art.width):
        red,green,blue,alpha = pixels[x,y]
        distance = max(abs(red-navy[0]),abs(green-navy[1]),abs(blue-navy[2]))
        if distance <= 18:
            pixels[x,y]=(red,green,blue,0)
        elif distance < 32:
            pixels[x,y]=(red,green,blue,round(alpha*(distance-18)/14))
bounds = art.getbbox()
if not bounds: raise SystemExit('No visible logo found in the supplied image.')
mark = art.crop(bounds)
mark.thumbnail((235,235),Image.Resampling.LANCZOS)
foreground = Image.new('RGBA',(432,432),(0,0,0,0))
foreground.alpha_composite(mark,((432-mark.width)//2,(432-mark.height)//2))
drawable = res/'drawable-nodpi'
drawable.mkdir(parents=True,exist_ok=True)
foreground.save(drawable/'icegh_adaptive_foreground.png')
values = res/'values'
values.mkdir(parents=True,exist_ok=True)
(values/'icegh_icon_color.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="icegh_icon_background">#%02X%02X%02X</color></resources>\n' % navy,
    encoding='utf-8')
anydpi = res/'mipmap-anydpi-v26'
anydpi.mkdir(parents=True,exist_ok=True)
adaptive = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/icegh_icon_background" />
  <foreground android:drawable="@drawable/icegh_adaptive_foreground" />
</adaptive-icon>
'''
(anydpi/'ic_launcher.xml').write_text(adaptive,encoding='utf-8')
(anydpi/'ic_launcher_round.xml').write_text(adaptive,encoding='utf-8')
print('ICEGH icon created with navy background for classic and adaptive Android launchers.')
