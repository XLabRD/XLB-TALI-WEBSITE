"""Blender headless: one Tali hub ringed by four Puks, for the System section.

The section's headline is "one hub for unlimited zones" — this renders that
sentence. Tali sits centre, four Puks stand on an arc behind it; the wireless
signal itself is drawn afterwards in SVG so it can use the site's accent token
and animate.

Camera/lighting/material handling follow explode_render.py, so the output sits
next to the exploded-view frames as one visual family.

Usage:
  Blender -b -P hub_render.py -- <texture_dir> <out.png> [res_x] [res_y]

Prints PROJ lines (subject -> pixel coords) so the SVG can anchor the signal
arcs to where each Puk actually landed, rather than to guessed positions.
"""
import bpy, bmesh, math, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index("--") + 1:]
TEX, OUT = argv[0], argv[1]
RES_X = int(argv[2]) if len(argv) > 2 else 1800
RES_Y = int(argv[3]) if len(argv) > 3 else 1200

TALI_FBX = "/Users/frlobo/Desktop/Assets/3D/Tali v13.fbx"
PUK_FBX = "/Users/frlobo/Desktop/Assets/3D/Puck v6.fbx"

# Four Puks on an arc behind the hub. Angles are measured in the ground plane
# from +X, and all sit in the +X half — which is "behind" for a camera parked on
# the hub's long side, so none of them occludes the display.
PUK_ANGLES = [-54, -18, 18, 54]
RING = 1.62          # arc radius, in Tali long-edge units
PUK_TILT = 9         # degrees, so they read as objects rather than stickers


def bounds(meshes):
    # Read the EVALUATED copies: parenting and constraints only land in
    # matrix_world after the depsgraph runs, and stale bounds here silently
    # mis-aim the camera at a point that isn't the scene's centre.
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in meshes:
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            w = oe.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def meshes_of(objs):
    return [o for o in objs if o.type == "MESH"]


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- import the hub ----------
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=TALI_FBX)
tali_objs = [o for o in bpy.data.objects if o not in before]
tali_meshes = meshes_of(tali_objs)
tlo, thi = bounds(tali_meshes)
tsize = thi - tlo
taxis = min(range(3), key=lambda i: tsize[i])          # thin axis = through the slab
tlong = max(tsize)
print("TALI size", tuple(round(v, 4) for v in tsize), "thin axis", "XYZ"[taxis])

# Sit the hub flat and centred, long edge across frame. Shift the assembly onto
# the origin BEFORE parenting, so the root's own origin is the world origin and
# rotating it spins the hub in place rather than swinging it around a corner.
tcen = (tlo + thi) / 2
delta = -Vector(tcen[:])
delta[taxis] = -tlo[taxis]                        # rest on the ground plane
for o in tali_objs:
    if o.parent is None:
        o.matrix_world.translation += delta
bpy.context.view_layer.update()

troot = bpy.data.objects.new("TALI_root", None)
bpy.context.collection.objects.link(troot)
for o in tali_objs:
    if o.parent is None:
        keep = o.matrix_world.copy()
        o.parent = troot
        o.matrix_world = keep
# The hub is left unrotated on purpose: turning it also turns the e-paper UI
# plane, which then reads sideways. The camera moves instead (see below).
bpy.context.view_layer.update()
tlo, thi = bounds(tali_meshes)

# ---------- e-paper UI plane, just proud of the screen stack ----------
screen_root = next((o for o in tali_objs if o.name.startswith("SCREEN_3.7")), None)
if screen_root:
    stack = [screen_root]
    screen_meshes = []
    while stack:
        o = stack.pop()
        if o.type == "MESH":
            screen_meshes.append(o)
        stack.extend(o.children)
    slo, shi = bounds(screen_meshes)
    others = [i for i in range(3) if i != taxis]
    o1, o2 = others
    long_a, short_a = (o1, o2) if (shi - slo)[o1] >= (shi - slo)[o2] else (o2, o1)
    # 2% left the plane tucked under the bezel, clipping the texture's left
    # edge ('1/4 Cava Derecha' lost its '1/'). Inset further on the long axis.
    ml = (shi - slo)[long_a] * 0.062
    ms = (shi - slo)[short_a] * 0.05
    zt = shi[taxis] + tsize[taxis] * 0.02

    me = bpy.data.meshes.new("ScreenUI")
    bm = bmesh.new()
    corners = []
    for a in (slo[long_a] + ml, shi[long_a] - ml):
        for b in (slo[short_a] + ms, shi[short_a] - ms):
            v = [0.0, 0.0, 0.0]
            v[long_a], v[short_a], v[taxis] = a, b, zt
            corners.append(bm.verts.new(v))
    f = bm.faces.new([corners[0], corners[1], corners[3], corners[2]])
    bm.normal_update()
    if f.normal[taxis] < 0:
        bmesh.ops.reverse_faces(bm, faces=[f])
    bm.to_mesh(me)
    bm.free()
    ui = bpy.data.objects.new("ScreenUI", me)
    bpy.context.collection.objects.link(ui)

    uvl = me.uv_layers.new()
    for li, lco in enumerate(me.polygons[0].loop_indices):
        uvl.data[lco].uv = [(1, 0), (1, 1), (0, 1), (0, 0)][li]

    mat = bpy.data.materials.new("ScreenUIMat")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(TEX + "/epaper_ui.png")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.25
    bsdf.inputs["Roughness"].default_value = 0.55
    me.materials.append(mat)
    keep = ui.matrix_world.copy()
    ui.parent = troot
    ui.matrix_world = keep
    print("UI PLANE placed")

# ---------- four Puks on the arc ----------
puk_centres = []
for i, ang in enumerate(PUK_ANGLES):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=PUK_FBX)
    pobjs = [o for o in bpy.data.objects if o not in before]
    pmeshes = meshes_of(pobjs)
    plo, phi = bounds(pmeshes)
    pcen = (plo + phi) / 2

    root = bpy.data.objects.new(f"PUK_root_{i}", None)
    bpy.context.collection.objects.link(root)
    for o in pobjs:
        if o.parent is None:
            keep = o.matrix_world.copy()
            o.parent = root
            o.matrix_world = keep

    r = tlong * RING
    pos = Vector((r * math.cos(math.radians(ang)), r * math.sin(math.radians(ang)), 0.0))
    pos[taxis] += (phi - plo)[taxis] / 2          # rest on the ground plane
    root.location = pos - Vector(pcen[:])
    root.rotation_euler = (math.radians(PUK_TILT), 0.0, math.radians(ang - 90))
    bpy.context.view_layer.update()
    puk_centres.append(pos)
    print(f"PUK {i} angle={ang} at {tuple(round(v,4) for v in pos)}")

# ---------- materials ----------
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    bsdf = next((nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        continue
    name = m.name.lower()
    if "aluminum" in name or "steel" in name:
        bsdf.inputs["Metallic"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = 0.5
    elif "carbon" in name:
        # 0.42 is the scale proven on these exact models by explode_render.py —
        # the tile lands at ~2.4cm, so one tow is ~1.5mm. Deviating from it is
        # what turned the weave into stripes on the first attempts.
        TWILL_SCALE = 0.42
        nt2 = m.node_tree
        tc = nt2.nodes.new("ShaderNodeTexCoord")
        mp = nt2.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (TWILL_SCALE, TWILL_SCALE, 1)
        ct = nt2.nodes.new("ShaderNodeTexImage")
        ct.image = bpy.data.images.load(TEX + "/twill_color.png")
        rt = nt2.nodes.new("ShaderNodeTexImage")
        rt.image = bpy.data.images.load(TEX + "/twill_rough.png")
        rt.image.colorspace_settings.name = "Non-Color"
        for n in (ct, rt):
            n.projection = "BOX"
            n.projection_blend = 0.3
        nt2.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt2.links.new(mp.outputs["Vector"], ct.inputs["Vector"])
        nt2.links.new(mp.outputs["Vector"], rt.inputs["Vector"])
        nt2.links.new(ct.outputs["Color"], bsdf.inputs["Base Color"])
        nt2.links.new(rt.outputs["Color"], bsdf.inputs["Roughness"])
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.45
    elif "glass" in name or "acrylic" in name:
        bsdf.inputs["Base Color"].default_value = (0.04, 0.04, 0.045, 1)
        bsdf.inputs["Roughness"].default_value = 0.25
        bsdf.inputs["Transmission Weight"].default_value = 0.0
    elif "255,191,0" in name or "copper" in name:
        bsdf.inputs["Metallic"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = 0.45

# ---------- camera: elevated 3/4, the whole arc in frame ----------
all_m = meshes_of(bpy.data.objects)
lo, hi = bounds(all_m)
centre = (lo + hi) / 2
span = (hi - lo).length

cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 55
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam

target = bpy.data.objects.new("CamTarget", None)
bpy.context.collection.objects.link(target)
target.location = centre

# Aimed by hand rather than by a TRACK_TO constraint: the constraint only exists
# on the evaluated copy, which makes both framing and projection easy to get
# subtly wrong. An explicit rotation is the same result, minus the trap.
DIR = Vector((-0.92, 0.0, 0.70)).normalized()
cam.location = centre + DIR * span
cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.view_layer.update()

# Pull back until every bounding-box corner is inside the frame, then add margin.
dg = bpy.context.evaluated_depsgraph_get()
corners = []
for o in all_m:
    oe = o.evaluated_get(dg)
    for c in oe.bound_box:
        corners.append(oe.matrix_world @ Vector(c))
fit_loc, _ = cam.camera_fit_coords(dg, [v for c in corners for v in c])
cam.location = centre + (Vector(fit_loc) - centre) * 1.06
bpy.context.view_layer.update()

# ---------- warm studio lighting ----------
def area(name, loc, energy, size_l, colour=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy, ld.size, ld.color = energy, size_l, colour
    ob = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    c = ob.constraints.new(type="TRACK_TO")
    c.target = target
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"


E = span
area("Key", centre + Vector((-E * 0.5, -E * 0.9, E * 1.3)), 16 * span, E * 0.9, (1.0, 0.96, 0.9))
area("Fill", centre + Vector((-E * 0.7, E * 1.1, E * 0.45)), 8 * span, E * 1.8, (0.95, 0.97, 1.0))
area("Rim", centre + Vector((E * 1.3, 0.0, E * 0.75)), 14 * span, E * 0.8, (1.0, 0.93, 0.85))

world = bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.9, 0.87, 0.82, 1)
bg.inputs[1].default_value = 0.12

# ---------- render ----------
sc = bpy.context.scene
# Blender renamed this twice (EEVEE -> EEVEE_NEXT in 4.2 -> EEVEE again in 5),
# so pick whichever this build actually offers.
engines = sc.render.bl_rna.properties["engine"].enum_items.keys()
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = RES_X, RES_Y
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.eevee.taa_render_samples = 96
if hasattr(sc.eevee, "use_raytracing"):
    sc.eevee.use_raytracing = True
sc.view_settings.look = "AgX - Medium High Contrast"
bpy.context.view_layer.update()

# where things landed, in pixels — the SVG anchors its arcs to these
def project(p):
    # The camera is aimed by a TRACK_TO constraint, which only exists on the
    # evaluated copy — projecting the raw object silently ignores the aim.
    dg = bpy.context.evaluated_depsgraph_get()
    v = world_to_camera_view(sc, cam.evaluated_get(dg), Vector(p[:]))
    return v.x * RES_X, (1 - v.y) * RES_Y


hlo, hhi = bounds(tali_meshes)
hub_top = (hlo + hhi) / 2
hub_top[taxis] = hhi[taxis]
print("PROJ hub %.1f %.1f" % project(hub_top))
for i, p in enumerate(puk_centres):
    print("PROJ puk%d %.1f %.1f" % ((i,) + project(p)))

sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("WROTE", OUT)
