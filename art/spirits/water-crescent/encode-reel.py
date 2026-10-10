"""Label and encode the rendered animation sequence as a shareable MP4."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parent
OUT = Path(tempfile.gettempdir()) / "water-crescent-animation-reel"
metadata = json.loads((OUT / "frames.json").read_text())
font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
title = ImageFont.truetype(font_path,26)
label = ImageFont.truetype(font_path,24)
small = ImageFont.truetype(font_path,16)
names = list(dict.fromkeys(f["clip"] for f in metadata["frames"]))
for index,frame in enumerate(metadata["frames"]):
    canvas = Image.new("RGB",(760,640),"#101c2b")
    d = ImageDraw.Draw(canvas)
    d.text((28,22),"WATER SPIRIT",font=title,fill="#a7eafd")
    d.text((28,58),"Animation preview / 10 clips",font=small,fill="#8eabc5")
    d.text((730,27),frame["clip"],font=label,fill="#e2f5ff",anchor="rt")
    shadow = Image.new("RGBA",canvas.size)
    ImageDraw.Draw(shadow).ellipse((213,487,555,517),fill=(0,8,16,140))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    canvas.paste(shadow,(0,0),shadow)
    im = Image.open(frame["path"]).convert("RGBA")
    canvas.paste(im,(100,59),im)
    d = ImageDraw.Draw(canvas)
    d.text((28,570),"Idle  /  Glide  /  Combo A, B, C  /  Charged  /  Dash  /  Hurt  /  Cast  /  Ultimate",font=small,fill="#8eabc5")
    for i,name in enumerate(names):
        d.rounded_rectangle((28+i*71,606,89+i*71,613),radius=3,
            fill="#a7eafd" if name == frame["clip"] else "#2a3d52")
    canvas.save(OUT / f"frame-{index:04d}.png")
video = HERE / "renders/animation-preview.mp4"
subprocess.run([shutil.which("ffmpeg") or "ffmpeg","-y","-loglevel","error",
    "-framerate",str(metadata["fps"]),"-i",str(OUT / "frame-%04d.png"),
    "-c:v","libx264","-crf","19","-pix_fmt","yuv420p","-movflags","+faststart",str(video)],check=True)
print(video)
