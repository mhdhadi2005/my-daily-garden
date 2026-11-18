"""
Exports the five tree designs (A–E, see concepts.py) for the 3D forest, three
shape variants each, plus the grass and pond tiles — with ambient occlusion
baked into vertex colours so the trees keep their soft clay shading on the web.

  blender --background --factory-startup --python experiments/clay-almonds/concepts_export.py

Writes public/forest3d/tree-designs.glb and experiments/clay-almonds/designs-sheet.png.
Roots: TREE_<letter><variant> (e.g. TREE_D2), TILE_grass, TILE_pond. Canopy
materials Leaf_A/B/C (light/mid/dark) and Blossom_* are recoloured per look by
the forest; children named *_blossom are shown only on flowering looks.
"""

import importlib.util
import math
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
spec = importlib.util.spec_from_file_location("concepts", os.path.join(HERE, "concepts.py"))
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)
B = C.B

DESIGNS = {"A": C.concept_a, "B": C.concept_b, "C": C.concept_c, "D": C.concept_d, "E": C.concept_e}
VARIANTS = 3
SPACING = 3.6
AO_FLOOR = 0.5  # baked occlusion only darkens to half, keeping the clay soft rather than grimy


def bake_ao(meshes):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.world.light_settings.distance = 0.7
    for o in meshes:
        attrs = o.data.color_attributes
        attr = attrs.get("AO") or attrs.new("AO", "BYTE_COLOR", "CORNER")
        attrs.active_color = attr
        attrs.render_color_index = attrs.active_color_index
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    scene.render.bake.target = "VERTEX_COLORS"
    bpy.ops.object.bake(type="AO")
    for o in meshes:
        for d in o.data.color_attributes["AO"].data:
            r = d.color[0]
            v = AO_FLOOR + (1 - AO_FLOOR) * r
            d.color = (v, v, v, 1)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    B.COLL = bpy.data.collections.new("TreeDesigns")
    bpy.context.scene.collection.children.link(B.COLL)
    world = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = world

    for row, (letter, make) in enumerate(DESIGNS.items()):
        for v in range(VARIANTS):
            root = B.new_empty(f"TREE_{letter}{v}", (v * SPACING, -row * SPACING, 0))
            make(root, v)
    grass = B.build_grass_tile((VARIANTS * SPACING, 0, 0))
    pond = B.build_pond_tile((VARIANTS * SPACING, -SPACING, 0))

    meshes = [o for o in B.COLL.all_objects if o.type == "MESH"]
    bake_ao(meshes)

    glb = os.path.join(REPO, "public", "forest3d", "tree-designs.glb")
    bpy.ops.object.select_all(action="DESELECT")
    for o in B.COLL.all_objects:
        o.select_set(True)
    kwargs = dict(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                  export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color="ACTIVE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs, export_colors=True)

    # Contact sheet: every design and variant, lit like the concept render.
    scene = bpy.context.scene
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.93, 0.86, 0.72, 1)
    bg.inputs["Strength"].default_value = 0.85
    sun = bpy.data.objects.new("LGT_key", bpy.data.lights.new("LGT_key", "SUN"))
    sun.data.energy = 3.5
    sun.data.angle = math.radians(25)
    sun.rotation_euler = (math.radians(48), math.radians(12), math.radians(-40))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("CAM_sheet", bpy.data.cameras.new("CAM_sheet"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 19
    cam.location = (SPACING * 1.5, -SPACING * 2 - 12, 13)
    cam.rotation_euler = (math.radians(50), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1500
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = os.path.join(HERE, "designs-sheet.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)

    tris = {}
    for o in meshes:
        o.data.calc_loop_triangles()
        key = (o.parent.name if o.parent else o.name)[:6]
        tris[key] = tris.get(key, 0) + len(o.data.loop_triangles)
    print("EXPORT_OK", {"glb_kb": round(os.path.getsize(glb) / 1024), "tris": tris})


main()
