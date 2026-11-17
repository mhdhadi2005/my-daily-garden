"""
Concept render of the whole My Daily Garden world, for Harry to approve the
look before more modelling: a cluster of hex tiles, one almond tree per tile
(bubbly-cloud trees in different colour looks, almond-blossom trees), the
young sapling being grown in the centre, the pond, and small clay animals.

  blender --background --factory-startup --python experiments/clay-almonds/world.py

Writes experiments/clay-almonds/world.png and world.blend.
"""

import importlib.util
import math
import os
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("concepts", os.path.join(HERE, "concepts.py"))
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)
B = C.B
TOP = B.TOP

LOOKS = {  # light, mid, dark
    "spring": ("#C8EA7C", "#9CD055", "#7BB443"),
    "summer": ("#7FC484", "#55A65F", "#3F8A4E"),
    "autumn": ("#FBC165", "#F0973D", "#D9782E"),
    "golden": ("#F4DD7A", "#E3C243", "#C9A42C"),
    "blossom": ("#A6DD8C", "#7CC36B", "#5FA35A"),
}
B.PALETTE.update({
    "Fox": "#E8873A", "White": "#FFF8EE", "Dark": "#3A2A22", "Rabbit": "#F1EADF", "Hedgehog": "#A77B55",
    "Face": "#E9CFA6", "Deer": "#C8905A", "Owl": "#8B6B4A", "OwlBelly": "#E8D3A8", "Beak": "#F0A030",
    "MushCap": "#E0483A", "MushStem": "#F3E9D8", "FlowerPink": "#F6A5BE", "FlowerYellow": "#FFD45A",
    "FlowerOrange": "#FF9A4A", "Ground": "#F6ECD9",
})
for look, (light, mid, dark) in LOOKS.items():
    B.PALETTE.update({f"Leaf_A_{look}": light, f"Leaf_B_{look}": mid, f"Leaf_C_{look}": dark})

GAP = 0.965  # each grass cap is drawn slightly small, so a soil seam separates the tiles


def cell(q, r):
    return Vector((2.25 * q, 2.6 * (r + q / 2), 0))


def recolour(root, look):
    for o in root.children:
        if o.type != "MESH":
            continue
        for i, m in enumerate(o.data.materials):
            if m and m.name in ("Leaf_A", "Leaf_B", "Leaf_C"):
                o.data.materials[i] = B.material(f"{m.name}_{look}")


def clay_parts(name, parent, parts):
    """parts: (shape, material, location, scale[, rotation]) — s sphere, c cone, b box, y cylinder."""
    groups = {}
    for part in parts:
        shape, mat, loc, scale = part[:4]
        rot = part[4] if len(part) > 4 else (0, 0, 0)
        if isinstance(scale, (int, float)):
            scale = (scale, scale, scale)
        bm = groups.setdefault(mat, bmesh.new())
        m = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        if shape == "s":
            bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=12, radius=1.0, matrix=m)
        elif shape == "c":
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=12, radius1=1.0, radius2=0.0, depth=2.0, matrix=m)
        elif shape == "b":
            bmesh.ops.create_cube(bm, size=2.0, matrix=m)
        else:
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=1.0, radius2=1.0, depth=2.0, matrix=m)
    for mat, bm in groups.items():
        B.new_object(f"{name}_{mat}", bm, [mat], parent)


def both(shape, mat, loc, scale, rot=(0, 0, 0)):
    """The same part mirrored left and right (±y)."""
    x, y, z = loc
    return [(shape, mat, (x, y, z), scale, rot), (shape, mat, (x, -y, z), scale, (-rot[0], rot[1], -rot[2]))]


def animal(name, loc, facing_deg, scale, parts):
    root = B.new_empty(name, (loc[0], loc[1], loc[2] if len(loc) > 2 else TOP))
    root.rotation_euler = (0, 0, math.radians(facing_deg))
    root.scale = (scale, scale, scale)
    clay_parts(name, root, parts)
    return root


def fox(loc, facing):  # sitting, facing +x before rotation
    return animal("ANIMAL_fox", loc, facing, 1.7, [
        ("s", "Fox", (0, 0, 0.17), (0.17, 0.13, 0.17)), ("s", "White", (0.1, 0, 0.15), (0.09, 0.08, 0.11)),
        ("s", "Fox", (0.14, 0, 0.38), (0.12, 0.115, 0.105)), ("s", "White", (0.24, 0, 0.345), (0.06, 0.05, 0.04)),
        ("s", "Dark", (0.295, 0, 0.355), 0.018), *both("s", "Dark", (0.225, 0.055, 0.41), 0.016),
        *both("c", "Fox", (0.1, 0.075, 0.5), (0.045, 0.03, 0.06)),
        ("s", "Fox", (-0.2, 0.02, 0.1), (0.16, 0.07, 0.07), (0, -0.5, 0.3)), ("s", "White", (-0.33, 0.06, 0.17), (0.06, 0.05, 0.05)),
        *both("s", "Dark", (0.15, 0.06, 0.03), (0.04, 0.03, 0.03)),
    ])


def rabbit(loc, facing):
    return animal("ANIMAL_rabbit", loc, facing, 1.6, [
        ("s", "Rabbit", (0, 0, 0.13), (0.14, 0.11, 0.13)), ("s", "Rabbit", (0.11, 0, 0.29), (0.09, 0.085, 0.08)),
        *both("s", "Rabbit", (0.08, 0.035, 0.45), (0.025, 0.02, 0.1)), *both("s", "FlowerPink", (0.092, 0.035, 0.45), (0.012, 0.012, 0.075)),
        ("s", "White", (-0.14, 0, 0.1), 0.045), *both("s", "Dark", (0.17, 0.045, 0.31), 0.014), ("s", "FlowerPink", (0.2, 0, 0.28), 0.012),
    ])


def hedgehog(loc, facing):
    spikes = []
    for i in range(5):
        for j in range(-2, 3):
            x, y = 0.05 - i * 0.045, j * 0.04
            z = 0.09 + 0.1 * math.sqrt(max(0.0, 1 - (x / 0.16) ** 2 - (y / 0.12) ** 2))
            spikes.append(("c", "Dark", (x, y, z), (0.02, 0.02, 0.045), (j * 0.25, -0.45, 0)))
    return animal("ANIMAL_hedgehog", loc, facing, 1.8, [
        ("s", "Hedgehog", (0, 0, 0.09), (0.16, 0.12, 0.1)), *spikes,
        ("s", "Face", (0.15, 0, 0.07), (0.06, 0.055, 0.05)), ("s", "Dark", (0.21, 0, 0.07), 0.015),
        *both("s", "Dark", (0.17, 0.035, 0.1), 0.012),
    ])


def deer(loc, facing):
    legs = [("y", "Deer", (sx * 0.15, sy * 0.05, 0.17), (0.025, 0.025, 0.17)) for sx in (-1, 1) for sy in (-1, 1)]
    hooves = [("y", "Dark", (sx * 0.15, sy * 0.05, 0.02), (0.028, 0.028, 0.02)) for sx in (-1, 1) for sy in (-1, 1)]
    spots = [("s", "White", (x, y, 0.515 - abs(y) * 0.5), 0.018) for x, y in ((-0.12, 0.04), (-0.02, -0.05), (0.06, 0.03), (-0.08, -0.03), (0.0, 0.06), (0.1, -0.04))]
    return animal("ANIMAL_deer", loc, facing, 1.6, [
        ("s", "Deer", (0, 0, 0.42), (0.24, 0.1, 0.11)), *legs, *hooves, *spots,
        ("s", "Deer", (0.2, 0, 0.58), (0.06, 0.055, 0.14), (0, 0.5, 0)), ("s", "Deer", (0.3, 0, 0.74), (0.085, 0.06, 0.06)),
        ("s", "Dark", (0.385, 0, 0.73), 0.018), *both("s", "Deer", (0.24, 0.07, 0.8), (0.02, 0.045, 0.025)),
        *both("y", "Face", (0.26, 0.035, 0.86), (0.01, 0.01, 0.07)), *both("y", "Face", (0.26, 0.06, 0.9), (0.008, 0.008, 0.04), (0.8, 0, 0)),
        *both("s", "Dark", (0.33, 0.05, 0.77), 0.013), ("s", "White", (-0.24, 0, 0.47), 0.03),
    ])


def owl(loc, facing):
    return animal("ANIMAL_owl", loc, facing, 1.7, [
        ("s", "Owl", (0, 0, 0.12), (0.1, 0.1, 0.13)), ("s", "OwlBelly", (0.045, 0, 0.1), (0.07, 0.075, 0.09)),
        *both("s", "White", (0.08, 0.04, 0.18), (0.02, 0.036, 0.036)), *both("s", "Dark", (0.098, 0.04, 0.18), (0.012, 0.016, 0.016)),
        ("c", "Beak", (0.1, 0, 0.15), (0.015, 0.015, 0.02), (0, 1.57, 0)), *both("c", "Owl", (0, 0.06, 0.25), (0.025, 0.025, 0.035)),
    ])


def mushroom(parent_loc, offset, s, i):
    root = B.new_empty(f"MUSHROOM_{i}", (parent_loc.x + offset[0], parent_loc.y + offset[1], TOP))
    dots = [("s", "White", (math.cos(a) * 0.055 * s, math.sin(a) * 0.055 * s, 0.155 * s), 0.014 * s) for a in (0.4, 2.2, 3.9, 5.3)]
    clay_parts(f"MUSHROOM_{i}", root, [
        ("y", "MushStem", (0, 0, 0.06 * s), (0.03 * s, 0.03 * s, 0.06 * s)),
        ("s", "MushCap", (0, 0, 0.13 * s), (0.09 * s, 0.09 * s, 0.055 * s)), ("s", "White", (0, 0, 0.18 * s), 0.014 * s), *dots,
    ])


def flowers(parent_loc, seed):
    rand = random.Random(seed)
    root = B.new_empty(f"FLOWERS_{seed}", (parent_loc.x, parent_loc.y, TOP))
    parts = []
    for _ in range(6):
        a, d = rand.uniform(0, math.tau), rand.uniform(0.75, 1.2)
        x, y = math.cos(a) * d, math.sin(a) * d
        colour = rand.choice(["FlowerPink", "FlowerYellow", "FlowerOrange", "White"])
        parts += [("y", "Tuft", (x, y, 0.05), (0.008, 0.008, 0.05)), ("s", colour, (x, y, 0.11), 0.04), ("s", "FlowerYellow", (x, y, 0.135), 0.018)]
    clay_parts(f"FLOWERS_{seed}", root, parts)


def sapling(loc):
    root = B.new_empty("SAPLING", loc)
    rand = random.Random(3)
    clay_parts("SAPLING_mound", root, [("s", "Soil_Deep", (0, 0, TOP + 0.01), (0.34, 0.3, 0.07))])
    B.new_object("SAPLING_stem", B.tube("sap", [Vector((0, 0, TOP)), Vector((0.06, 0, TOP + 0.3)), Vector((-0.03, 0, TOP + 0.62))], [1, 0.8, 0.55], 0.06), ["Bark"], root)
    bm = bmesh.new()
    for i, ((x, y, z), r) in enumerate([((-0.03, 0, 0.78), 0.2), ((-0.19, 0.03, 0.68), 0.14), ((0.14, -0.03, 0.7), 0.15), ((0.0, 0.02, 0.96), 0.13)]):
        for f in C.soft_sphere(bm, Vector((x, y, TOP + z)), r, lumps=0.05, seed=i, segs=(18, 12)):
            f.material_index = 0 if z > 0.75 else 1
            f.smooth = True
    for a, h in ((0.5, 0.36), (3.4, 0.44)):  # two leaves low on the stem: it is still a baby tree
        n = Vector((math.cos(a), math.sin(a), 0.6)).normalized()
        B.add_leaf(bm, B.leaf_matrix(Vector((n.x * 0.07, n.y * 0.07, TOP + h)), n, rand, 0.55), 1)
    B.new_object("SAPLING_canopy", bm, ["Leaf_A_blossom", "Leaf_B_blossom"], root)
    # the warm glow that marks the tree being grown: a few fireflies and a soft light
    glow = bpy.data.materials.new("Firefly")
    glow.use_nodes = True
    nt = glow.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (1.0, 0.78, 0.3, 1)
    emit.inputs["Strength"].default_value = 9
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    bm = bmesh.new()
    for x, y, z in ((0.42, -0.25, 0.75), (-0.38, -0.15, 0.95), (0.2, 0.3, 1.15)):
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.04, matrix=Matrix.Translation((x, y, TOP + z)))
    me = bpy.data.meshes.new("SAPLING_fireflies")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(glow)
    ff = bpy.data.objects.new("SAPLING_fireflies", me)
    B.COLL.objects.link(ff)
    ff.parent = root
    lamp = bpy.data.objects.new("LGT_sapling", bpy.data.lights.new("LGT_sapling", "POINT"))
    lamp.data.energy = 12
    lamp.data.color = (1.0, 0.8, 0.45)
    lamp.data.shadow_soft_size = 0.5
    lamp.location = (loc[0], loc[1] - 0.3, TOP + 0.9)
    B.COLL.objects.link(lamp)


def seam_filler(parent, name):
    """The soil layers taper, leaving a hole where three tiles meet; a straight-sided soil core closes it."""
    bm = bmesh.new()
    B.frustum(bm, B.HEX_R + 0.004, B.HEX_R + 0.004, TOP - 0.5, TOP - 0.162)
    B.new_object(f"{name}_core", bm, ["Soil"], parent, smooth=False)


def tile(q, r, seed):
    t = B.new_empty(f"TILE_{q}_{r}", cell(q, r))
    B.tile_layers(t, f"TILE_{q}_{r}")
    B.scatter_decor(t, f"TILE_{q}_{r}", seed, keep_clear=0.75)
    bpy.data.objects[f"TILE_{q}_{r}_grass"].scale = (GAP, GAP, 1)
    seam_filler(t, f"TILE_{q}_{r}")


def tree(q, r, design, variant, look):
    root = B.new_empty(f"TREE_{q}_{r}", cell(q, r))
    (C.concept_e if design == "E" else C.concept_d)(root, variant)
    recolour(root, look)
    root.rotation_euler = (0, 0, random.Random(q * 7 + r).uniform(0, math.tau))
    return root


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    B.COLL = bpy.data.collections.new("World")
    bpy.context.scene.collection.children.link(B.COLL)

    trees = {  # (q, r): (design, variant, look)
        (-1, 0): ("D", 0, "spring"), (1, -1): ("E", 0, "blossom"), (-1, 1): ("D", 1, "summer"),
        (1, 0): ("D", 2, "autumn"), (0, 1): ("E", 1, "blossom"), (-2, 1): ("D", 1, "golden"),
        (2, -1): ("D", 0, "summer"), (1, 1): ("D", 2, "blossom"), (-1, -1): ("D", 2, "summer"),
    }
    for i, ((q, r), (design, variant, look)) in enumerate(trees.items()):
        tile(q, r, 40 + i)
        tree(q, r, design, variant, look)
        flowers(cell(q, r), 100 + i)
    tile(0, 0, 77)
    sapling(cell(0, 0))
    pond = B.build_pond_tile(cell(0, -1))
    bpy.data.objects["TILE_pond_grass"].scale = (GAP, GAP, 1)
    seam_filler(pond, "TILE_pond")

    fox(cell(1, -1) + Vector((-0.55, -0.95, 0)), -75)
    rabbit(cell(-1, 0) + Vector((0.6, -0.85, 0)), -110)
    hedgehog(cell(0, 0) + Vector((0.8, -0.65, 0)), -120)
    deer(cell(2, -1) + Vector((-0.35, -0.95, 0)), -120)
    owl_spot = cell(-1, 1) + Vector((0.1, -0.35, 2.28))
    owl(owl_spot, -80)
    for i, ((q, r), off, s) in enumerate([((-2, 1), (0.7, -0.8), 1.5), ((-2, 1), (0.95, -0.6), 1.0), ((1, 1), (-0.85, -0.7), 1.3),
                                           ((-1, -1), (0.8, -0.75), 1.4), ((-1, -1), (1.0, -0.5), 0.9), ((0, 0), (-0.9, -0.5), 1.1),
                                           ((2, -1), (0.75, 0.6), 1.2)]):
        mushroom(cell(q, r), off, s, i)

    scene = bpy.context.scene
    ground = bmesh.new()
    bmesh.ops.create_grid(ground, x_segments=1, y_segments=1, size=60, matrix=Matrix.Translation((0, 0, TOP - 0.705)))
    B.new_object("ENV_ground", ground, ["Ground"], None, smooth=False)

    world = bpy.data.worlds.new("Studio")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1.0, 0.97, 0.92, 1)
    bg.inputs["Strength"].default_value = 0.75
    sun = bpy.data.objects.new("LGT_key", bpy.data.lights.new("LGT_key", "SUN"))
    sun.data.energy = 2.3
    sun.data.angle = math.radians(18)
    sun.rotation_euler = (math.radians(48), 0, math.radians(-32))
    scene.collection.objects.link(sun)

    target = bpy.data.objects.new("CAM_target", None)
    target.location = (0, 0, 0.75)
    scene.collection.objects.link(target)
    cam = bpy.data.objects.new("CAM_main", bpy.data.cameras.new("CAM_main"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 13.2
    yaw, elev, dist = math.radians(20), math.radians(38), 40
    cam.location = (math.sin(yaw) * math.cos(elev) * dist, -math.cos(yaw) * math.cos(elev) * dist, 0.75 + math.sin(elev) * dist)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 72
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
    scene.view_settings.exposure = -0.2
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = os.path.join(HERE, "world.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "world.blend"))
    bpy.ops.render.render(write_still=True)
    print("WORLD_OK")


if __name__ == "__main__":
    main()
