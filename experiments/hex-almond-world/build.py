"""Editable seven-hex Blender study. Run with Blender --background --python build.py.

The whole scene is original procedural geometry; no generated image is used as a texture.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

OUT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
random.seed(1047)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
world_collection = bpy.data.collections.new('World | seven modular hexes')
studio_collection = bpy.data.collections.new('Studio | excluded from GLB')
scene.collection.children.link(world_collection)
scene.collection.children.link(studio_collection)

PALETTE = {
    'Brand_Orange': '#FFA01E', 'Brand_Navy': '#262A45',
    'Stage_Cream': '#FFF2D9', 'Ground_Grass': '#B4D374',
    'Ground_Light': '#C5DC88', 'Ground_Path': '#EDD1A0',
    'Leaf_Deep': '#356F35', 'Leaf_Mid': '#579A40',
    'Leaf_Fresh': '#7DB94E', 'Leaf_Light': '#A2CE66',
    'Bark_Warm': '#98603B', 'Bark_Light': '#BF8752',
    'Blossom_Ivory': '#FFF8EC', 'Blossom_Blush': '#F8D5D3',
    'Blossom_Centre': '#F5AF41', 'Almond_Hull': '#C5D17E',
    'Water_Clear': '#72C9DE', 'Water_Light': '#B6E5EA',
    'Stone_Warm': '#B7B7A0', 'Stone_Light': '#D8D4BB',
    'Wood_Honey': '#C48A49', 'Flower_Orange': '#FFA01E',
}


def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def material(name, colour):
    rgb = tuple(linear(int(colour[i:i + 2], 16) / 255) for i in (1, 3, 5))
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb, 1)
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = .82
    bs.inputs['Specular IOR Level'].default_value = .5
    mat['palette_srgb'] = colour
    return mat


MATS = {name: material(name, colour) for name, colour in PALETTE.items()}
# Plain PBR materials survive the browser export without shader-specific extensions.
for name in ('Water_Clear', 'Water_Light'):
    MATS[name].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .3


class Geometry:
    """Batch small botanical pieces into one editable mesh per plant or tile detail."""
    def __init__(self):
        self.vertices, self.faces, self.indices, self.smooth = [], [], [], []
        self.materials = []

    def add(self, vertices, faces, mat, smooth=True):
        offset = len(self.vertices)
        if mat not in self.materials:
            self.materials.append(mat)
        index = self.materials.index(mat)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(offset + i for i in face) for face in faces)
        self.indices.extend([index] * len(faces))
        self.smooth.extend([smooth] * len(faces))

    def object(self, name, parent=None):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        world_collection.objects.link(obj)
        obj.parent = parent
        for mat in self.materials:
            mesh.materials.append(mat)
        for poly, index, smooth in zip(mesh.polygons, self.indices, self.smooth):
            poly.material_index, poly.use_smooth = index, smooth
        return obj


def empty(name, loc=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    world_collection.objects.link(obj)
    obj.location, obj.parent = loc, parent
    return obj


ICO = bmesh.new()
bmesh.ops.create_icosphere(ICO, subdivisions=1, radius=1)
ICO.verts.ensure_lookup_table()
ICO_VERTS = [v.co.copy() for v in ICO.verts]
ICO_FACES = [tuple(v.index for v in f.verts) for f in ICO.faces]
ICO.free()


def orb(g, pos, scale, mat, rotation=None):
    transform = rotation or Matrix.Identity(3)
    vertices = [Vector(pos) + transform @ Vector((v.x * scale[0], v.y * scale[1], v.z * scale[2])) for v in ICO_VERTS]
    g.add(vertices, ICO_FACES, mat)


def tube(g, points, radii, mat, sides=7):
    points = [Vector(p) for p in points]
    vertices = []
    for i, point in enumerate(points):
        tangent = (points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]).normalized()
        u = tangent.cross(Vector((0, 1, 0)))
        if u.length < .01:
            u = tangent.cross(Vector((1, 0, 0)))
        u.normalize()
        v = tangent.cross(u).normalized()
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(point + radii[i] * (math.cos(angle) * u + math.sin(angle) * v))
    faces = []
    for i in range(len(points) - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces += [tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + j for j in range(sides))]
    g.add(vertices, faces, mat)


def leaf(g, pos, direction, length, width, mat):
    direction = Vector(direction).normalized()
    u = direction.cross(Vector((0, 0, 1)))
    if u.length < .01:
        u = direction.cross(Vector((0, 1, 0)))
    u.normalize()
    normal = u.cross(direction).normalized()
    outline = [(0, 0, 0), (-width, length * .34, .01), (-width * .72, length * .72, .01),
               (0, length, 0), (width * .72, length * .72, .01), (width, length * .34, .01),
               (0, length * .5, length * .12)]
    g.add([Vector(pos) + u * x + direction * y + normal * z for x, y, z in outline],
          [(i, (i + 1) % 6, 6) for i in range(6)], mat)


def flower(g, pos, radius, normal, orange=False):
    normal = Vector(normal).normalized()
    u = normal.cross(Vector((0, 1, 0)))
    if u.length < .01:
        u = normal.cross(Vector((1, 0, 0)))
    u.normalize()
    v = normal.cross(u).normalized()
    pos = Vector(pos)
    for petal in range(5):
        a = petal * math.tau / 5
        direction, across = math.cos(a) * u + math.sin(a) * v, -math.sin(a) * u + math.cos(a) * v
        centre = pos + direction * radius * .54
        vertices = [centre + normal * radius * .10]
        for j in range(8):
            t = j * math.tau / 8
            vertices.append(centre + direction * math.cos(t) * radius * .57 + across * math.sin(t) * radius * .35)
        mat = MATS['Flower_Orange'] if orange else MATS['Blossom_Blush' if random.random() < .22 else 'Blossom_Ivory']
        g.add(vertices, [(0, 1 + j, 1 + (j + 1) % 8) for j in range(8)], mat)
    orb(g, pos + normal * radius * .10, (radius * .19,) * 3, MATS['Blossom_Centre'])


RADIUS = 1.5
TOP = .20


def hex_prism(name, radius, bottom, top, mat, parent, bevel=.025):
    vertices = [(math.cos(i * math.tau / 6) * radius, math.sin(i * math.tau / 6) * radius, z)
                for z in (bottom, top) for i in range(6)]
    faces = [tuple(reversed(range(6))), tuple(range(6, 12))]
    faces += [(i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6) for i in range(6)]
    g = Geometry()
    g.add(vertices, faces, mat, False)
    obj = g.object(name, parent)
    if bevel:
        mod = obj.modifiers.new('Small rounded tile bevel', 'BEVEL')
        mod.width, mod.segments = bevel, 2
    return obj


def path(g, points, width=.38):
    vertices = []
    points = [Vector((x, y, TOP + .013)) for x, y in points]
    for i, p in enumerate(points):
        tangent = points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]
        side = Vector((-tangent.y, tangent.x, 0)).normalized() * width / 2
        vertices.extend([p - side, p + side])
    g.add(vertices, [(i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1) for i in range(len(points) - 1)], MATS['Ground_Path'], False)


def tree(parent, stage, scale=1, offset=(0, 0), seed=1):
    random.seed(seed)
    root = empty('Tree_' + stage, (offset[0], offset[1], TOP), parent)
    root['main_tree'] = True
    root['growth_stage'] = stage
    root.scale = (scale,) * 3
    root.rotation_euler.z = seed * .037
    g = Geometry()
    trunk = [(0, 0, 0), (-.09, .015, .35), (-.12, .025, .78), (.03, .05, 1.2), (.06, .07, 1.60), (-.03, .05, 2.06), (.02, .08, 2.44)]
    tube(g, trunk, [.17, .14, .115, .095, .073, .042, .008], MATS['Bark_Warm'], 9)
    for j in range(5):
        a = j * math.tau / 5
        tube(g, [(0, 0, .18), (.22 * math.cos(a), .22 * math.sin(a), .04), (.38 * math.cos(a), .38 * math.sin(a), .015)], [.075, .045, .006], MATS['Bark_Warm'])
    clusters = [(-.67, -.12, 1.60), (.65, -.18, 1.79), (-.45, .37, 2.05), (.49, .39, 2.19), (-.05, -.11, 2.45), (.02, .60, 2.27)]
    leaf_mats = [MATS['Leaf_Deep'], MATS['Leaf_Mid'], MATS['Leaf_Fresh'], MATS['Leaf_Light']]
    for k, centre in enumerate(clusters):
        centre = Vector(centre)
        start = Vector((.01, .03, centre.z - .85))
        tube(g, [start, start.lerp(centre, .42) + Vector((0, 0, -.11)), start.lerp(centre, .73), centre], [.07, .052, .032, .006], MATS['Bark_Warm'])
        for twig in range(3):
            a = twig * math.tau / 3 + k
            tip = centre + Vector((math.cos(a) * .42, math.sin(a) * .38, .22))
            tube(g, [centre - Vector((0, 0, .12)), tip], [.027, .004], MATS['Bark_Light'], 5)
        count = 150 if stage != 'blossoming' else 40
        for n in range(count):
            a = n * 2.399963 + k
            z = 1 - 2 * (n + .5) / count
            r = math.sqrt(1 - z * z)
            radial = Vector((math.cos(a) * r, math.sin(a) * r, z))
            depth = random.uniform(.4, 1)
            pos = centre + Vector((radial.x * .45, radial.y * .42, radial.z * .36)) * depth
            direction = Vector((math.cos(a + .65), math.sin(a + .65), radial.z * .45 + .12))
            leaf(g, pos, direction, random.uniform(.26, .40), random.uniform(.055, .075), random.choices(leaf_mats, [2, 4, 4, 2])[0])
        if stage == 'blossoming':
            for n in range(15):
                a = n * 2.399963 + k
                z = 1 - 2 * (n + .5) / 15
                r = math.sqrt(1 - z * z)
                radial = Vector((math.cos(a) * r, math.sin(a) * r, z))
                pos = centre + Vector((radial.x * .45, radial.y * .40, radial.z * .34))
                flower(g, pos, random.uniform(.11, .145), radial + Vector((0, 0, .35)))
        elif stage == 'fruiting':
            for n in range(3):
                pos = centre + Vector((random.uniform(-.28, .28), -.35, random.uniform(-.3, .07)))
                tube(g, [pos + Vector((0, 0, .13)), pos], [.009, .006], MATS['Bark_Light'], 5)
                orb(g, pos - Vector((0, 0, .045)), (.066, .053, .125), MATS['Almond_Hull'])
    g.object('Almond_' + stage + '_geometry', root)
    return root


def seedling(parent):
    root = empty('Tree_seedling', (-.52, .12, TOP), parent)
    root['main_tree'], root['growth_stage'] = True, 'seedling'
    g = Geometry()
    tube(g, [(0, 0, 0), (.02, 0, .14), (0, 0, .30)], [.014, .010, .004], MATS['Bark_Light'], 6)
    for i in range(5):
        a = i * 2.4
        leaf(g, (0, 0, .11 + i * .03), (math.cos(a), math.sin(a), .45), .23, .049, MATS['Leaf_Fresh'])
    orb(g, (0, 0, .01), (.16, .13, .035), MATS['Bark_Warm'])
    g.object('Almond_seedling_geometry', root)
    return root


def detail(parent, pond=False, seed=1):
    random.seed(seed)
    g = Geometry()
    for i in range(30):
        a, r = random.uniform(0, math.tau), random.uniform(.70, 1.23)
        x, y = math.cos(a) * r, math.sin(a) * r
        if abs(x - .35) < .31 or (pond and r < 1.05):
            continue
        for j in range(4):
            b = j * 2.4
            leaf(g, (x, y, TOP + .01), (math.cos(b) * .3, math.sin(b) * .3, 1), random.uniform(.09, .19), .017, MATS['Leaf_Mid' if i % 3 else 'Leaf_Fresh'])
        if i % 3 == 0:
            for j in range(3):
                pos = (x + random.uniform(-.06, .06), y + random.uniform(-.06, .06), TOP + random.uniform(.09, .16))
                flower(g, pos, .041, (0, -.15, 1), orange=i % 2 == 0)
    for i in range(5):
        a = i * 2.4 + seed
        x, y = math.cos(a) * 1.14, math.sin(a) * 1.10
        if abs(x - .35) > .30:
            orb(g, (x, y, TOP + .035), (.12, .085, .075), MATS['Stone_Warm' if i % 2 else 'Stone_Light'])
    g.object('Meadow_detail', parent)


def box(g, pos, scale, mat):
    x, y, z = scale
    p = Vector(pos)
    vertices = [p + Vector((a * x / 2, b * y / 2, c * z / 2)) for c in (-1, 1) for b in (-1, 1) for a in (-1, 1)]
    g.add(vertices, [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)], mat, False)


def pond(parent):
    g = Geometry()
    # The water is inset into an actual opening in the top, rather than a disc on grass.
    ring = []
    for i in range(24):
        a = i * math.tau / 24
        ring.append(Vector((math.cos(a) * (.94 + .03 * math.sin(a * 3)), math.sin(a) * 1.02, .18)))
    outer = []
    for i in range(24):
        side, t = i // 4, (i % 4) / 4
        a, b = side * math.tau / 6, (side + 1) * math.tau / 6
        outer.append(Vector(((1 - t) * math.cos(a) + t * math.cos(b), (1 - t) * math.sin(a) + t * math.sin(b), 0)) * (RADIUS - .025))
        outer[-1].z = TOP
    g.add(outer + ring, [(i, (i + 1) % 24, (i + 1) % 24 + 24, i + 24) for i in range(24)], MATS['Ground_Grass'])
    g.add([Vector((0, 0, .18))] + ring, [(0, 1 + i, 1 + (i + 1) % 24) for i in range(24)], MATS['Water_Clear'])
    for i in range(13):
        a = i * 2.4
        x, y = math.cos(a) * .98, math.sin(a) * 1.06
        if abs(x - .25) > .36:
            orb(g, (x, y, .18), (.15, .12, .10), MATS['Stone_Warm' if i % 3 else 'Stone_Light'])
    for i in range(6):
        x, y = -.55 + (i % 2) * .16, -.6 + i * .22
        orb(g, (x, y, .184), (.10, .09, .004), MATS['Leaf_Fresh'])
    for x, y in ((-.75, -.65), (.8, .5), (-.8, .5)):
        for j in range(7):
            a = j * 2.4
            leaf(g, (x, y, .17), (math.cos(a) * .25, math.sin(a) * .25, 1), .28 + j * .025, .019, MATS['Leaf_Mid'])
    # Discrete modeled water glints also export to the web.
    for x, y in ((-.48, -.35), (.55, .45), (-.3, .6)):
        tube(g, [(x - .10, y, .183), (x, y + .015, .184), (x + .10, y, .183)], [.007, .009, .004], MATS['Water_Light'], 4)
    path(g, [(.25, -1.27), (.25, -1.02)], .36)
    path(g, [(.25, 1.02), (.30, 1.28)], .36)
    g.object('Pond_banks_water_and_reeds', parent)
    bridge = Geometry()
    for i in range(13):
        y = -1.02 + i * .17
        z = .25 + .15 * math.sin(i * math.pi / 12)
        box(bridge, (.25, y, z), (.62, .15, .055), MATS['Wood_Honey'])
    for side in (-1, 1):
        x = .25 + side * .31
        posts = []
        for i in (0, 4, 8, 12):
            y = -1.02 + i * .17
            z = .25 + .15 * math.sin(i * math.pi / 12)
            box(bridge, (x, y, z + .16), (.045, .045, .34), MATS['Wood_Honey'])
            posts.append((x, y, z + .31))
        tube(bridge, posts, [.026] * 4, MATS['Wood_Honey'], 6)
    bridge.object('Footbridge', parent)


TILES = [(0, 0, 'seedling'), (1, 0, 'blossoming'), (1, -1, 'young'),
         (0, -1, 'pond'), (-1, 0, 'fruiting'), (-1, 1, 'blossoming'), (0, 1, 'fruiting')]
tile_roots, tree_roots = [], []
for i, (q, r, kind) in enumerate(TILES):
    x, y = 1.5 * RADIUS * q, math.sqrt(3) * RADIUS * (r + q / 2)
    root = empty(f'Hex_{i:02d}_{kind}', (x, y, 0))
    root['hex_q'], root['hex_r'], root['terrain'] = q, r, 'pond' if kind == 'pond' else 'grass'
    root['tile_radius'] = RADIUS
    tile_roots.append(root)
    hex_prism('Tile_orange_base', RADIUS - .009, -.26, .145, MATS['Brand_Orange'], root, .025)
    hex_prism('Tile_navy_rim', RADIUS - .014, .129, .163, MATS['Brand_Navy'], root, .006)
    if kind == 'pond':
        pond(root)
    else:
        hex_prism('Tile_grass_cap', RADIUS - .025, .158, TOP, MATS['Ground_Grass'], root, .018)
        if kind == 'seedling':
            tree_roots.append(seedling(root))
            g = Geometry()
            path(g, [(.28 + .14 * math.sin(j * .15), -1.30 + j * .1) for j in range(27)])
            g.object('Connecting_meadow_paths', root)
            bench = Geometry()
            for j in range(3):
                box(bench, (.76, .43 + j * .09, .42), (.63, .075, .04), MATS['Wood_Honey'])
            for x in (.54, .98):
                box(bench, (x, .52, .31), (.045, .28, .25), MATS['Brand_Navy'])
                box(bench, (x, .69, .54), (.035, .035, .40), MATS['Wood_Honey'])
            for z in (.55, .66):
                box(bench, (.76, .69, z), (.63, .03, .07), MATS['Wood_Honey'])
            bench.object('Garden_bench', root)
        else:
            scale = .55 if kind == 'young' else (.91 if i == 5 else .96)
            tree_roots.append(tree(root, 'leafy' if kind == 'young' else kind, scale, seed=120 + i))
            if kind == 'young':
                tree_roots[-1]['growth_stage'] = 'young'
                tree_roots[-1].name = 'Tree_young'
        if i == 6:
            g = Geometry()
            path(g, [(.28 + j * .015, -1.30 + j * .09) for j in range(11)], .38)
            g.object('Path_to_mature_almond', root)
    detail(root, pond=kind == 'pond', seed=45 + i)


# Render rig is deliberately separate from exported game geometry.
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, .96, .88, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20 if args.preview else 80
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 5
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = -.55
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == 'METAL'
    scene.cycles.device = 'GPU'
except Exception:
    scene.cycles.device = 'CPU'


def studio_object(obj):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    studio_collection.objects.link(obj)


bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.29))
floor = bpy.context.object
floor.name = 'Stage_Backdrop'
floor.data.materials.append(MATS['Stage_Cream'])
studio_object(floor)
for name, loc, power, size, colour in [
    ('Soft daylight', (-5, -7, 12), 1100, 7, (1, .97, .90)),
    ('Sky fill', (7, -1, 8), 650, 7, (.90, .96, 1)),
    ('Warm canopy rim', (1, 7, 10), 1050, 6, (1, .97, .90))]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.shape, light.size, light.color = power, 'DISK', size, colour
    obj = bpy.data.objects.new(name, light)
    studio_collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('Whole_world_camera')
camera = bpy.data.objects.new('Whole_world_camera', camera_data)
studio_collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.lens = 50
camera_data.dof.use_dof = False


def fit_camera(width, height):
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    camera.location = (10, -15, 14)
    target = Vector((0, 0, 1.0))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for obj in world_collection.all_objects if obj.type == 'MESH' for corner in obj.bound_box]
    basis = camera.rotation_euler.to_matrix()
    right, up = basis @ Vector((1, 0, 0)), basis @ Vector((0, 1, 0))
    xs, ys = [p.dot(right) for p in corners], [p.dot(up) for p in corners]
    centre = right * ((min(xs) + max(xs)) / 2) + up * ((min(ys) + max(ys)) / 2)
    delta = centre - right * target.dot(right) - up * target.dot(up)
    camera.location += delta
    aspect = width / height
    camera_data.ortho_scale = max(max(xs) - min(xs), (max(ys) - min(ys)) * aspect) * 1.18 if aspect >= 1 else max((max(xs) - min(xs)) / aspect, max(ys) - min(ys)) * 1.18
    bpy.context.view_layer.update()
    projected = [world_to_camera_view(scene, camera, p) for p in corners]
    frame = {'left': min(p.x for p in projected), 'right': max(p.x for p in projected),
             'bottom': min(p.y for p in projected), 'top': max(p.y for p in projected)}
    assert frame['left'] > .045 and frame['right'] < .955 and frame['bottom'] > .045 and frame['top'] < .955, frame
    return frame


assert len(tile_roots) == 7
assert len({(obj['hex_q'], obj['hex_r']) for obj in tile_roots}) == 7
assert len(tree_roots) == 6
assert all(sum(bool(child.get('main_tree')) for child in root.children) <= 1 for root in tile_roots)
assert all(obj.type != 'MESH' or len(obj.data.polygons) > 0 for obj in world_collection.all_objects)
for root in tile_roots:
    if root['hex_q'] or root['hex_r']:
        assert abs(Vector(root.location[:2]).length - math.sqrt(3) * RADIUS) < .00001
for name in ('Brand_Orange', 'Brand_Navy'):
    assert MATS[name]['palette_srgb'] == PALETTE[name]

bpy.ops.object.select_all(action='DESELECT')
for obj in world_collection.all_objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'seven-hex-world.glb'), export_format='GLB',
    use_selection=True, export_apply=True, export_animations=False, export_cameras=False,
    export_lights=False, export_extras=True, export_materials='EXPORT',
    export_yup=True, export_normals=True, export_tangents=False)

dimensions = (1100, 825) if args.preview else (1800, 1350)
frame = fit_camera(*dimensions)
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.filepath = str(OUT / ('preview.png' if args.preview else 'seven-hex-world.png'))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'seven-hex-world.blend'))
bpy.ops.render.render(write_still=True)
portrait_frame = None
if not args.preview:
    portrait_frame = fit_camera(900, 1100)
    scene.render.filepath = str(OUT / 'seven-hex-portrait.png')
    bpy.ops.render.render(write_still=True)
    fit_camera(*dimensions)
    scene.render.filepath = str(OUT / 'seven-hex-world.png')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'seven-hex-world.blend'))
mesh_objects = [obj for obj in world_collection.all_objects if obj.type == 'MESH']
receipt = {'blender': bpy.app.version_string, 'geometry_source': 'Original procedural mesh geometry',
    'tile_count': len(tile_roots), 'main_tree_count': len(tree_roots),
    'growth_stages': [obj['growth_stage'] for obj in tree_roots], 'max_main_trees_per_hex': 1,
    'palette_srgb': PALETTE, 'desktop_frame': frame, 'portrait_frame': portrait_frame,
    'mesh_objects': len(mesh_objects),
    'base_triangles': sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in mesh_objects),
    'render_dimensions': dimensions, 'preview': args.preview,
    'limits': ['Visual study, not live garden integration.', 'Phone framing is a still-image check, not real-device performance evidence.']}
(OUT / ('receipt-preview.json' if args.preview else 'receipt.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print('DONE: seven hexes, six separate trees, editable Blender scene, GLB export and whole-world renders')
