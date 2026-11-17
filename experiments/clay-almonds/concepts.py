"""
Tree concept line-up — five different stylised almond trees, rendered side by
side on hex tiles so Hadi can pick a direction before it goes into the forest.

  blender --background --factory-startup --python experiments/clay-almonds/concepts.py

Writes experiments/clay-almonds/concepts.png and concepts.blend.
  A  Big clay leaves  — few, large pillowy leaves with a centre crease, in clusters
  B  Puffball         — a handful of big soft balls
  C  Low-poly         — faceted, gem-cut canopy and angular trunk
  D  Bubbly cloud     — many small soft bumps forming one cumulus mass
  E  Almond blossom   — puffy canopy covered in pink and white blossom
"""

import importlib.util
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("clay_build", os.path.join(HERE, "build.py"))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)  # helpers only; build.py's main() doesn't run on import

TOP = B.TOP
B.PALETTE.update({
    "Bark": "#8E5B3A", "Bark_Light": "#A9764F",
    "Leaf_A": "#8FD06A", "Leaf_B": "#5FB04E", "Leaf_C": "#3F8D3E",
    "Blossom_Pink": "#F6A5BE", "Blossom_White": "#FFF4F6", "Blossom_Centre": "#F2C14E",
})


def vary(v, lean, height):
    """Variant v (0, 1, 2) of a design: lean flips side and grows, height steps."""
    return lean * (1 if v % 2 == 0 else -1) * (1 + 0.2 * v), height * (1 + 0.07 * (v - 1))


def obj_from_bm(name, bm, mats, parent, smooth=True):
    return B.new_object(name, bm, mats, parent, smooth)


def thick_trunk(n, root, lean, height, base_r=0.26, branches=2, lowpoly=False):
    top = TOP + height
    pts = [Vector((0, 0, TOP - 0.03)), Vector((lean * 1.3, 0.03, TOP + height * 0.35)),
           Vector((-lean, -0.03, TOP + height * 0.7)), Vector((lean * 0.3, 0, top))]
    meshes = [B.tube(f"{n}_trunk_c", pts, [1.0, 0.78, 0.62, 0.5], base_r)]
    for k in range(branches):
        side = -1 if k % 2 == 0 else 1
        meshes.append(B.tube(f"{n}_br_c", [Vector((lean * 0.3, 0, top - 0.1)),
                                            Vector((side * 0.24, side * 0.05 + (k // 2) * 0.1, top + 0.18)),
                                            Vector((side * 0.42, side * 0.1 + (k // 2) * 0.18, top + 0.4))],
                             [0.9, 0.6, 0.38], base_r * 0.42))
    me = B.join_meshes(f"{n}_trunk", meshes)
    o = obj_from_bm(f"{n}_trunk", me, ["Bark"], root, smooth=not lowpoly)
    if lowpoly:
        dec = o.modifiers.new("facets", "DECIMATE")
        dec.ratio = 0.12
    else:
        # vertical bark grooves: displace with a stretched wood-ring texture
        tex = bpy.data.textures.get("Grooves") or bpy.data.textures.new("Grooves", "WOOD")
        tex.wood_type = "BANDNOISE"
        tex.noise_scale = 0.06
        tex.turbulence = 3
        d = o.modifiers.new("grooves", "DISPLACE")
        d.texture = tex
        d.texture_coords = "LOCAL"
        d.strength = 0.03
    baked = B.bake(o)
    old = o.data
    o.modifiers.clear()
    o.data = baked
    B.bpy.data.meshes.remove(old)
    baked.materials.clear()
    baked.materials.append(B.material("Bark"))
    for p in baked.polygons:
        p.use_smooth = not lowpoly
    # root lumps
    bm = bmesh.new()
    rand = random.Random(hash(n) & 0xffff)
    for i in range(4):
        a = i * math.pi / 2 + rand.uniform(-0.35, 0.35)
        m = (Matrix.Translation((math.cos(a) * base_r * 0.85, math.sin(a) * base_r * 0.85, TOP + 0.03))
             @ Matrix.Rotation(a, 4, "Z") @ Matrix.Diagonal((base_r * 0.9, base_r * 0.55, base_r * 0.45, 1)))
        if lowpoly:
            bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, matrix=m)
        else:
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0, matrix=m)
    obj_from_bm(f"{n}_roots", bm, ["Bark_Light"], root, smooth=not lowpoly)
    return top


def faces_of(geom):
    """bmesh primitive ops return only their verts; collect the faces they made."""
    return list({f for v in geom["verts"] for f in v.link_faces})


def soft_sphere(bm, centre, radius, squash=(1, 1, 1), lumps=0.06, seed=0, segs=(22, 14)):
    geom = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    for v in geom["verts"]:
        d = v.co.normalized()
        r = radius * (1 + lumps * noise.noise(d * 2.2 + Vector((seed, seed * 0.7, seed * 1.3))))
        v.co = centre + Vector((d.x * r * squash[0], d.y * r * squash[1], d.z * r * squash[2]))
    return faces_of(geom)


# ── A: big clay leaves ──

def big_leaf_template():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        pinch = 1 - 0.8 * max(0.0, y) ** 2 - 0.3 * max(0.0, -y) ** 2
        crease = 0.35 * math.exp(-(x / 0.18) ** 2) if z > 0 else 0  # centre vein groove on the top face
        v.co = Vector((x * pinch * 0.3, y * 0.5 + 0.22, (z - crease * z) * 0.09 + 0.05 * (1 - x * x)))
    vs = [v.co.copy() for v in bm.verts]
    fs = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return vs, fs


def concept_a(root, v=0):
    top = thick_trunk("A", root, *vary(v, 0.1, 1.1))
    rand = random.Random(5 + v * 17)
    leaf_v, leaf_f = big_leaf_template()
    core, leaves = bmesh.new(), bmesh.new()
    centre = Vector((0.03, 0, top + 0.45))
    soft_sphere(core, centre, 0.62, (1.05, 1.0, 0.8), lumps=0.12, seed=1)
    for c in B.fib_points(11, -0.4):
        cc = centre + Vector((c.x * 0.6, c.y * 0.58, c.z * 0.48))
        for k in range(5):  # a small rosette of leaves lying close over each cluster point
            a = k / 5 * math.tau + rand.uniform(-0.3, 0.3)
            out = (c + Vector((math.cos(a), math.sin(a), 0.1)) * 0.35).normalized()
            m = B.leaf_matrix(cc + out * 0.04, out, rand, rand.uniform(0.62, 0.78))
            vs = [leaves.verts.new(m @ co) for co in leaf_v]
            for f in leaf_f:
                face = leaves.faces.new([vs[i] for i in f])
                face.material_index = k % 2
                face.smooth = True
    obj_from_bm("A_core", core, ["Leaf_C"], root)
    obj_from_bm("A_leaves", leaves, ["Leaf_A", "Leaf_B"], root)


# ── B: puffball ──

def concept_b(root, v=0):
    top = thick_trunk("B", root, *vary(v, -0.08, 1.0), branches=3)
    bm = bmesh.new()
    balls = [((0, 0, 0.5), 0.5, 0), ((-0.45, 0.05, 0.3), 0.38, 1), ((0.46, -0.05, 0.32), 0.4, 1),
             ((0.02, 0.38, 0.32), 0.36, 2), ((0.05, -0.36, 0.34), 0.36, 2), ((0.08, 0.02, 0.88), 0.36, 0)]
    for i, ((x, y, z), r, shade) in enumerate(balls):
        faces = soft_sphere(bm, Vector((x, y, top + z)), r * (1 + 0.08 * ((i + v) % 3 - 1)), lumps=0.05, seed=i + 3 + v * 11)
        for f in faces:
            f.material_index = shade
            f.smooth = True
    obj_from_bm("B_canopy", bm, ["Leaf_A", "Leaf_B", "Leaf_C"], root)


# ── C: low-poly ──

def concept_c(root, v=0):
    top = thick_trunk("C", root, *vary(v, 0.09, 1.05), lowpoly=True)
    rand = random.Random(9 + v * 13)
    bm = bmesh.new()
    for i, ((x, y, z), r) in enumerate([((0, 0, 0.48), 0.58), ((-0.42, 0.1, 0.3), 0.4), ((0.44, -0.08, 0.34), 0.42), ((0.05, 0.05, 0.9), 0.38)]):
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=Matrix.Translation((x, y, top + z)))
        for v in g["verts"]:
            v.co += Vector((rand.uniform(-1, 1), rand.uniform(-1, 1), rand.uniform(-1, 1))) * r * 0.12
        for f in faces_of(g):
            f.material_index = 0 if f.normal.z > 0.35 else 1 if f.normal.z > -0.2 else 2
            f.smooth = False
    obj_from_bm("C_canopy", bm, ["Leaf_A", "Leaf_B", "Leaf_C"], root, smooth=False)


# ── D: bubbly cloud ──

def concept_d(root, v=0):
    top = thick_trunk("D", root, *vary(v, -0.11, 1.08))
    rand = random.Random(13 + v * 7)
    bm = bmesh.new()
    centre = Vector((0, 0, top + 0.45))
    soft_sphere(bm, centre, 0.55, (1.1, 1.05, 0.85), lumps=0.0, seed=2, segs=(24, 14))
    for i, u in enumerate(B.fib_points(34, -0.45)):
        r = rand.uniform(0.17, 0.27)
        p = centre + Vector((u.x * 0.66, u.y * 0.62, u.z * 0.5))
        faces = soft_sphere(bm, p, r, lumps=0.04, seed=i, segs=(16, 10))
        for f in faces:
            f.material_index = 0 if u.z > 0.35 else 1
            f.smooth = True
    obj_from_bm("D_canopy", bm, ["Leaf_A", "Leaf_B"], root)


# ── E: almond blossom ──

def blossom(bm, pos, normal, size, mat_petal, rand):
    z = normal.normalized()
    x = z.orthogonal().normalized()
    y = z.cross(x)
    rot = Matrix((x, y, z)).transposed().to_4x4()
    for k in range(5):
        a = k / 5 * math.tau + rand.uniform(-0.1, 0.1)
        m = (Matrix.Translation(pos) @ rot @ Matrix.Rotation(a, 4, "Z")
             @ Matrix.Translation((size * 0.55, 0, 0)) @ Matrix.Diagonal((size * 0.55, size * 0.38, size * 0.12, 1)))
        g = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0, matrix=m)
        for f in faces_of(g):
            f.material_index = mat_petal
            f.smooth = True
    g = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=size * 0.25, matrix=Matrix.Translation(pos + z * size * 0.08))
    for f in faces_of(g):
        f.material_index = 2


def concept_e(root, v=0):
    top = thick_trunk("E", root, *vary(v, 0.1, 1.08))
    rand = random.Random(21 + v * 5)
    canopy, flowers = bmesh.new(), bmesh.new()
    centre = Vector((0.03, 0, top + 0.45))
    balls = [((0, 0, 0.05), 0.55), ((-0.4, 0.05, -0.08), 0.38), ((0.42, -0.04, -0.06), 0.4), ((0.05, 0.02, 0.42), 0.36)]
    for i, ((x, y, z), r) in enumerate(balls):
        for f in soft_sphere(canopy, centre + Vector((x, y, z)), r, lumps=0.06, seed=i + 7):
            f.material_index = 0
            f.smooth = True
    for (x, y, z), r in balls:
        for u in B.fib_points(26 if r > 0.45 else 16, -0.4):
            pos = centre + Vector((x, y, z)) + u * r * 0.98
            blossom(flowers, pos, u, rand.uniform(0.07, 0.1), 0 if rand.random() < 0.6 else 1, rand)
    obj_from_bm("E_canopy", canopy, ["Leaf_B"], root)
    obj_from_bm("E_blossom", flowers, ["Blossom_Pink", "Blossom_White", "Blossom_Centre"], root)


# ── Scene ──

def label(text, loc):
    cu = bpy.data.curves.new(f"LBL_{text}", "FONT")
    cu.body = text
    cu.size = 0.5
    cu.align_x = "CENTER"
    o = bpy.data.objects.new(f"LBL_{text}", cu)
    o.location = loc
    o.rotation_euler = (math.radians(62), 0, 0)
    mat = bpy.data.materials.new("Label")
    mat.diffuse_color = (0.12, 0.12, 0.2, 1)
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.05, 0.1, 1)
    cu.materials.append(mat)
    B.COLL.objects.link(o)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    B.COLL = bpy.data.collections.new("Concepts")
    bpy.context.scene.collection.children.link(B.COLL)
    makers = [("A", concept_a), ("B", concept_b), ("C", concept_c), ("D", concept_d), ("E", concept_e)]
    spacing = 3.3
    for i, (letter, make) in enumerate(makers):
        x = (i - 2) * spacing
        tile = B.new_empty(f"TILE_{letter}", (x, 0, 0))
        B.tile_layers(tile, f"TILE_{letter}")
        B.scatter_decor(tile, f"TILE_{letter}", 31 + i, keep_clear=0.7)
        root = B.new_empty(f"TREE_{letter}", (x, 0, 0))
        make(root)
        label(letter, (x, -2.2, 0.05))

    scene = bpy.context.scene
    world = bpy.data.worlds.new("Studio")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.93, 0.86, 0.72, 1)
    bg.inputs["Strength"].default_value = 0.85
    sun = bpy.data.objects.new("LGT_key", bpy.data.lights.new("LGT_key", "SUN"))
    sun.data.energy = 3.5
    sun.data.angle = math.radians(25)  # broad, soft clay shadows
    sun.rotation_euler = (math.radians(48), math.radians(12), math.radians(-40))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("CAM_main", bpy.data.cameras.new("CAM_main"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 17.5
    cam.location = (0, -15, 8.6)
    cam.rotation_euler = (math.radians(64), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1800, 760
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = os.path.join(HERE, "concepts.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "concepts.blend"))
    bpy.ops.render.render(write_still=True)
    print("CONCEPTS_OK")


if __name__ == "__main__":
    main()
