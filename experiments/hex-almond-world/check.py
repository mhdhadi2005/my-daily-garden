"""Check the persisted Blender study without modifying it. Run after opening the .blend."""
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

folder = Path(__file__).resolve().parent
scene = bpy.context.scene
world = bpy.data.collections['World | seven modular hexes']
tiles = [obj for obj in world.all_objects if 'hex_q' in obj]
trees = [obj for obj in world.all_objects if obj.get('main_tree')]
assert len(tiles) == 7 and len({(obj['hex_q'], obj['hex_r']) for obj in tiles}) == 7
assert len(trees) == 6
assert Counter(obj['growth_stage'] for obj in trees) == Counter(
    seedling=1, young=1, fruiting=2, blossoming=2)
assert all(tree.parent in tiles for tree in trees)
for tile in tiles:
    count = sum(tree.parent == tile for tree in trees)
    assert count == (0 if tile['terrain'] == 'pond' else 1), tile.name

for name, colour in [('Brand_Orange', '#FFA01E'), ('Brand_Navy', '#262A45')]:
    channels = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    expected = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels]
    actual = bpy.data.materials[name].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value
    assert all(abs(a - b) < 1e-6 for a, b in zip(actual[:3], expected)), name
assert not any(node.type == 'TEX_IMAGE' for mat in bpy.data.materials if mat.node_tree
               for node in mat.node_tree.nodes)
assert scene.camera.data.type == 'ORTHO' and not scene.camera.data.dof.use_dof
bpy.context.view_layer.update()
meshes = [obj for obj in world.all_objects if obj.type == 'MESH']
points = [world_to_camera_view(scene, scene.camera, obj.matrix_world @ Vector(corner))
          for obj in meshes for corner in obj.bound_box]
frame = dict(left=min(p.x for p in points), right=max(p.x for p in points),
             bottom=min(p.y for p in points), top=max(p.y for p in points))
assert frame['left'] > .045 and frame['right'] < .955
assert frame['bottom'] > .045 and frame['top'] < .955

for filename, dimensions in [('seven-hex-world.png', (1800, 1350)),
                             ('seven-hex-portrait.png', (900, 1100))]:
    header = (folder / filename).read_bytes()[:24]
    assert header[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', header[16:24]) == dimensions
assert (folder / 'seven-hex-world.glb').read_bytes()[:4] == b'glTF'
receipt = {
    'verdict': 'pass', 'blender': bpy.app.version_string,
    'tiles': len(tiles), 'main_trees': len(trees), 'mesh_objects': len(meshes),
    'saved_camera_frame': frame,
    'sha256': {name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
               for name in ['seven-hex-world.blend', 'seven-hex-world.glb',
                            'seven-hex-world.png', 'seven-hex-portrait.png']},
    'limits': ['Checks saved scene structure, palette values and camera framing; visual approval remains subjective.']
}
(folder / 'scene-check.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
