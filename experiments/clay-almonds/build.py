"""
My Daily Garden — clay almond trees and hex tiles (Blender 5.2, procedural)

Style: Harry's "3d trees" Pinterest board plus the leafy tree Hadi picked —
a thick trunk twisting up in an S and splitting into two branches, round root
lumps at its foot, a dome of chunky pillowy leaves, matte clay finish; hex
tiles with a grass top over layered soil. Our own geometry, built here.

Run from the repository root:
  blender --background --factory-startup --python experiments/clay-almonds/build.py

Writes:
  experiments/clay-almonds/clay-almonds.blend   editable scene
  experiments/clay-almonds/preview.png          render of every piece
  public/forest3d/clay-almonds.glb              what the 3D forest loads

Each tree is a root empty TREE_<n> (n = 1..5, one silhouette each) with
children *_trunk, *_roots, *_core, *_leaves and *_flowers. The forest
recolours by material name (Leaf_Light, Leaf_Mid, Leaf_Dark, Flower) and
shows *_flowers only on the blossom looks. Tiles: TILE_grass, TILE_pond.
Units match the forest grid: hex radius 1.5, tile surface at z = 0.2.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
TOP = 0.2
HEX_R = 1.5

PALETTE = {
    "Bark": "#9B6A45", "Root": "#A87650",
    "Leaf_Light": "#A6DD8C", "Leaf_Mid": "#7CC36B", "Leaf_Dark": "#5FA35A",
    "Flower": "#F7A8BC",
    "Grass": "#9CCF5E", "Soil": "#9A6644", "Soil_Deep": "#7A4D33",
    "Stone": "#C9C2B4", "Tuft": "#6FB14A", "Petal": "#FFFFFF",
    "Water": "#6EC6E8", "Pad": "#5FA35A", "Wood": "#C98F55",
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    hexcol = PALETTE[name].lstrip("#")
    rgb = [srgb_to_linear(int(hexcol[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.25 if name == "Water" else 0.82
    m.diffuse_color = (*rgb, 1)
    return m


def new_object(name, bm_or_mesh, mats, parent=None, smooth=True):
    if isinstance(bm_or_mesh, bmesh.types.BMesh):
        me = bpy.data.meshes.new(name)
        bm_or_mesh.to_mesh(me)
        bm_or_mesh.free()
    else:
        me = bm_or_mesh
        me.name = name
    for mname in mats:
        me.materials.append(material(mname))
    for p in me.polygons:
        p.use_smooth = smooth
    obj = bpy.data.objects.new(name, me)
    COLL.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def new_empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.4
    e.location = loc
    COLL.objects.link(e)
    return e


def bake(obj):
    """Apply modifiers / convert curves: replace obj's data with its evaluated mesh."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    return me


# ── Leaves ──

def leaf_template():
    """A soft, pointed, pillowy leaf: tip +Y, face normal +Z, ~0.2 x 0.36 x 0.06."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        pinch = 1 - 0.75 * max(0.0, y) ** 2 - 0.25 * max(0.0, -y) ** 2
        v.co = Vector((x * pinch * 0.2, y * 0.36 + 0.12, z * 0.06 + 0.03 * (1 - x * x)))
    verts = [v.co.copy() for v in bm.verts]
    faces = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return verts, faces


LEAF_VERTS, LEAF_FACES = leaf_template()


def add_leaf(bm, matrix, mat_index):
    vs = [bm.verts.new(matrix @ co) for co in LEAF_VERTS]
    for f in LEAF_FACES:
        face = bm.faces.new([vs[i] for i in f])
        face.material_index = mat_index
        face.smooth = True


def leaf_matrix(pos, normal, rand, size):
    z = normal.normalized()
    up = Vector((0, 0, 1))
    y = (up - z * up.dot(z))
    if y.length < 1e-4:
        y = Vector((0, 1, 0))
    y.normalize()
    y = Matrix.Rotation(rand.uniform(-math.pi, math.pi), 3, z) @ y
    x = y.cross(z).normalized()
    rot = Matrix((x, y, z)).transposed()  # columns x, y, z
    tilt = Matrix.Rotation(rand.uniform(-0.55, -0.15), 3, "X")  # tip lifts away from the dome
    return Matrix.Translation(pos) @ (rot @ tilt).to_4x4() @ Matrix.Scale(size, 4)


def fib_points(count, cutoff):
    """Evenly spread unit vectors, skipping the underside below z = cutoff."""
    pts = []
    for i in range(count):
        z = 1 - (i + 0.5) / count * (1 - cutoff)
        r = math.sqrt(max(0.0, 1 - z * z))
        phi = i * 2.399963
        pts.append(Vector((math.cos(phi) * r, math.sin(phi) * r, z)))
    return pts


# ── Trees ──

# lobes: (centre offset from canopy centre, radii x/y/z, outer leaf count)
TREES = {
    1: dict(trunk_h=1.15, lean=0.11, lobes=[((0, 0, 0), (0.72, 0.72, 0.58), 64)]),
    2: dict(trunk_h=1.05, lean=-0.13, lobes=[((0, 0, 0), (0.9, 0.8, 0.5), 72)]),
    3: dict(trunk_h=1.2, lean=0.09, lobes=[((0, 0, 0.08), (0.58, 0.58, 0.8), 64)]),
    4: dict(trunk_h=1.12, lean=-0.1, lobes=[((-0.18, 0, 0), (0.62, 0.6, 0.52), 46), ((0.38, 0.05, 0.12), (0.45, 0.45, 0.42), 32)]),
    5: dict(trunk_h=1.32, lean=0.12, lobes=[((0, 0, 0), (0.6, 0.6, 0.52), 52)]),
}


def tube(name, points, radii, bevel, bevel_resolution=4, resolution_u=10):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_resolution
    cu.resolution_u = resolution_u
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, co, r in zip(sp.bezier_points, points, radii):
        bp.co = co
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.radius = r
    obj = bpy.data.objects.new(name, cu)
    COLL.objects.link(obj)
    me = bake(obj)
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(cu)
    return me


def join_meshes(name, meshes):
    bm = bmesh.new()
    for me in meshes:
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    return out


def build_tree(n, location):
    spec = TREES[n]
    rand = random.Random(n * 977)
    root = new_empty(f"TREE_{n}", location)
    lean, h = spec["lean"], spec["trunk_h"]
    top = TOP + h

    # Trunk: an S-curve, thick at the foot, and two branches up into the canopy.
    trunk = tube(f"TREE_{n}_trunk_curve", [
        Vector((0, 0, TOP - 0.03)),
        Vector((lean * 1.3, 0.02, TOP + h * 0.32)),
        Vector((-lean * 1.0, -0.02, TOP + h * 0.66)),
        Vector((lean * 0.3, 0, top)),
    ], [1.15, 0.85, 0.7, 0.58], 0.2)
    branches = []
    for side in (-1, 1):
        branches.append(tube(f"TREE_{n}_branch_curve", [
            Vector((lean * 0.3, 0, top - 0.06)),
            Vector((side * 0.22, side * 0.04, top + 0.16)),
            Vector((side * 0.4, side * 0.08, top + 0.36)),
        ], [0.95, 0.65, 0.4], 0.1))
    trunk_obj = new_object(f"TREE_{n}_trunk", join_meshes(f"TREE_{n}_trunk", [trunk, *branches]), ["Bark"], root)
    # a little clay lumpiness on the bark
    tex = bpy.data.textures.get("BarkLumps") or bpy.data.textures.new("BarkLumps", "CLOUDS")
    tex.noise_scale = 0.12
    disp = trunk_obj.modifiers.new("lumps", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.025
    baked = bake(trunk_obj)
    old = trunk_obj.data
    trunk_obj.modifiers.clear()
    trunk_obj.data = baked
    baked.name = f"TREE_{n}_trunk"
    bpy.data.meshes.remove(old)
    for p in baked.polygons:
        p.use_smooth = True
    baked.materials.clear()
    baked.materials.append(material("Bark"))

    # Root lumps around the foot.
    bm = bmesh.new()
    for i in range(4):
        a = i * (math.pi / 2) + rand.uniform(-0.3, 0.3)
        m = (Matrix.Translation((math.cos(a) * 0.2, math.sin(a) * 0.2, TOP + 0.02))
             @ Matrix.Rotation(a, 4, "Z") @ Matrix.Diagonal((0.17, 0.11, 0.1, 1)))
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0, matrix=m)
    new_object(f"TREE_{n}_roots", bm, ["Root"], root)

    # Canopy: a dark core so gaps never show sky, two shells of leaves, flowers.
    centre = Vector((lean * 0.3, 0, top + 0.5))
    core = bmesh.new()
    leaves = bmesh.new()
    flowers = bmesh.new()
    for offset, (rx, ry, rz), count in spec["lobes"]:
        c = centre + Vector(offset)
        bmesh.ops.create_uvsphere(core, u_segments=20, v_segments=12, radius=1.0,
                                  matrix=Matrix.Translation(c) @ Matrix.Diagonal((rx * 0.84, ry * 0.84, rz * 0.82, 1)))
        for shell_scale, shell_count, mats, size in ((0.9, int(count * 0.6), (1, 1, 0), 0.95), (1.0, count, (0, 0, 1), 1.0)):
            for i, u in enumerate(fib_points(shell_count, -0.55)):
                u = (u + Vector((rand.uniform(-0.06, 0.06), rand.uniform(-0.06, 0.06), 0))).normalized()
                pos = c + Vector((u.x * rx, u.y * ry, u.z * rz)) * shell_scale
                normal = Vector((u.x / rx, u.y / ry, u.z / rz))
                add_leaf(leaves, leaf_matrix(pos, normal, rand, size * rand.uniform(0.9, 1.15)), mats[i % 3])
        for u in fib_points(max(8, count // 4), -0.3):
            pos = c + Vector((u.x * rx, u.y * ry, u.z * rz)) * 1.06
            bmesh.ops.create_uvsphere(flowers, u_segments=8, v_segments=5, radius=0.055, matrix=Matrix.Translation(pos))
    new_object(f"TREE_{n}_core", core, ["Leaf_Dark"], root)
    new_object(f"TREE_{n}_leaves", leaves, ["Leaf_Light", "Leaf_Mid"], root)
    new_object(f"TREE_{n}_flowers", flowers, ["Flower"], root)
    return root


# ── Tiles ──

def frustum(bm, r_bottom, r_top, z0, z1, segments=6):
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r_bottom, radius2=r_top, depth=z1 - z0,
                          matrix=Matrix.Translation((0, 0, (z0 + z1) / 2)) @ Matrix.Rotation(math.pi / 6 if segments == 6 else 0, 4, "Z"))  # hexes flat-top, matching the grid


def tile_layers(parent, name):
    grass = bmesh.new()
    frustum(grass, HEX_R, HEX_R - 0.04, TOP - 0.16, TOP)
    g = new_object(f"{name}_grass", grass, ["Grass"], parent, smooth=False)
    bev = g.modifiers.new("soft", "BEVEL")
    bev.width = 0.035
    bev.segments = 3
    baked = bake(g)
    old = g.data
    g.modifiers.clear()
    g.data = baked
    baked.name = f"{name}_grass"
    bpy.data.meshes.remove(old)
    baked.materials.clear()
    baked.materials.append(material("Grass"))
    soil = bmesh.new()
    frustum(soil, HEX_R - 0.03, HEX_R, TOP - 0.5, TOP - 0.16)
    new_object(f"{name}_soil", soil, ["Soil"], parent, smooth=False)
    deep = bmesh.new()
    frustum(deep, HEX_R - 0.08, HEX_R - 0.03, TOP - 0.7, TOP - 0.5)
    new_object(f"{name}_deep", deep, ["Soil_Deep"], parent, smooth=False)


def scatter_decor(parent, name, seed, keep_clear=0.55):
    rand = random.Random(seed)
    stones, tufts, petals = bmesh.new(), bmesh.new(), bmesh.new()
    for _ in range(10):
        a, d = rand.uniform(0, math.tau), rand.uniform(keep_clear, HEX_R - 0.25)
        x, y = math.cos(a) * d, math.sin(a) * d
        kind = rand.random()
        if kind < 0.3:
            s = rand.uniform(0.06, 0.13)
            bmesh.ops.create_icosphere(stones, subdivisions=1, radius=1.0,
                                       matrix=Matrix.Translation((x, y, TOP + s * 0.35)) @ Matrix.Rotation(rand.uniform(0, 3), 4, "Z") @ Matrix.Diagonal((s * 1.3, s, s * 0.7, 1)))
        elif kind < 0.75:
            for k in range(3):
                m = (Matrix.Translation((x + (k - 1) * 0.05, y + (k % 2) * 0.04, TOP + 0.09))
                     @ Matrix.Rotation((k - 1) * 0.35, 4, "Y"))
                bmesh.ops.create_cone(tufts, cap_ends=True, cap_tris=True, segments=5, radius1=0.045, radius2=0.0, depth=0.2, matrix=m)
        else:
            bmesh.ops.create_uvsphere(petals, u_segments=8, v_segments=5, radius=0.05, matrix=Matrix.Translation((x, y, TOP + 0.04)))
    new_object(f"{name}_stones", stones, ["Stone"], parent, smooth=False)
    new_object(f"{name}_tufts", tufts, ["Tuft"], parent, smooth=False)
    new_object(f"{name}_flowers", petals, ["Petal"], parent)


def build_grass_tile(location):
    root = new_empty("TILE_grass", location)
    tile_layers(root, "TILE_grass")
    scatter_decor(root, "TILE_grass", 11)
    return root


def build_pond_tile(location):
    root = new_empty("TILE_pond", location)
    tile_layers(root, "TILE_pond")
    water = bmesh.new()
    bmesh.ops.create_circle(water, cap_ends=True, segments=36, radius=0.95, matrix=Matrix.Translation((0, 0, TOP + 0.006)))
    new_object("TILE_pond_water", water, ["Water"], root)
    pads = bmesh.new()
    for i in range(4):
        a = 0.6 + i * 1.4
        bmesh.ops.create_cone(pads, cap_ends=True, cap_tris=False, segments=14, radius1=0.13, radius2=0.13, depth=0.02,
                              matrix=Matrix.Translation((math.cos(a) * 0.55, math.sin(a) * 0.55, TOP + 0.02)))
    new_object("TILE_pond_pads", pads, ["Pad"], root, smooth=False)
    stones = bmesh.new()
    rand = random.Random(7)
    for i in range(10):
        a, s = i / 10 * math.tau + rand.uniform(0, 0.3), rand.uniform(0.07, 0.13)
        bmesh.ops.create_icosphere(stones, subdivisions=1, radius=1.0,
                                   matrix=Matrix.Translation((math.cos(a) * 1.05, math.sin(a) * 1.05, TOP + s * 0.3)) @ Matrix.Diagonal((s * 1.2, s, s * 0.7, 1)))
    new_object("TILE_pond_stones", stones, ["Stone"], root, smooth=False)
    wood = bmesh.new()
    for i in range(6):
        x = -0.75 + i * 0.3
        z = TOP + 0.06 + math.sin(i / 5 * math.pi) * 0.14
        bmesh.ops.create_cube(wood, size=1.0, matrix=Matrix.Translation((x, 0, z)) @ Matrix.Diagonal((0.26, 0.62, 0.05, 1)))
    for y in (-0.3, 0.3):
        bmesh.ops.create_cube(wood, size=1.0, matrix=Matrix.Translation((0, y, TOP + 0.34)) @ Matrix.Diagonal((1.75, 0.05, 0.05, 1)))
        for x in (-0.8, 0.8):
            bmesh.ops.create_cube(wood, size=1.0, matrix=Matrix.Translation((x, y, TOP + 0.2)) @ Matrix.Diagonal((0.05, 0.05, 0.28, 1)))
    new_object("TILE_pond_bridge", wood, ["Wood"], root, smooth=False)
    return root


# ── Scene ──

def preview_rig():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Studio") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (srgb_to_linear(1.0), srgb_to_linear(0.95), srgb_to_linear(0.86), 1)
    bg.inputs["Strength"].default_value = 0.9
    sun_data = bpy.data.lights.new("LGT_key", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(8)
    sun = bpy.data.objects.new("LGT_key", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("CAM_main")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 13.5
    cam = bpy.data.objects.new("CAM_main", cam_data)
    cam.location = (5.4, -14, 9)
    cam.rotation_euler = (math.radians(58), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 640
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass


def main():
    global COLL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    COLL = bpy.data.collections.new("MDG_ClayKit")
    bpy.context.scene.collection.children.link(COLL)
    roots = []
    for i, n in enumerate(sorted(TREES)):
        roots.append(build_tree(n, (i * 2.4, 0, 0)))
    roots.append(build_grass_tile((2.4 * 1.5, -3.2, 0)))
    roots.append(build_pond_tile((2.4 * 3.2, -3.2, 0)))
    preview_rig()

    blend_path = os.path.join(HERE, "clay-almonds.blend")
    glb_path = os.path.join(REPO, "public", "forest3d", "clay-almonds.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in COLL.all_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
    scene = bpy.context.scene
    scene.render.filepath = os.path.join(HERE, "preview.png")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    tris = {}
    for o in COLL.all_objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            root = o.parent.name if o.parent else o.name
            tris[root] = tris.get(root, 0) + len(o.data.loop_triangles)
    stats = {"objects": len(COLL.all_objects), "tris": tris, "glb_kb": round(os.path.getsize(glb_path) / 1024)}
    print("BUILD_OK", stats)


if __name__ == "__main__":
    main()
