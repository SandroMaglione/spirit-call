"""Export Windwall's animations, preserving the approved static assets."""
import hashlib
import json
import sys
from pathlib import Path
import bpy

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import animate

bpy.ops.wm.open_mainfile(filepath=str(HERE/'windwall.blend'))
timing,envelopes=animate.add_clips()
source=HERE/'windwall-animated.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(source))
out=HERE/'windwall-animated.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True,
    export_vertex_color='ACTIVE',export_animations=True,export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,export_cameras=False,export_lights=False)
static=json.loads((HERE/'export.json').read_text())
metadata={**static,'status':'animated model for review','animations':len(timing),
          'clips':timing,'sampled_frame_envelopes':envelopes,
          'root_motion':False,'fps':animate.FPS,'bytes':out.stat().st_size,
          'static_glb_sha256':static['glb_sha256'],
          'static_source_sha256':static['source_sha256'],
          'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'glb_sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
(HERE/'animation-export.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(metadata,indent=2))
