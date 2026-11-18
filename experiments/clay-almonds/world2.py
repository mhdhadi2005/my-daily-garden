"""
Dense concept render of the My Daily Garden world, closer to Hadi's reference
dioramas: a lush forest on 19 hex tiles — tall tiered pines at the back, round,
bubbly and blossom almond trees through the middle, a stream running through
to a waterfall at the front, thick undergrowth, a mushroom house and animals.
The young tree being grown stands in a clearing in the centre.

  blender --background --factory-startup --python experiments/clay-almonds/world2.py

Writes experiments/clay-almonds/world-dense.png and world-dense.blend.
"""

import importlib.util
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("world", os.path.join(HERE, "world.py"))
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)
C, B, TOP = W.C, W.B, W.TOP

B.PALETTE.update({
    "Grass": "#86C544", "Soil": "#E8D2A6", "Soil_Deep": "#9B6746", "Water": "#5CC3EE", "Tuft": "#4E9A3A",
    "Fern": "#3F8F4B", "Foam": "#F4FBFF",
    "Pine_teal_0": "#6CC79A", "Pine_teal_1": "#44A77A", "Pine_teal_2": "#2F8566",
    "Pine_lime_0": "#BBE063", "Pine_lime_1": "#93CC47", "Pine_lime_2": "#6FAE39",
    "Pine_deep_0": "#6DB866", "Pine_deep_1": "#479752", "Pine_deep_2": "#2F7643",
})
W.GAP = 0.985  # a thin seam: still separate tiles, but the forest reads as one place

RINGS = [(0, 0)] + [(q, r) for q in range(-2, 3) for r in range(-2, 3) if (q, r) != (0, 0) and max(abs(q), abs(r), abs(q + r)) <= 2]


def catmull(pts, n=10):
    P = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


STREAM = catmull([Vector(p) for p in [(-2.3, 4.5), (-1.8, 2.7), (-2.7, 0.7), (-1.7, -1.1), (-0.3, -2.5), (0.3, -4.0), (0.0, -5.5), (-0.05, -6.5)]])
POND = Vector((-0.3, -2.5))


def from_stream(x, y):
    p = Vector((x, y))
    return min(min((p - s).length for s in STREAM), (p - POND).length - 0.5)


def place(root, x, y, s, spin=0.0):
    root.location = (x, y, TOP * (1 - s))  # keeps the foot on the tile surface when scaled
    root.scale = (s, s, s)
    root.rotation_euler = (0, 0, spin)


def pine(name, kind, tiers):
    """Tiered, faceted pine like the reference dioramas. Returns (root, top height)."""
    root = B.new_empty(name, (0, 0, 0))
    W.clay_parts(name, root, [("y", "Bark", (0, 0, TOP + 0.2), (0.11, 0.11, 0.2))])
    bm = bmesh.new()
    for i in range(tiers):
        r = 0.66 * (1 - i / (tiers + 0.7))
        z0 = TOP + 0.3 + i * 0.36
        g = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=r, radius2=r * 0.14, depth=0.6,
                                  matrix=Matrix.Translation((0, 0, z0 + 0.3)) @ Matrix.Rotation(i * 0.31, 4, "Z"))
        for f in C.faces_of(g):
            f.material_index = 2 - min(2, i * 3 // tiers)
    B.new_object(f"{name}_canopy", bm, [f"Pine_{kind}_0", f"Pine_{kind}_1", f"Pine_{kind}_2"], root, smooth=False)
    return root, TOP + 0.3 + (tiers - 1) * 0.36 + 0.6


def almond(name, design, variant, look):
    root = B.new_empty(name, (0, 0, 0))
    {"D": C.concept_d, "B": C.concept_b, "E": C.concept_e}[design](root, variant)
    W.recolour(root, look)
    return root


def make_tree(name, kind, rand):
    """Returns (root, top height before scaling) — the top is only known for pines."""
    if kind.startswith("pine"):
        return pine(name, kind.split("_")[1], rand.choice((4, 5, 5)))
    design, look = kind.split(":")
    return almond(name, design, rand.randrange(3), look), None


def bush(name, x, y, s, look):
    root = B.new_empty(name, (x, y, 0))
    bm = bmesh.new()
    for i, ((bx, by, bz), r) in enumerate([((0, 0, 0.16), 0.2), ((-0.17, 0.05, 0.12), 0.14), ((0.16, -0.04, 0.13), 0.15), ((0.02, 0.1, 0.25), 0.12)]):
        for f in C.soft_sphere(bm, Vector((bx, by, TOP + bz)), r, lumps=0.05, seed=i, segs=(14, 9)):
            f.material_index = 0 if bz > 0.15 else 1
            f.smooth = True
    B.new_object(f"{name}_leaves", bm, [f"Leaf_A_{look}", f"Leaf_B_{look}"], root)
    place(root, x, y, s)


def undergrowth(name, centre, rand, keep_clear):
    """Grass clumps, ferns and rocks for one tile, kept off the stream and the tile's middle."""
    grass, fern, rock = bmesh.new(), bmesh.new(), bmesh.new()
    for _ in range(13):
        a, d = rand.uniform(0, math.tau), rand.uniform(keep_clear, 1.22)
        x, y = centre.x + math.cos(a) * d, centre.y + math.sin(a) * d
        if from_stream(x, y) < 0.42:
            continue
        kind = rand.random()
        if kind < 0.5:  # a clump of tall grass blades
            for _b in range(6):
                h = rand.uniform(0.2, 0.36)
                m = (Matrix.Translation((x + rand.uniform(-0.07, 0.07), y + rand.uniform(-0.07, 0.07), TOP + h / 2 - 0.01))
                     @ Matrix.Rotation(rand.uniform(-0.35, 0.35), 4, "X") @ Matrix.Rotation(rand.uniform(-0.35, 0.35), 4, "Y"))
                bmesh.ops.create_cone(grass, cap_ends=True, cap_tris=True, segments=4, radius1=0.035, radius2=0.0, depth=h, matrix=m)
        elif kind < 0.8:  # a fern: fronds fanning out and up
            for k in range(7):
                fa = k / 7 * math.tau + rand.uniform(-0.2, 0.2)
                tip = Vector((math.cos(fa) * 0.8, math.sin(fa) * 0.8, 0.6)).normalized()
                side = Vector((-math.sin(fa), math.cos(fa), 0))
                rot = Matrix((side, tip, side.cross(tip))).transposed().to_4x4()
                B.add_leaf(fern, Matrix.Translation((x, y, TOP + 0.02)) @ rot @ Matrix.Diagonal((0.7, 1.15, 0.7, 1)), 0)
        else:
            s = rand.uniform(0.09, 0.18)
            bmesh.ops.create_icosphere(rock, subdivisions=1, radius=1.0,
                                       matrix=Matrix.Translation((x, y, TOP + s * 0.35)) @ Matrix.Rotation(rand.uniform(0, 3), 4, "Z") @ Matrix.Diagonal((s * 1.3, s, s * 0.75, 1)))
    B.new_object(f"{name}_grass", grass, ["Tuft"], None, smooth=False)
    B.new_object(f"{name}_ferns", fern, ["Fern"], None)
    B.new_object(f"{name}_rocks", rock, ["Stone"], None, smooth=False)


def stream():
    bm = bmesh.new()
    z = TOP + 0.012
    rails = []
    for i, p in enumerate(STREAM):
        t = (STREAM[min(i + 1, len(STREAM) - 1)] - STREAM[max(i - 1, 0)]).normalized()
        left = Vector((-t.y, t.x))
        w = 0.3 + 0.05 * math.sin(i * 0.6)
        rails.append((bm.verts.new((p.x + left.x * w, p.y + left.y * w, z)), bm.verts.new((p.x - left.x * w, p.y - left.y * w, z))))
    for (l0, r0), (l1, r1) in zip(rails, rails[1:]):
        bm.faces.new((l0, r0, r1, l1))
    # the waterfall: the last strip turns down over the front edge
    (l, r), bottom = rails[-1], TOP - 0.7
    bl, br = bm.verts.new((l.co.x, l.co.y - 0.04, bottom)), bm.verts.new((r.co.x, r.co.y - 0.04, bottom))
    bm.faces.new((l, r, br, bl))
    for centre, radius, zz in ((POND, 0.78, z + 0.001), (STREAM[0], 0.42, z + 0.001), (Vector((STREAM[-1].x, STREAM[-1].y - 0.55)), 0.75, bottom + 0.004)):
        bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=radius, matrix=Matrix.Translation((centre.x, centre.y, zz)) @ Matrix.Diagonal((1, 0.8, 1, 1)))
    B.new_object("STREAM_water", bm, ["Water"], None, smooth=False)

    rand = random.Random(4)
    stones, foam, pads = bmesh.new(), bmesh.new(), bmesh.new()
    for i in range(2, len(STREAM) - 1, 3):
        p = STREAM[i]
        t = (STREAM[i + 1] - STREAM[i - 1]).normalized()
        left = Vector((-t.y, t.x)) * (1 if (i // 3) % 2 else -1)
        if (p - POND).length < 0.9:
            continue
        s = rand.uniform(0.07, 0.13)
        q = p + left * (0.4 + s)
        bmesh.ops.create_icosphere(stones, subdivisions=1, radius=1.0, matrix=Matrix.Translation((q.x, q.y, TOP + s * 0.35)) @ Matrix.Diagonal((s * 1.3, s, s * 0.75, 1)))
    for i in range(9):  # stones round the pond
        a, s = i / 9 * math.tau, rand.uniform(0.08, 0.13)
        bmesh.ops.create_icosphere(stones, subdivisions=1, radius=1.0, matrix=Matrix.Translation((POND.x + math.cos(a) * 0.86, POND.y + math.sin(a) * 0.7, TOP + s * 0.3)) @ Matrix.Diagonal((s * 1.2, s, s * 0.7, 1)))
    for a in (0.5, 2.3, 4.1):
        bmesh.ops.create_cone(pads, cap_ends=True, cap_tris=False, segments=14, radius1=0.12, radius2=0.12, depth=0.02,
                              matrix=Matrix.Translation((POND.x + math.cos(a) * 0.4, POND.y + math.sin(a) * 0.32, TOP + 0.025)))
    end = STREAM[-1]
    for i in range(9):  # foam where the waterfall lands
        bmesh.ops.create_uvsphere(foam, u_segments=10, v_segments=6, radius=rand.uniform(0.06, 0.12),
                                  matrix=Matrix.Translation((end.x + rand.uniform(-0.35, 0.35), end.y - rand.uniform(0.1, 0.5), TOP - 0.66)))
    B.new_object("STREAM_stones", stones, ["Stone"], None, smooth=False)
    B.new_object("STREAM_pads", pads, ["Pad"], None, smooth=False)
    B.new_object("STREAM_foam", foam, ["Foam"], None)


def bridge(i):
    p = STREAM[i]
    t = (STREAM[i + 1] - STREAM[i - 1]).normalized()
    root = B.new_empty("BRIDGE", (p.x, p.y, TOP))
    root.rotation_euler = (0, 0, math.atan2(t.y, t.x) + math.pi / 2)  # planks run across the water
    parts = []
    for k in range(6):
        x = -0.55 + k * 0.22
        parts.append(("b", "Wood", (x, 0, 0.05 + math.sin(k / 5 * math.pi) * 0.13), (0.1, 0.3, 0.025)))
    for y in (-0.28, 0.28):
        parts.append(("b", "Wood", (0, y, 0.34), (0.66, 0.025, 0.025)))
        parts += [("b", "Wood", (x, y, 0.2), (0.025, 0.025, 0.15)) for x in (-0.6, 0.6)]
    W.clay_parts("BRIDGE", root, parts)


def stump(x, y, s, i):
    root = B.new_empty(f"STUMP_{i}", (x, y, TOP))
    root.scale = (s, s, s)
    roots = [("s", "Bark", (math.cos(a) * 0.16, math.sin(a) * 0.16, 0.02), (0.09, 0.06, 0.05), (0, 0, a)) for a in (0.4, 2.5, 4.4)]
    W.clay_parts(f"STUMP_{i}", root, [("y", "Bark", (0, 0, 0.09), (0.16, 0.16, 0.09)), ("y", "Face", (0, 0, 0.182), (0.135, 0.135, 0.004)),
                                        ("y", "Bark", (0, 0, 0.187), (0.05, 0.05, 0.002)), *roots])


def mushroom_house(x, y, facing):
    root = B.new_empty("MUSHROOM_HOUSE", (x, y, TOP))
    root.rotation_euler = (0, 0, math.radians(facing))
    dots = [("s", "White", (math.cos(a) * 0.3 * k, math.sin(a) * 0.3 * k, 0.42 + 0.22 * math.sqrt(1 - (0.72 * k) ** 2)), 0.055)
            for a, k in ((0.3, 1.0), (1.6, 0.9), (2.9, 1.0), (4.2, 0.9), (5.4, 1.0), (0.9, 0.35))]
    W.clay_parts("MUSHROOM_HOUSE", root, [
        ("y", "MushStem", (0, 0, 0.17), (0.21, 0.21, 0.17)), ("s", "MushCap", (0, 0, 0.42), (0.44, 0.44, 0.27)), *dots,
        ("s", "Bark", (0.2, 0, 0.12), (0.03, 0.075, 0.115)), ("s", "FlowerYellow", (0.215, 0.035, 0.12), 0.012),
        ("s", "Dark", (0.14, 0.15, 0.22), (0.03, 0.04, 0.04)),
    ])


def bird(loc, facing):
    return W.animal("ANIMAL_bird", loc, facing, 1.7, [
        ("s", "White", (0, 0, 0), (0.09, 0.05, 0.045)), ("s", "White", (0.08, 0, 0.02), 0.038),
        *W.both("s", "White", (-0.01, 0.1, 0.035), (0.05, 0.1, 0.012), (0.55, 0, 0)),
        ("c", "Beak", (0.13, 0, 0.02), (0.012, 0.012, 0.02), (0, 1.57, 0)), ("s", "White", (-0.11, 0, 0.01), (0.05, 0.03, 0.01)),
        *W.both("s", "Dark", (0.105, 0.022, 0.035), 0.008),
    ])


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    B.COLL = bpy.data.collections.new("World")
    bpy.context.scene.collection.children.link(B.COLL)

    back = ["pine_teal", "pine_deep", "pine_lime", "pine_teal", "B:summer", "pine_deep"]
    mid = ["D:autumn", "pine_lime", "E:blossom", "D:golden", "B:spring", "pine_teal", "D:summer"]
    front = ["D:spring", "B:summer", "E:blossom", "D:summer"]
    small = ["pine_teal", "pine_lime", "bush", "pine_deep", "bush", "B:spring", "pine_teal", "bush"]
    counts = {"back": 0, "mid": 0, "front": 0, "small": 0}
    owl_perch = None
    stream()

    for i, (q, r) in enumerate(RINGS):
        c = W.cell(q, r)
        rand = random.Random(900 + i * 31)
        W.tile(q, r, 200 + i)
        W.flowers(c, 300 + i)
        W.flowers(c, 400 + i)
        undergrowth(f"UNDER_{i}", c, rand, 0.95 if (q, r) == (0, 0) else 0.5)
        if (q, r) == (0, 0):
            continue

        # The hero tree: tall pines at the back, almond trees through the middle; the front stays low so the clearing shows.
        row = "back" if c.y >= 2.5 else "mid" if c.y >= -0.1 else "front"
        if row != "front" or abs(c.x) >= 2.2 and c.y > -3.5:
            pool = {"back": back, "mid": mid, "front": front}[row]
            kind = pool[counts[row] % len(pool)]
            counts[row] += 1
            for ox, oy in ((0, 0), (0.55, 0.25), (-0.55, 0.3), (0.5, -0.4), (-0.5, -0.4), (0.0, 0.7)):
                if from_stream(c.x + ox, c.y + oy) > 0.85:
                    s = {"back": rand.uniform(1.2, 1.42), "mid": rand.uniform(0.98, 1.14), "front": rand.uniform(0.82, 0.92)}[row]
                    t, top = make_tree(f"HERO_{i}", kind, rand)
                    place(t, c.x + ox, c.y + oy, s, rand.uniform(0, math.tau))
                    if top and owl_perch is None and row == "mid":
                        owl_perch = (c.x + ox, c.y + oy, TOP * (1 - s) + top * s - 0.06)
                    break

        # Companions: small pines, saplings and bushes round the edge of the tile.
        for k in range({"back": 3, "mid": 3, "front": 2}[row]):
            for _try in range(6):
                a, d = rand.uniform(0, math.tau), rand.uniform(0.82, 1.05)
                x, y = c.x + math.cos(a) * d, c.y + math.sin(a) * d
                if from_stream(x, y) > 0.6 and Vector((x, y)).length > 1.9:
                    break
            else:
                continue
            kind = small[counts["small"] % len(small)]
            counts["small"] += 1
            s = rand.uniform(0.42, 0.62) * (1.15 if row == "back" else 1.0)
            if kind == "bush":
                bush(f"BUSH_{i}_{k}", x, y, rand.uniform(1.0, 1.5), rand.choice(["summer", "spring", "blossom"]))
            else:
                place(make_tree(f"SMALL_{i}_{k}", kind, rand)[0], x, y, s, rand.uniform(0, math.tau))

    W.sapling(W.cell(0, 0))
    bpy.data.objects["SAPLING"].scale = (1.35, 1.35, 1.35)
    bpy.data.objects["SAPLING"].location.z = TOP * (1 - 1.35)
    bridge(34)

    W.fox(W.cell(1, -1) + Vector((-0.75, -0.95, 0)), -75)
    W.rabbit(W.cell(1, -2) + Vector((0.2, 0.5, 0)), -100)
    W.rabbit(W.cell(-1, -1) + Vector((-0.5, 0.35, 0)), -60)
    W.hedgehog(W.cell(0, 0) + Vector((0.85, -0.7, 0)), -120)
    W.deer(W.cell(2, -2) + Vector((-0.75, 0.25, 0)), -125)
    W.deer(W.cell(-2, 0) + Vector((0.95, 0.55, 0)), -40)
    if owl_perch:
        W.owl(owl_perch, -80)
    for loc, facing in (((-3.4, 2.4, 5.2), -30), ((1.2, 3.6, 5.6), 200), ((3.9, 0.6, 4.7), 160)):
        bird(loc, facing)
    mushroom_house(*(W.cell(1, -2) + Vector((-0.35, -0.3, 0))).to_2d(), -70)
    for i, (x, y, s) in enumerate([(-3.1, -4.3, 1.0), (2.9, -2.6, 1.15), (-0.9, -5.6, 0.9), (0.9, -5.3, 1.1)]):
        if from_stream(x, y) > 0.5:
            stump(x, y, s, i)
    for i, ((q, r), off, s) in enumerate([((-1, -1), (0.2, -0.75), 1.6), ((-1, -1), (0.48, -0.55), 1.0), ((0, -2), (0.85, 0.2), 1.4), ((0, -2), (-0.9, -0.3), 1.2),
                                           ((2, -2), (0.3, -0.85), 1.5), ((-2, 0), (-0.2, -0.9), 1.3), ((0, 0), (-0.95, -0.55), 1.2), ((1, -2), (0.9, -0.7), 1.1)]):
        c = W.cell(q, r)
        if from_stream(c.x + off[0], c.y + off[1]) > 0.45:
            W.mushroom(c, off, s, i)

    scene = bpy.context.scene
    ground = bmesh.new()
    bmesh.ops.create_grid(ground, x_segments=1, y_segments=1, size=80, matrix=Matrix.Translation((0, 0, TOP - 0.705)))
    B.new_object("ENV_ground", ground, ["Ground"], None, smooth=False)
    world = bpy.data.worlds.new("Studio")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1.0, 0.97, 0.92, 1)
    bg.inputs["Strength"].default_value = 0.75
    sun = bpy.data.objects.new("LGT_key", bpy.data.lights.new("LGT_key", "SUN"))
    sun.data.energy = 2.4
    sun.data.angle = math.radians(16)
    sun.rotation_euler = (math.radians(46), 0, math.radians(-34))
    scene.collection.objects.link(sun)

    target = bpy.data.objects.new("CAM_target", None)
    target.location = (0, -0.4, 1.2)
    scene.collection.objects.link(target)
    cam = bpy.data.objects.new("CAM_main", bpy.data.cameras.new("CAM_main"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 16.2
    yaw, elev, dist = math.radians(24), math.radians(40), 50
    cam.location = (math.sin(yaw) * math.cos(elev) * dist, -0.4 - math.cos(yaw) * math.cos(elev) * dist, 1.2 + math.sin(elev) * dist)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 72
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1400
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = -0.15
    scene.render.filepath = os.path.join(HERE, "world-dense.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "world-dense.blend"))
    bpy.ops.render.render(write_still=True)
    print("WORLD2_OK", counts)


main()
