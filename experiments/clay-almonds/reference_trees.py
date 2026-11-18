"""
Trees matched to Harry's two reference dioramas (2026-11-11):

  P  Tiered pine — stacked bell-shaped tiers with soft panel creases, a
     pointed tip and a short dark trunk (reference 1, and the pines in 2).
  R  Round tree  — one big ball canopy with a fine pebbly surface on a slim
     trunk that forks at the top and flares into roots (reference 2).

  blender --background --factory-startup --python experiments/clay-almonds/reference_trees.py
  ... add  -- --preview-only   to skip the export while tuning shapes

Writes experiments/clay-almonds/reference-trees.png (a diorama to hold up
against the references) and public/forest3d/tree-reference.glb for the 3D
forest: roots TREE_P0..2, TREE_R0..2, TILE_grass, TILE_pond, with ambient
occlusion baked into vertex colours. Canopy materials Leaf_A/B/C
(light/mid/dark) and Blossom_* are recoloured per look by the forest;
children named *_blossom are shown only on flowering looks.
"""

import importlib.util
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
spec = importlib.util.spec_from_file_location("concepts", os.path.join(HERE, "concepts.py"))
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)
B = C.B
TOP = B.TOP

B.PALETTE.update({
    "Bark_Dark": "#7B4A30", "Ball_B": "#5FB04E",
    # ground like the references: bright grass over a cream layer over brown earth
    "Grass": "#8CCB4F", "Soil": "#EDD8AE", "Soil_Deep": "#8E5A40",
})
LOOKS = {  # light, mid, dark — the forest's own looks, for the preview only
    "spring": ("#C8EA7C", "#9CD055", "#7BB443"),
    "summer": ("#7FC484", "#55A65F", "#3F8A4E"),
    "teal": ("#6FC5A0", "#46A583", "#2F8468"),
    "blossom": ("#A6DD8C", "#7CC36B", "#5FA35A"),
    "autumn": ("#FBC165", "#F0973D", "#D9782E"),
}
for look, cols in LOOKS.items():
    for letter, col in zip("ABC", cols):
        B.PALETTE[f"Leaf_{letter}_{look}"] = col
    B.PALETTE[f"Ball_B_{look}"] = cols[1]


# ── P: tiered pine ──

# One tier's outline as (radius, height) fractions: from the hidden inner
# underside, round a crisp bottom rim, then straight up the side.
TIER_PROFILE = [(0.3, 0.13), (0.7, 0.05), (0.93, 0.0), (1.0, 0.035), (0.985, 0.1), (0.3, 1.0)]
TIP_PROFILE = [(0.3, 0.13), (0.7, 0.05), (0.93, 0.0), (1.0, 0.035), (0.985, 0.1), (0.5, 0.75)]
UNDERSIDE_RINGS = 2  # the first rings of the profile face down: shaded darker


def tier(bm, z0, radius, height, panels, twist, tip=False):
    """A bell of flat panels with a crease between each (sharp edges are set from the angle later)."""
    profile = TIP_PROFILE if tip else TIER_PROFILE
    rings = []
    for pr, pz in profile:
        rings.append([bm.verts.new((math.cos(s / panels * math.tau + twist) * radius * pr,
                                    math.sin(s / panels * math.tau + twist) * radius * pr, z0 + pz * height)) for s in range(panels)])
    for k in range(len(rings) - 1):
        for s in range(panels):
            f = bm.faces.new((rings[k][s], rings[k][(s + 1) % panels], rings[k + 1][(s + 1) % panels], rings[k + 1][s]))
            f.material_index = 1 if k < UNDERSIDE_RINGS else 0
            f.smooth = True
    if tip:
        point = bm.verts.new((0, 0, z0 + 1.75 * height))
        for s in range(panels):
            bm.faces.new((rings[-1][s], rings[-1][(s + 1) % panels], point)).smooth = True


PINES = [  # tiers, base radius, how fast tiers shrink, how tall each tier is for its width, trunk showing
    dict(tiers=6, radius=0.8, shrink=0.8, steep=1.25, trunk=0.52),
    dict(tiers=5, radius=0.78, shrink=0.79, steep=1.3, trunk=0.46),
    dict(tiers=7, radius=0.8, shrink=0.83, steep=1.15, trunk=0.56),
]


def concept_p(root, v=0):
    p = PINES[v % len(PINES)]
    trunk = bmesh.new()
    depth = p["trunk"] + 0.3
    bmesh.ops.create_cone(trunk, cap_ends=True, cap_tris=False, segments=12, radius1=0.17, radius2=0.13,
                          depth=depth, matrix=Matrix.Translation((0, 0, TOP - 0.03 + depth / 2)))
    B.new_object("P_trunk", trunk, ["Bark_Dark"], root)
    bm = bmesh.new()
    z, radius = TOP + p["trunk"], p["radius"]
    for i in range(p["tiers"]):
        height = radius * p["steep"]
        tier(bm, z, radius, height, panels=10, twist=i * 0.2 + v, tip=(i == p["tiers"] - 1))
        z += height * 0.5
        radius *= p["shrink"]
    o = B.new_object("P_canopy", bm, ["Leaf_B", "Leaf_C"], root)
    o.data.set_sharp_from_angle(angle=math.radians(22))  # creases between panels and under each rim; smooth up the side


# ── R: round tree ──

ROUNDS = [  # ball radius, squash, trunk height, lean, extra ball (offset, radius) or None
    dict(radius=0.8, squash=0.96, trunk=0.95, lean=0.06, extra=None),
    dict(radius=0.7, squash=0.97, trunk=1.1, lean=-0.08, extra=((0.52, 0.1, -0.3), 0.42)),
    dict(radius=0.86, squash=0.93, trunk=0.82, lean=0.04, extra=None),
]


def ball_material(name):
    """Canopy material for the round trees. In Blender renders it gets a fine
    dotted bump like the reference; the web forest gets the same effect from
    speckled vertex colours (speckle(), below)."""
    m = B.material(name)
    nt = m.node_tree
    if "Dots" not in nt.nodes:
        coords = nt.nodes.new("ShaderNodeTexCoord")
        dots = nt.nodes.new("ShaderNodeTexVoronoi")
        dots.name = "Dots"
        dots.inputs["Scale"].default_value = 34
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.55
        bump.inputs["Distance"].default_value = 0.03
        nt.links.new(coords.outputs["Object"], dots.inputs["Vector"])
        nt.links.new(dots.outputs["Distance"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], nt.nodes["Principled BSDF"].inputs["Normal"])
    return m


def round_ball(bm, centre, radius, squash, seed, subdivisions=4):
    g = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    off = Vector((seed * 1.7, seed * 0.9, seed * 2.3))
    for vert in g["verts"]:
        d = vert.co.normalized()
        r = radius * (1 + 0.022 * noise.noise(d * 1.5 + off))  # hand-made, not a perfect ball
        vert.co = centre + Vector((d.x * r, d.y * r, d.z * r * squash))
    faces = C.faces_of(g)
    for f in faces:
        f.smooth = True
    return faces


LOW = (2, 6)  # bevel and length resolution for the round trees' trunk, fork and roots: small on screen


def slim_trunk(root, height, lean, base_r=0.115):
    top = TOP + height
    pts = [Vector((0, 0, TOP - 0.03)), Vector((lean * 1.2, 0.02, TOP + height * 0.4)), Vector((-lean * 0.6, -0.02, TOP + height * 0.78)), Vector((lean * 0.2, 0, top + 0.1))]
    meshes = [B.tube("R_trunk_c", pts, [1.5, 0.95, 0.8, 0.7], base_r, *LOW)]
    for side in (-1, 1):  # the fork holding the canopy
        meshes.append(B.tube("R_fork_c", [Vector((lean * 0.1, 0, top - 0.28)), Vector((side * 0.2, side * 0.05, top - 0.02)), Vector((side * 0.36, side * 0.08, top + 0.22))],
                             [0.85, 0.65, 0.5], base_r * 0.7, *LOW))
    rand = random.Random(int(height * 1000))
    for i in range(5):  # roots flaring out across the grass
        a = i / 5 * math.tau + rand.uniform(-0.25, 0.25)
        reach = rand.uniform(0.3, 0.42)
        meshes.append(B.tube("R_root_c", [Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, TOP + 0.24)), Vector((math.cos(a) * reach * 0.5, math.sin(a) * reach * 0.5, TOP + 0.07)),
                                           Vector((math.cos(a) * reach, math.sin(a) * reach, TOP - 0.02))], [1.1, 0.8, 0.35], base_r * 0.75, *LOW))
    B.new_object("R_trunk", B.join_meshes("R_trunk", meshes), ["Bark_Dark"], root)
    return top


def light_blossom(bm, pos, normal, size, mat_petal, rand):
    """concepts.blossom with coarser petals: the flowers are a few pixels wide in the forest."""
    z = normal.normalized()
    x = z.orthogonal().normalized()
    y = z.cross(x)
    rot = Matrix((x, y, z)).transposed().to_4x4()
    for k in range(5):
        a = k / 5 * math.tau + rand.uniform(-0.1, 0.1)
        m = (Matrix.Translation(pos) @ rot @ Matrix.Rotation(a, 4, "Z")
             @ Matrix.Translation((size * 0.55, 0, 0)) @ Matrix.Diagonal((size * 0.55, size * 0.38, size * 0.12, 1)))
        for f in C.faces_of(bmesh.ops.create_uvsphere(bm, u_segments=5, v_segments=3, radius=1.0, matrix=m)):
            f.material_index = mat_petal
            f.smooth = True
    for f in C.faces_of(bmesh.ops.create_uvsphere(bm, u_segments=5, v_segments=3, radius=size * 0.25, matrix=Matrix.Translation(pos + z * size * 0.08))):
        f.material_index = 2


def concept_r(root, v=0):
    s = ROUNDS[v % len(ROUNDS)]
    top = slim_trunk(root, s["trunk"], s["lean"])
    centre = Vector((s["lean"] * 0.2, 0, top + s["radius"] * s["squash"] * 0.72))
    canopy, flowers = bmesh.new(), bmesh.new()
    balls = [(centre, s["radius"])]
    if s["extra"]:
        (ox, oy, oz), er = s["extra"]
        balls.append((centre + Vector((ox, oy, oz)), er))
    rand = random.Random(40 + v)
    for i, (c, r) in enumerate(balls):
        round_ball(canopy, c, r, s["squash"], seed=3 + v * 5 + i, subdivisions=3)  # 4 looked no different at forest size, at 4x the triangles
        for u in B.fib_points(int(30 * r / 0.8), -0.35):
            pos = c + Vector((u.x * r, u.y * r, u.z * r * s["squash"])) * 0.99
            light_blossom(flowers, pos, u, rand.uniform(0.075, 0.105), 0 if rand.random() < 0.6 else 1, rand)
    ball_material("Ball_B")
    B.new_object("R_canopy", canopy, ["Ball_B"], root)
    B.new_object("R_blossom", flowers, ["Blossom_Pink", "Blossom_White", "Blossom_Centre"], root)


DESIGNS = {"P": concept_p, "R": concept_r}
VARIANTS = 3


# ── Ground detail: the mushrooms, stumps, bushes, rocks, grass and flowers the references are full of ──

B.PALETTE.update({
    "Mush_Red": "#E8553A", "Mush_Orange": "#F29A3A", "Mush_Stem": "#F3E3C8", "Dot": "#FFFFFF",
    "Stump": "#A0683F", "Stump_Top": "#EBC894",
    "Rock": "#A9B0B4", "Rock_Light": "#C3C8CA",
    "Bush": "#58AB48", "Bush_Light": "#80C858",
    "Blade": "#4E9F45", "Blade_Light": "#7CC452", "Plant": "#46A05A", "Plant_Light": "#6DBB5C",
    "Flower_White": "#FFFFFF", "Flower_Orange": "#F58A2E", "Flower_Red": "#E9503B", "Flower_Pink": "#F5A3B8", "Flower_Eye": "#F7C93B",
    "Decor": "#FFFFFF",  # the exported decor is one mesh in this material, its colours baked into the vertices
})
TILE_VARIANTS = 6
KEEP_CLEAR = 0.62  # nothing this close to the middle of a tile: that is where the tree stands
REACH = 1.22       # nor further out than this: the hex's edge is 1.3 away at its nearest


class Decor:
    """All of one tile's props in a single mesh, one material slot per colour."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def paint(self, geom, mat, smooth=True):
        i = self.slot(mat)
        for f in C.faces_of(geom):
            f.material_index = i
            f.smooth = smooth

    def sphere(self, mat, matrix, segs=(8, 5)):
        self.paint(bmesh.ops.create_uvsphere(self.bm, u_segments=segs[0], v_segments=segs[1], radius=1.0, matrix=matrix), mat)

    def ball(self, mat, matrix, subdivisions=2, lumps=0.0, seed=0.0, smooth=True):
        g = bmesh.ops.create_icosphere(self.bm, subdivisions=subdivisions, radius=1.0)
        for v in g["verts"]:
            if lumps:
                v.co *= 1 + lumps * noise.noise(v.co * 1.7 + Vector((seed, seed * 0.6, seed * 1.4)))
            v.co = matrix @ v.co
        self.paint(g, mat, smooth)

    def spike(self, mat, matrix, radius, height, segs=4):
        g = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=True, segments=segs, radius1=radius, radius2=0.0, depth=height,
                                  matrix=matrix @ Matrix.Translation((0, 0, height / 2)))
        self.paint(g, mat)

    def lathe(self, matrix, profile, mat, segs=10):
        """Spin a profile of (radius, height[, material for the band above]) round the z axis; radius 0 closes to a point."""
        rings = []
        for p in profile:
            r, z = p[0], p[1]
            if r == 0:
                rings.append([self.bm.verts.new(matrix @ Vector((0, 0, z)))])
            else:
                rings.append([self.bm.verts.new(matrix @ Vector((math.cos(s / segs * math.tau) * r, math.sin(s / segs * math.tau) * r, z))) for s in range(segs)])
        for k in range(len(rings) - 1):
            a, b = rings[k], rings[k + 1]
            i = self.slot(profile[k][2] if len(profile[k]) > 2 else mat)
            for s in range(segs):
                t = (s + 1) % segs
                f = self.bm.faces.new((a[s], a[t], b[0]) if len(b) == 1 else (a[s], a[t], b[t], b[s]))
                f.material_index = i
                f.smooth = True

    def finish(self, name, parent):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(B.material(m))
        me.set_sharp_from_angle(angle=math.radians(48))  # crisp rims on caps and stumps, soft everywhere else
        obj = bpy.data.objects.new(name, me)
        B.COLL.objects.link(obj)
        obj.parent = parent
        obj["baked_colour"] = True  # on export its colours go into the vertices (flatten_colours)
        return obj


def at(x, y, z=0.0):
    return Matrix.Translation((x, y, TOP + z))


def scaled(sx, sy=None, sz=None):
    return Matrix.Diagonal((sx, sx if sy is None else sy, sx if sz is None else sz, 1))


def mushroom(d, x, y, rand, s=1.0, cap="Mush_Red"):
    base = at(x, y, -0.01) @ Matrix.Rotation(rand.uniform(-0.14, 0.14), 4, "X") @ Matrix.Rotation(rand.uniform(-0.14, 0.14), 4, "Y")
    d.lathe(base, [(0.07 * s, 0), (0.055 * s, 0.09 * s), (0.05 * s, 0.17 * s)], "Mush_Stem", segs=8)
    R, H = 0.165 * s, 0.13 * s  # the cap: a dome with a flat pale underside
    d.lathe(base @ Matrix.Translation((0, 0, 0.14 * s)),
            [(0.04 * s, 0.0, "Mush_Stem"), (R * 0.96, -0.004, "Mush_Stem"), (R, 0.022 * s), (R * 0.9, H * 0.48), (R * 0.66, H * 0.8), (R * 0.33, H * 0.96), (0, H)], cap)
    dots = [(0.0, 0.0)] + [(rand.uniform(0.5, 0.78), k / 5 * math.tau + rand.uniform(-0.3, 0.3)) for k in range(5)]
    for f, a in dots:
        z = 0.14 * s + 0.022 * s + (H - 0.022 * s) * math.sqrt(max(0.0, 1 - f * f)) - 0.004 * s
        d.ball("Dot", base @ Matrix.Translation((math.cos(a) * R * f * 0.92, math.sin(a) * R * f * 0.92, z)) @ scaled(0.03 * s, 0.03 * s, 0.018 * s), subdivisions=1)


def stump(d, x, y, rand, s=1.0):
    base = at(x, y, -0.01) @ Matrix.Rotation(rand.uniform(0, math.tau), 4, "Z")
    d.lathe(base, [(0.26 * s, 0), (0.205 * s, 0.05 * s), (0.19 * s, 0.2 * s), (0.185 * s, 0.245 * s, "Stump_Top"), (0.1 * s, 0.25 * s, "Stump"), (0.085 * s, 0.252 * s, "Stump_Top"), (0, 0.254 * s)],
            "Stump", segs=12)
    for k in range(3):  # roots gripping the grass
        a = k / 3 * math.tau + rand.uniform(-0.3, 0.3)
        d.ball("Stump", base @ Matrix.Rotation(a, 4, "Z") @ Matrix.Translation((0.2 * s, 0, 0.03 * s)) @ scaled(0.11 * s, 0.05 * s, 0.045 * s), subdivisions=1)


def rock(d, x, y, rand, s=1.0, mat=None):
    size = 0.15 * s
    m = at(x, y, size * 0.32) @ Matrix.Rotation(rand.uniform(0, math.tau), 4, "Z") @ scaled(size * 1.3, size, size * 0.8)
    d.ball(mat or rand.choice(["Rock", "Rock", "Rock_Light"]), m, subdivisions=1, lumps=0.14, seed=rand.uniform(0, 50), smooth=False)


def bush(d, x, y, rand, s=1.0, berries=None):
    balls = [(0.0, 0.0, 0.2 * s)]
    turn = rand.uniform(0, math.tau)
    for k in range(rand.choice([2, 3])):
        a = turn + k * 2.1
        balls.append((math.cos(a) * 0.17 * s, math.sin(a) * 0.17 * s, rand.uniform(0.12, 0.155) * s))
    for i, (ox, oy, r) in enumerate(balls):
        d.ball("Bush" if i % 2 == 0 else "Bush_Light", at(x + ox, y + oy, r * 0.72) @ scaled(r, r, r * 0.92), subdivisions=2, lumps=0.07, seed=rand.uniform(0, 50))
        if berries:
            for u in B.fib_points(7, 0.15):
                d.ball(berries, at(x + ox + u.x * r, y + oy + u.y * r, r * 0.72 + u.z * r * 0.92) @ scaled(0.026 * s), subdivisions=1)


def tuft(d, x, y, rand, s=1.0):
    turn = rand.uniform(0, math.tau)
    for k in range(6):
        a = turn + k / 6 * math.tau + rand.uniform(-0.3, 0.3)
        m = at(x + math.cos(a) * 0.035 * s, y + math.sin(a) * 0.035 * s, -0.01) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(rand.uniform(0.12, 0.55), 4, "Y")
        d.spike("Blade" if rand.random() < 0.6 else "Blade_Light", m, 0.04 * s, rand.uniform(0.2, 0.36) * s)


def plant(d, x, y, rand, s=1.0):
    turn = rand.uniform(0, math.tau)
    for k in range(5):
        a = turn + k / 5 * math.tau + rand.uniform(-0.2, 0.2)
        m = at(x, y, 0.015) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(-rand.uniform(0.45, 0.85), 4, "Y") @ Matrix.Translation((0.16 * s, 0, 0)) @ scaled(0.17 * s, 0.075 * s, 0.02 * s)
        d.sphere("Plant" if k % 2 == 0 else "Plant_Light", m, segs=(6, 4))


def flower(d, x, y, rand, s=1.0, colour="Flower_White"):
    stem = rand.uniform(0.09, 0.16) * s
    d.spike("Blade", at(x, y, -0.01), 0.016 * s, stem + 0.02)
    head = at(x, y, stem) @ Matrix.Rotation(rand.uniform(0, math.tau), 4, "Z") @ Matrix.Rotation(rand.uniform(0.2, 0.6), 4, "Y")  # tipped, so it shows from the side
    for k in range(5):
        d.sphere(colour, head @ Matrix.Rotation(k / 5 * math.tau, 4, "Z") @ Matrix.Translation((0.05 * s, 0, 0)) @ scaled(0.05 * s, 0.036 * s, 0.014 * s), segs=(5, 3))
    d.sphere("Flower_Eye", head @ Matrix.Translation((0, 0, 0.008 * s)) @ scaled(0.026 * s, 0.026 * s, 0.02 * s), segs=(5, 3))


def ground_detail(parent, name, variant, seed, avoid=()):
    """Scatter one tile's props in the ring between the tree and the tile's edge.
    The big pieces go towards the front (-y, the forest camera's side), where
    the tree doesn't hide them. avoid: extra (x, y, radius) spots to keep clear.
    Returns the decor object and the (x, y) left free for an animal, if any."""
    rand = random.Random(seed)
    d = Decor()
    taken = [(0.0, 0.0, KEEP_CLEAR), *avoid]

    def spot(radius, front=False, near=None):
        for _ in range(80):
            if near:
                a, dist = rand.uniform(0, math.tau), rand.uniform(near[2] * 0.6, near[2])
                x, y = near[0] + math.cos(a) * dist, near[1] + math.sin(a) * dist
            else:
                a = math.radians(rand.uniform(-165, -15)) if front else rand.uniform(0, math.tau)
                dist = rand.uniform(KEEP_CLEAR + radius, max(KEEP_CLEAR + radius, REACH - radius))
                x, y = math.cos(a) * dist, math.sin(a) * dist
            if math.hypot(x, y) + radius > REACH + 0.02:
                continue
            if all(math.hypot(x - tx, y - ty) >= tr + radius for tx, ty, tr in taken):
                taken.append((x, y, radius))
                return x, y
        return None

    def put(make, radius, count=1, front=False, near=None, **kw):
        placed = []
        for _ in range(count):
            p = spot(radius, front, near)
            if p:
                make(d, p[0], p[1], rand, **{k: (v() if callable(v) else v) for k, v in kw.items()})
                placed.append(p)
        return placed

    colours = lambda *names: (lambda: rand.choice(names))
    size = lambda lo, hi: (lambda: rand.uniform(lo, hi))
    animal_spot = spot(0.3, front=True)  # kept free: the forest may stand an animal here
    if variant == 0:    # open meadow
        put(plant, 0.2, 1, s=1.1)
        put(flower, 0.09, 5, s=size(1.3, 1.7), colour=colours("Flower_White", "Flower_Orange", "Flower_Pink"))
        put(tuft, 0.1, 5, s=size(0.9, 1.3))
    elif variant == 1:  # a big toadstool and its little ones
        big = put(mushroom, 0.3, 1, front=True, s=2.0)
        if big:
            put(mushroom, 0.13, 2, near=(*big[0], 0.5), s=size(0.8, 1.0))
        put(rock, 0.14, 1, s=1.0)
        put(flower, 0.09, 2, s=size(1.3, 1.6), colour=colours("Flower_White", "Flower_Orange"))
        put(tuft, 0.1, 5, s=size(0.9, 1.3))
    elif variant == 2:  # a stump with orange mushrooms
        st = put(stump, 0.27, 1, front=True, s=1.05)
        if st:
            put(mushroom, 0.12, 3, near=(*st[0], 0.46), s=size(0.7, 0.95), cap="Mush_Orange")
        put(plant, 0.2, 1, s=1.0)
        put(flower, 0.09, 3, s=size(1.3, 1.6), colour=colours("Flower_White", "Flower_Red"))
        put(tuft, 0.1, 4, s=size(0.9, 1.3))
    elif variant == 3:  # bushes
        put(bush, 0.3, 1, front=True, s=1.15, berries="Flower_Orange")
        put(bush, 0.26, 1, s=1.0)
        put(rock, 0.15, 1, s=1.1)
        put(flower, 0.09, 3, s=size(1.3, 1.6), colour=colours("Flower_White", "Flower_Pink"))
        put(tuft, 0.1, 4, s=size(0.9, 1.3))
    elif variant == 4:  # rocks
        big = put(rock, 0.27, 1, front=True, s=1.9, mat="Rock")
        if big:
            put(rock, 0.13, 2, near=(*big[0], 0.44), s=size(0.8, 1.0))
        put(mushroom, 0.14, 1, s=0.95)
        put(plant, 0.2, 1, s=1.0)
        put(flower, 0.09, 2, s=size(1.3, 1.6), colour=colours("Flower_White", "Flower_Orange"))
        put(tuft, 0.1, 5, s=size(0.9, 1.4))
    else:               # leafy, with flowers
        put(plant, 0.22, 2, front=True, s=1.25)
        put(bush, 0.24, 1, s=0.9, berries="Flower_White")
        put(mushroom, 0.14, 2, s=size(0.8, 1.0))
        put(flower, 0.09, 5, s=size(1.3, 1.7), colour=colours("Flower_Orange", "Flower_Red", "Flower_White"))
        put(tuft, 0.1, 3, s=size(0.9, 1.3))
    if animal_spot:
        mark = B.new_empty(f"{name}_spot", (animal_spot[0], animal_spot[1], TOP))
        mark.parent = parent
    return d.finish(f"{name}_decor", parent), animal_spot


# ── Animals: the deer, foxes, rabbits, sheep, boar and birds of the second reference ──
# Each is one mesh, facing +x with its feet at z = 0; the forest stands them on a tile's free spot.

B.PALETTE.update({
    "Deer": "#DB8B49", "Stag": "#7D4B2E", "Muzzle": "#F3DFC4", "Dark": "#3A2A22", "White": "#FFFFFF", "Antler": "#EAD9B4",
    "Fox": "#EC7428", "Rabbit": "#BD8A5C", "Pink": "#F2A7A7", "Wool": "#F7F2E8", "Sheep_Face": "#D8C0A0",
    "Boar": "#A0612F", "Boar_Dark": "#6E4226", "Boar_Snout": "#D49C7A", "Beak": "#F29A3A", "Wing_Tip": "#77858F",
    "Rock_Dark": "#8F989D", "Moss": "#6DB84F",
})


def blob(d, mat, loc, scale, rot=(0, 0, 0), segs=(10, 6)):
    s = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    d.sphere(mat, Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1)), segs)


def leg(d, mat, x, y, top, r, hoof="Dark", hoof_h=0.04):
    d.lathe(Matrix.Translation((x, y, 0)), [(r * 0.95, 0, hoof), (r * 0.95, hoof_h), (r * 1.25, top)], mat, segs=6)


def prong(d, mat, start, direction, length, r):
    """A cone from start along direction; returns where it ends."""
    aim = Vector(direction).normalized()
    d.spike(mat, Matrix.Translation(start) @ Vector((0, 0, 1)).rotation_difference(aim).to_matrix().to_4x4(), r, length)
    return Vector(start) + aim * length


def deer(d, stag=False):
    coat = "Stag" if stag else "Deer"
    blob(d, coat, (0, 0, 0.37), (0.215, 0.105, 0.115))                   # body
    blob(d, coat, (0.13, 0, 0.4), (0.1, 0.095, 0.12))                    # chest
    blob(d, coat, (0.215, 0, 0.52), (0.06, 0.055, 0.14), (0, 0.45, 0))   # neck
    blob(d, coat, (0.29, 0, 0.655), (0.088, 0.064, 0.064))               # head
    blob(d, "Muzzle", (0.365, 0, 0.635), (0.045, 0.042, 0.038))
    blob(d, "Dark", (0.405, 0, 0.642), 0.015, segs=(6, 4))
    blob(d, "Muzzle", (-0.215, 0, 0.42), (0.035, 0.035, 0.05))           # tail
    for s in (-1, 1):
        blob(d, "Dark", (0.325, s * 0.052, 0.675), 0.014, segs=(6, 4))
        blob(d, coat, (0.245, s * 0.085, 0.71), (0.022, 0.05, 0.03), (s * -0.5, 0, 0))  # ear
        for x in (-0.14, 0.14):
            leg(d, coat, x, s * 0.055, 0.31, 0.026)
    if stag:
        for s in (-1, 1):
            fork = prong(d, "Antler", (0.265, s * 0.035, 0.7), (-0.2, s * 0.5, 1), 0.15, 0.017)
            prong(d, "Antler", fork - Vector((0, 0, 0.03)), (-0.4, s * 0.25, 1), 0.15, 0.014)
            prong(d, "Antler", fork - Vector((0, 0, 0.03)), (0.7, s * 0.35, 0.7), 0.11, 0.013)
            prong(d, "Antler", (0.262, s * 0.05, 0.75), (0.8, s * 0.3, 0.5), 0.09, 0.012)
    else:
        for x, y in ((-0.12, 0.05), (-0.04, -0.06), (0.04, 0.045), (-0.09, -0.02), (0.0, 0.0), (0.09, -0.04), (-0.15, 0.0), (0.1, 0.06)):
            z = 0.37 + 0.115 * math.sqrt(1 - (x / 0.215) ** 2 - (y / 0.105) ** 2)
            blob(d, "White", (x, y, z - 0.004), (0.02, 0.02, 0.008), segs=(6, 4))


def fox(d):
    blob(d, "Fox", (0, 0, 0.2), (0.17, 0.078, 0.082))
    blob(d, "White", (0.11, 0, 0.175), (0.07, 0.06, 0.062))              # chest
    blob(d, "Fox", (0.2, 0, 0.3), (0.08, 0.074, 0.066))                  # head
    blob(d, "White", (0.272, 0, 0.283), (0.056, 0.036, 0.03))            # snout
    blob(d, "Dark", (0.325, 0, 0.29), 0.013, segs=(6, 4))
    blob(d, "Fox", (-0.25, 0, 0.25), (0.13, 0.056, 0.058), (0, 0.5, 0))  # tail, held up
    blob(d, "White", (-0.355, 0, 0.31), 0.045)
    for s in (-1, 1):
        blob(d, "Dark", (0.247, s * 0.047, 0.318), 0.012, segs=(6, 4))
        d.spike("Fox", Matrix.Translation((0.175, s * 0.045, 0.335)), 0.032, 0.085)
        for x in (-0.11, 0.11):
            leg(d, "Fox", x, s * 0.045, 0.16, 0.022, hoof="Dark", hoof_h=0.07)


def rabbit(d):
    blob(d, "Rabbit", (-0.02, 0, 0.12), (0.125, 0.095, 0.115))
    blob(d, "Rabbit", (0.1, 0, 0.255), (0.078, 0.07, 0.068))
    blob(d, "White", (-0.14, 0, 0.1), 0.042)
    blob(d, "Pink", (0.176, 0, 0.25), 0.012, segs=(6, 4))
    for s in (-1, 1):
        blob(d, "Rabbit", (0.07, s * 0.032, 0.385), (0.022, 0.02, 0.09), (s * -0.15, -0.2, 0))  # ear
        blob(d, "Pink", (0.079, s * 0.032, 0.385), (0.012, 0.012, 0.07), (s * -0.15, -0.2, 0))
        blob(d, "Dark", (0.15, s * 0.046, 0.272), 0.012, segs=(6, 4))
        blob(d, "Rabbit", (0.09, s * 0.045, 0.03), (0.042, 0.026, 0.026))                      # front paw
        blob(d, "Rabbit", (-0.02, s * 0.085, 0.05), (0.07, 0.035, 0.045))                      # haunch


def sheep(d):
    d.ball("Wool", Matrix.Translation((0, 0, 0.27)) @ scaled(0.2, 0.15, 0.15), subdivisions=2, lumps=0.08, seed=4.0)
    for x, y, z, r in ((0.1, 0.08, 0.35, 0.09), (0.1, -0.08, 0.35, 0.09), (-0.1, 0.08, 0.35, 0.09), (-0.1, -0.08, 0.35, 0.09), (0, 0, 0.4, 0.1), (-0.19, 0, 0.3, 0.075)):
        d.ball("Wool", Matrix.Translation((x, y, z)) @ scaled(r), subdivisions=2)
    blob(d, "Sheep_Face", (0.225, 0, 0.33), (0.07, 0.056, 0.066))
    d.ball("Wool", Matrix.Translation((0.19, 0, 0.4)) @ scaled(0.055), subdivisions=2)
    for s in (-1, 1):
        blob(d, "Sheep_Face", (0.2, s * 0.072, 0.35), (0.02, 0.04, 0.018))
        blob(d, "Dark", (0.268, s * 0.036, 0.345), 0.011, segs=(6, 4))
        for x in (-0.1, 0.1):
            leg(d, "Sheep_Face", x, s * 0.07, 0.17, 0.024)


def boar(d):
    blob(d, "Boar", (0, 0, 0.21), (0.24, 0.125, 0.135))
    blob(d, "Boar_Dark", (-0.03, 0, 0.332), (0.16, 0.032, 0.03))         # the ridge along its back
    blob(d, "Boar", (0.22, 0, 0.2), (0.11, 0.095, 0.1))                  # head
    blob(d, "Boar_Snout", (0.33, 0, 0.17), (0.045, 0.05, 0.045))
    blob(d, "Boar", (-0.245, 0, 0.25), (0.03, 0.014, 0.014))             # tail
    for s in (-1, 1):
        blob(d, "Dark", (0.372, s * 0.018, 0.172), 0.009, segs=(6, 4))   # nostril
        blob(d, "Dark", (0.29, s * 0.062, 0.24), 0.012, segs=(6, 4))
        d.spike("White", Matrix.Translation((0.31, s * 0.05, 0.15)), 0.011, 0.045)      # tusk
        d.spike("Boar_Dark", Matrix.Translation((0.2, s * 0.07, 0.275)), 0.035, 0.07)   # ear
        for x in (-0.13, 0.13):
            leg(d, "Boar", x, s * 0.065, 0.13, 0.03)


ANIMALS = {"deer": deer, "stag": lambda d: deer(d, stag=True), "fox": fox, "rabbit": rabbit, "sheep": sheep, "boar": boar}


def build_animal(kind, loc, name=None, facing=0.0):
    root = B.new_empty(name or f"ANIMAL_{kind}", loc)
    root.rotation_euler = (0, 0, facing)
    if kind == "stag":
        root.scale = (1.12, 1.12, 1.12)
    d = Decor()
    ANIMALS[kind](d)
    d.finish(f"{root.name}_body", root)
    return root


def build_bird(loc, name="ANIMAL_bird"):
    """In flight. The wings are their own objects, hinged at the shoulder, so the forest can flap them."""
    root = B.new_empty(name, loc)
    d = Decor()
    blob(d, "White", (0, 0, 0), (0.09, 0.04, 0.038))
    blob(d, "White", (0.085, 0, 0.018), 0.034)
    blob(d, "Wing_Tip", (-0.1, 0, 0.004), (0.055, 0.036, 0.008))  # tail
    prong(d, "Beak", (0.108, 0, 0.014), (1, 0, -0.1), 0.045, 0.014)
    for s in (-1, 1):
        blob(d, "Dark", (0.102, s * 0.022, 0.03), 0.008, segs=(6, 4))
    d.finish(f"{name}_body", root)
    for s, side in ((1, "L"), (-1, "R")):
        w = Decor()
        blob(w, "White", (0, s * 0.075, 0), (0.05, 0.085, 0.008))
        blob(w, "Wing_Tip", (-0.012, s * 0.14, 0), (0.035, 0.04, 0.007))
        wing = w.finish(f"{name}_wing{side}", root)
        wing.location = (0.0, s * 0.02, 0.012)
    return root


# ── Waterfall: where a river starts, its water pours out of a pile of rocks ──
# The water itself is drawn (and moved) by the forest; FALL_LINE is the path it
# follows and must stay in step with the same constants in forest3d.js.

FALL_H = 0.72   # the lip's height above the tile's grass
FALL_W = 0.46
FALL_LINE = [(-0.66, FALL_H + 0.012), (-0.2, FALL_H + 0.012), (-0.11, FALL_H + 0.008), (-0.05, FALL_H - 0.06), (-0.02, FALL_H - 0.18), (0.0, 0.3), (0.03, 0.03)]
FALL_POOL = (0.24, 0.4)  # the pool at its foot: how far along the flow, and its radius


def build_falls(loc, name="PROP_falls", facing=0.0, open_side=False):
    """Rocks only. The water flows towards +x: over the flat top of the middle
    block, between two taller boulders, and down the block's front face.
    open_side: leave the +y side nearly bare, for a river that turns that way
    out of the pool (the forest uses this to keep the fall facing the reader)."""
    root = B.new_empty(name, loc)
    root.rotation_euler = (0, 0, facing)
    d = Decor()
    i = d.slot("Rock_Dark")
    ring = [d.bm.verts.new((x, y, TOP + z)) for y in (-0.36, 0.36) for x, z in ((-0.9, -0.01), (-0.02, -0.01), (-0.1, FALL_H), (-0.9, FALL_H))]
    for quad in ((0, 1, 2, 3), (7, 6, 5, 4), (1, 5, 6, 2), (3, 2, 6, 7), (0, 3, 7, 4)):
        f = d.bm.faces.new([ring[k] for k in quad])
        f.material_index = i
        f.smooth = False
    boulders = [  # x, y, z, (sx, sy, sz), material, facets
        (-0.78, 0.0, 0.45, (0.3, 0.5, 0.62), "Rock", 2),          # behind: the water comes out from under it
        (-0.42, 0.56, 0.4, (0.34, 0.26, 0.58), "Rock_Light", 2),  # either side of the channel
        (-0.38, -0.56, 0.36, (0.36, 0.26, 0.52), "Rock", 2),
        (0.0, 0.52, 0.16, (0.2, 0.2, 0.24), "Rock", 1),           # at the foot
        (0.02, -0.5, 0.14, (0.18, 0.2, 0.2), "Rock_Light", 1),
        (0.26, 0.6, 0.06, (0.1, 0.1, 0.09), "Rock_Light", 1),
        (-0.72, 0.72, 0.1, (0.15, 0.13, 0.13), "Rock", 1),
        (-0.7, -0.74, 0.09, (0.13, 0.14, 0.12), "Rock_Light", 1),
    ]
    if open_side:  # just one slim rock against the block, where the river runs past
        boulders = [b for b in boulders if b[1] <= 0] + [(-0.6, 0.38, 0.22, (0.22, 0.09, 0.32), "Rock_Light", 1)]
    for n, (x, y, z, s, mat, facets) in enumerate(boulders):
        d.ball(mat, at(x, y, z) @ Matrix.Rotation(n * 1.3, 4, "Z") @ scaled(*s), subdivisions=facets, lumps=0.13, seed=n * 3.1, smooth=False)
    if not open_side:
        d.ball("Moss", at(-0.42, 0.56, 0.95) @ scaled(0.2, 0.16, 0.06), subdivisions=2, lumps=0.1, seed=2.0)  # moss on the rocks
    else:
        d.ball("Moss", at(-0.38, -0.56, 0.86) @ scaled(0.2, 0.16, 0.06), subdivisions=2, lumps=0.1, seed=2.0)
    d.ball("Moss", at(-0.8, -0.1, 1.04) @ scaled(0.18, 0.24, 0.055), subdivisions=2, lumps=0.1, seed=5.0)
    rand = random.Random(9)
    bush(d, 0.12, -0.86, rand, s=0.8, berries="Flower_White")
    tuft(d, 0.32, -0.62, rand, s=1.0)
    if not open_side:
        tuft(d, -0.1, 0.84, rand, s=1.2)
        tuft(d, -1.0, 0.45, rand, s=1.1)
        flower(d, 0.3, 0.8, rand, s=1.5, colour="Flower_Orange")
    else:
        tuft(d, -1.0, -0.42, rand, s=1.1)
        flower(d, -0.25, -0.95, rand, s=1.5, colour="Flower_Orange")
    d.finish(f"{name}_rock", root)
    return root


def falls_water_preview(root):
    """For the Blender render only: still water where the forest draws moving water."""
    bm = bmesh.new()
    half = FALL_W / 2
    line = [(x, TOP + z) for x, z in FALL_LINE] + [(FALL_POOL[0], TOP + 0.016)]
    rows = [(bm.verts.new((x, -half, z)), bm.verts.new((x, half, z))) for x, z in line]
    for (a, b), (c, e) in zip(rows, rows[1:]):
        bm.faces.new((a, b, e, c))
    bmesh.ops.create_circle(bm, cap_ends=True, segments=28, radius=FALL_POOL[1], matrix=Matrix.Translation((FALL_POOL[0], 0, TOP + 0.014)))
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, matrix=Matrix.Translation((0.8, 0, TOP + 0.012)) @ Matrix.Diagonal((1.0, 0.62, 1, 1)))
    B.new_object(f"{root.name}_water", bm, ["Water"], root)


# ── Preview: a small diorama to compare with the references ──

def hex_xy(q, r):
    return (2.25 * q, 2.6 * (r + q / 2))


def recolour(root, look):
    for o in root.children:
        if o.type != "MESH":
            continue
        for i, m in enumerate(o.data.materials):
            if m and m.name in ("Leaf_A", "Leaf_B", "Leaf_C"):
                o.data.materials[i] = B.material(f"{m.name}_{look}")
            elif m and m.name == "Ball_B":
                o.data.materials[i] = ball_material(f"Ball_B_{look}")


def build_preview():
    """Trees on a ring of hex tiles, lit and framed like the reference pictures."""
    layout = [  # (q, r), [(design, variant, look, offset, scale)]
        ((0, 0), [("R", 0, "blossom", (0, 0), 1.0)]),
        ((1, 0), [("P", 0, "summer", (0, 0.1), 1.0)]),
        ((0, 1), [("P", 2, "teal", (-0.2, 0.2), 1.0), ("P", 1, "spring", (0.75, -0.55), 0.55)]),
        ((-1, 1), [("P", 0, "spring", (0, 0.1), 1.0)]),
        ((-1, 0), [("R", 2, "summer", (0, 0), 1.0)]),
        ((0, -1), [("P", 1, "teal", (-0.55, 0.1), 0.72), ("R", 1, "spring", (0.45, -0.1), 0.8)]),
        ((1, -1), []),  # the waterfall
    ]
    cast = ["rabbit", "deer", "fox", "sheep", "stag", "boar"]
    n = 0
    for ti, ((q, r), trees) in enumerate(layout):
        x, y = hex_xy(q, r)
        t = B.new_empty(f"PV_tile_{q}_{r}", (x, y, 0))
        B.tile_layers(t, f"PV_tile_{q}_{r}")
        if not trees:
            falls_water_preview(build_falls((x, y, 0), f"PV_falls_{ti}", facing=math.radians(-60)))
            continue
        offset = [(ox, oy, 0.6 * scale) for _, _, _, (ox, oy), scale in trees if (ox, oy) != (0, 0)]
        _, free = ground_detail(t, f"PV_tile_{q}_{r}", ti % TILE_VARIANTS, 50 + ti, avoid=offset)
        if free:
            build_animal(cast[ti % len(cast)], (x + free[0], y + free[1], TOP), f"PV_animal_{ti}", facing=math.radians(-45 + (ti * 67) % 90 - 45))
        for design, variant, look, (ox, oy), scale in trees:
            root = B.new_empty(f"PV_{design}{variant}_{n}", (x + ox, y + oy, 0))
            DESIGNS[design](root, variant)
            for o in root.children:
                if o.name.startswith("R_blossom"):
                    o.hide_render = look != "blossom"
            recolour(root, look)
            root.scale = (scale, scale, scale)
            root.location.z = TOP * (1 - scale)
            n += 1
    return [o for o in B.COLL.all_objects if o.name.startswith("PV_")]


def studio(scene):
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.95, 0.9, 0.8, 1)
    bg.inputs["Strength"].default_value = 0.75
    sun = bpy.data.objects.new("LGT_key", bpy.data.lights.new("LGT_key", "SUN"))
    sun.data.energy = 2.6
    sun.data.angle = math.radians(22)
    sun.rotation_euler = (math.radians(46), math.radians(8), math.radians(-38))
    scene.collection.objects.link(sun)
    floor = bmesh.new()
    bmesh.ops.create_grid(floor, x_segments=1, y_segments=1, size=40, matrix=Matrix.Translation((0, 0, -0.5)))
    B.PALETTE["Backdrop"] = "#F4EAD8"
    B.new_object("PV_floor", floor, ["Backdrop"], None, smooth=False)


def render_preview(path):
    scene = bpy.context.scene
    studio(scene)
    cam = bpy.data.objects.new("CAM_ref", bpy.data.cameras.new("CAM_ref"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 10.5
    cam.location = (11, -11, 11.2)
    cam.rotation_euler = (math.radians(54.7), 0, math.radians(45))  # the references' isometric view
    scene.collection.objects.link(cam)
    scene.camera = cam
    # aim at the middle of the trees rather than the ground
    target = Vector((0, 0, 1.3))
    direction = Vector((0, 0, -1))
    direction.rotate(cam.rotation_euler)
    cam.location = target - direction * 20
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1300
    scene.view_settings.view_transform = "Standard"  # keeps the colours as bright as the references
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


# ── Export for the forest ──

AO_FLOOR = 0.5
SPECKLE = 0.16  # how much darker the darkest dots on a round canopy are


def speckle(mesh, seed):
    """Fine dots on the round canopies, as per-vertex darkening on top of the baked shading."""
    rand = random.Random(seed)
    shade = [1 - SPECKLE * rand.random() ** 1.5 for _ in mesh.vertices]
    data = mesh.color_attributes["AO"].data
    for loop in mesh.loops:
        val = data[loop.index].color[0] * shade[loop.vertex_index]
        data[loop.index].color = (val, val, val, 1)


def flatten_colours(o):
    """Fold a decor mesh's material colours into its vertex colours (colour x baked shading),
    leaving one material: every tile's props then cost the forest a single draw call."""
    me = o.data
    cols = [tuple(m.diffuse_color[:3]) for m in me.materials]
    data = me.color_attributes["AO"].data
    for poly in me.polygons:
        c = cols[poly.material_index]
        for li in poly.loop_indices:
            ao = data[li].color[0]
            data[li].color = (c[0] * ao, c[1] * ao, c[2] * ao, 1)
        poly.material_index = 0
    me.materials.clear()
    me.materials.append(B.material("Decor"))


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
            val = AO_FLOOR + (1 - AO_FLOOR) * d.color[0]
            d.color = (val, val, val, 1)
        if o.name.startswith("R_canopy"):
            speckle(o.data, len(o.data.vertices))


def export(glb):
    spacing = 3.6
    for row, (letter, make) in enumerate(DESIGNS.items()):
        for v in range(VARIANTS):
            make(B.new_empty(f"TREE_{letter}{v}", (60 + v * spacing, -row * spacing, 0)), v)
    for i in range(TILE_VARIANTS):  # the same grass tile, dressed six ways
        tile = B.new_empty(f"TILE_grass{i}", (60 + (VARIANTS + i) * spacing, 0, 0))
        B.tile_layers(tile, f"TILE_grass{i}")
        ground_detail(tile, f"TILE_grass{i}", i, 300 + i)
    for i, kind in enumerate(ANIMALS):
        build_animal(kind, (60 + i * spacing, -2 * spacing, 0))
    build_bird((60 + len(ANIMALS) * spacing, -2 * spacing, 0))
    build_falls((60, -3 * spacing, 0))
    build_falls((60 + spacing, -3 * spacing, 0), "PROP_falls_open", open_side=True)
    B.build_pond_tile((60 + VARIANTS * spacing, -spacing, 0))
    def in_preview(o):  # the diorama's pieces hang off PV_ roots
        while o:
            if o.name.startswith("PV_"):
                return True
            o = o.parent
        return False

    keep = [o for o in B.COLL.all_objects if not in_preview(o)]
    meshes = [o for o in keep if o.type == "MESH"]
    for o in list(B.COLL.all_objects):  # the diorama must not shade (or join) the export
        if in_preview(o):
            bpy.data.objects.remove(o)
    bake_ao(meshes)
    for o in meshes:
        if o.get("baked_colour"):
            flatten_colours(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in keep:
        o.select_set(True)
    kwargs = dict(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                  export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color="ACTIVE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs, export_colors=True)
    tris = {}
    for o in meshes:
        o.data.calc_loop_triangles()
        key = (o.parent.name if o.parent else o.name)[:11]
        tris[key] = tris.get(key, 0) + len(o.data.loop_triangles)
    print("EXPORT_OK", {"glb_kb": round(os.path.getsize(glb) / 1024), "tris": tris})


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    B.COLL = bpy.data.collections.new("ReferenceTrees")
    bpy.context.scene.collection.children.link(B.COLL)
    bpy.context.scene.world = bpy.data.worlds.new("Studio")
    build_preview()
    render_preview(os.path.join(HERE, "reference-trees.png"))
    print("PREVIEW_OK")
    if "--preview-only" not in args:
        export(os.path.join(REPO, "public", "forest3d", "tree-reference.glb"))


if __name__ == "__main__":
    main()
