"""Blender headless: import Tali FBX, build exploded-view rig, render test stills.

Groups the assembly into 5 explode layers, offsets them along the stack axis
by rank, frames a 3/4 camera, warm studio lighting, EEVEE render.

Usage: Blender -b -P explode_render.py -- t0 t1 ...   (explode factors 0..1)
"""
import bpy
import sys
from mathutils import Vector

FBX = "/Users/frlobo/Desktop/Assets/3D/Tali v13.fbx"
OUT = "/private/tmp/claude-501/-Users-frlobo-Documents-Development-Source-Code-Astro-tali/c45c892f-4548-4c1f-89e9-37ae1c7a06f4/scratchpad/seq"
RES = 1080

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["0", "1"]
WEBP = argv and argv[0] == "webp"
if WEBP:
    argv = argv[1:]
if argv and argv[0] == "seq":
    n = int(argv[1])
    FACTORS = [i / (n - 1) for i in range(n)]
else:
    FACTORS = [float(a) for a in argv]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)

# ---------- collect explode groups ----------
def subtree_meshes(root):
    out = []
    stack = [root]
    while stack:
        o = stack.pop()
        if o.type == "MESH":
            out.append(o)
        stack.extend(o.children)
    return out

objs = bpy.data.objects
screen_root = next(o for o in objs if o.name.startswith("SCREEN_3.7"))
screen_meshes = set(subtree_meshes(screen_root))
pcb_root = next(o for o in objs if o.name.startswith("Tali_v9 v9:1"))
pcb_meshes = set(subtree_meshes(pcb_root)) - screen_meshes

groups = {
    "top": [objs["Top lid"]],
    "bumper": [objs["Aluminum bumper"]],
    "screen": sorted(screen_meshes, key=lambda o: o.name),
    "pcb": sorted(pcb_meshes, key=lambda o: o.name),
    "bottom": [objs["Bottom lid v2"]],
}

# ---------- world-space bounds ----------
def bounds(meshes):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi

all_meshes = [o for o in objs if o.type == "MESH"]
lo, hi = bounds(all_meshes)
size = hi - lo
center = (lo + hi) / 2
# stack axis = thinnest dimension of the whole assembly
axis = min(range(3), key=lambda i: size[i])
axis_vec = Vector((0, 0, 0))
axis_vec[axis] = 1.0
diag = size.length

# rank groups along the stack axis by their center
def gcenter(meshes):
    glo, ghi = bounds(meshes)
    return ((glo + ghi) / 2)[axis]

for g in groups:
    glo, ghi = bounds(groups[g])
    print(f"GROUP {g}: axis-range [{glo[axis]:.4f}, {ghi[axis]:.4f}] center {gcenter(groups[g]):.4f}")

# Physical stack order (bottom → top). Geometric ranking is unreliable here:
# the PCB's pin headers poke below the bottom tray in the export.
order = ["bottom", "pcb", "bumper", "screen", "top"]
n = len(order)
# symmetric slots: -2..+2 * spacing
SPACING = diag * 0.22
slots = {g: (i - (n - 1) / 2) * SPACING for i, g in enumerate(order)}
print("EXPLODE axis:", "XYZ"[axis], "order:", order)

# parent each group to an empty we can slide
group_empties = {}
for g, meshes in groups.items():
    e = bpy.data.objects.new(f"XPL_{g}", None)
    bpy.context.collection.objects.link(e)
    group_empties[g] = e
    for o in meshes:
        keep = o.matrix_world.copy()
        o.parent = e
        o.matrix_world = keep

# root empty so the whole assembly can rotate as it explodes
root = bpy.data.objects.new("XPL_root", None)
bpy.context.collection.objects.link(root)
root.location = center
for e in group_empties.values():
    keep = e.matrix_world.copy()
    e.parent = root
    e.matrix_world = keep

import math

def set_explode(t):
    for g, e in group_empties.items():
        e.location = axis_vec * (slots[g] * t)
        e.location -= root.location  # compensate root offset (children are local)
    rot = [0.0, 0.0, 0.0]
    rot[axis] = math.radians(24) * t
    root.rotation_euler = rot
    bpy.context.view_layer.update()

# hide PCB bits that poke below the closed enclosure (pin headers etc.)
encl_min = bounds([objs["Bottom lid v2"]])[0][axis]
hidden = 0
for o in groups["pcb"]:
    if bounds([o])[0][axis] < encl_min - 1e-5:
        o.hide_render = True
        hidden += 1
print(f"HIDDEN {hidden} protruding pcb meshes")

# e-paper UI overlay: thin plane just above the screen face
slo, shi = bounds(groups["screen"])
others = [i for i in range(3) if i != axis]
o1, o2 = others  # the two non-stack axes
long_axis, short_axis = (o1, o2) if (shi - slo)[o1] >= (shi - slo)[o2] else (o2, o1)
margin_l = (shi - slo)[long_axis] * 0.02
margin_s = (shi - slo)[short_axis] * 0.02
zt = shi[axis] + (hi - lo)[axis] * 0.02

import bmesh
me = bpy.data.meshes.new("ScreenUI")
bm = bmesh.new()
corners = []
for a in (slo[long_axis] + margin_l, shi[long_axis] - margin_l):
    for b in (slo[short_axis] + margin_s, shi[short_axis] - margin_s):
        v = [0.0, 0.0, 0.0]
        v[long_axis], v[short_axis], v[axis] = a, b, zt
        corners.append(bm.verts.new(v))
f = bm.faces.new([corners[0], corners[1], corners[3], corners[2]])
bm.normal_update()
if f.normal[axis] < 0:
    bmesh.ops.reverse_faces(bm, faces=[f])
bm.to_mesh(me)
bm.free()
ui_obj = bpy.data.objects.new("ScreenUI", me)
bpy.context.collection.objects.link(ui_obj)

uvl = me.uv_layers.new()
# corners order: (lo,lo),(lo,hi),(hi,hi),(hi,lo) in (long, short)
uv_coords = [(1, 0), (1, 1), (0, 1), (0, 0)]  # u mirrored: camera sees text un-flipped
for li, lco in enumerate(me.polygons[0].loop_indices):
    uvl.data[lco].uv = uv_coords[li]

ui_mat = bpy.data.materials.new("ScreenUIMat")
ui_mat.use_nodes = True
nt = ui_mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(
    "/private/tmp/claude-501/-Users-frlobo-Documents-Development-Source-Code-Astro-tali/c45c892f-4548-4c1f-89e9-37ae1c7a06f4/scratchpad/epaper_ui.png"
)
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 0.25
bsdf.inputs["Roughness"].default_value = 0.55
me.materials.append(ui_mat)

keep = ui_obj.matrix_world.copy()
ui_obj.parent = group_empties["screen"]
ui_obj.matrix_world = keep

# ---------- materials: fix Fusion exports ----------
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
        # Real product: carbon twill lids (see IMG_8319) — tileable procedural
        # weave mapped through the lids' Fusion UVs.
        TWILL_SCALE = 0.42  # local units are cm: 1 tile = 2.4cm -> 1.5mm weave cell
        SCR = "/private/tmp/claude-501/-Users-frlobo-Documents-Development-Source-Code-Astro-tali/c45c892f-4548-4c1f-89e9-37ae1c7a06f4/scratchpad"
        nt2 = m.node_tree
        tc = nt2.nodes.new("ShaderNodeTexCoord")
        mp = nt2.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (TWILL_SCALE, TWILL_SCALE, 1)
        ct = nt2.nodes.new("ShaderNodeTexImage")
        ct.image = bpy.data.images.load(SCR + "/twill_color.png")
        rt = nt2.nodes.new("ShaderNodeTexImage")
        rt.image = bpy.data.images.load(SCR + "/twill_rough.png")
        rt.image.colorspace_settings.name = "Non-Color"
        ct.projection = "BOX"
        ct.projection_blend = 0.3
        rt.projection = "BOX"
        rt.projection_blend = 0.3
        nt2.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt2.links.new(mp.outputs["Vector"], ct.inputs["Vector"])
        nt2.links.new(mp.outputs["Vector"], rt.inputs["Vector"])
        nt2.links.new(ct.outputs["Color"], bsdf.inputs["Base Color"])
        nt2.links.new(rt.outputs["Color"], bsdf.inputs["Roughness"])
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.4
        print("TWILL WIRED:", m.name, [(l.from_node.type, l.to_socket.name) for l in nt2.links if l.to_node == bsdf])
    elif "glass" in name or "acrylic" in name:
        # E-paper front: dark panel, not transmissive glass
        bsdf.inputs["Base Color"].default_value = (0.04, 0.04, 0.045, 1)
        bsdf.inputs["Roughness"].default_value = 0.25
        bsdf.inputs["Transmission Weight"].default_value = 0.0
    elif "255,191,0" in name or "copper" in name:  # ENIG/copper traces
        bsdf.inputs["Metallic"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = 0.45
    elif "semitransparent(0,128,0)" in name:  # soldermask
        bsdf.inputs["Base Color"].default_value = (0.012, 0.09, 0.05, 1)
        bsdf.inputs["Roughness"].default_value = 0.4
        bsdf.inputs["Alpha"].default_value = 1.0
        m.blend_method = "OPAQUE"

# ---------- camera ----------
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 65
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam

# 3/4 view: offset in the two non-axis directions + along axis a bit
d = diag * 2.0
off = Vector((0.0, 0.0, 0.0))
others = [i for i in range(3) if i != axis]
off[others[0]] = -d * 0.75
off[others[1]] = -d * 0.55
off[axis] = d * 0.55
cam.location = center + off

track = cam.constraints.new(type="TRACK_TO")
target = bpy.data.objects.new("CamTarget", None)
bpy.context.collection.objects.link(target)
target.location = center
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"

# ---------- lighting: warm studio ----------
def area(name, loc, energy, size_l, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = energy
    ld.size = size_l
    ld.color = color
    lo_ = bpy.data.objects.new(name, ld)
    bpy.context.collection.objects.link(lo_)
    lo_.location = loc
    tc = lo_.constraints.new(type="TRACK_TO")
    tc.target = target
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    return lo_

E = diag
key_off = Vector((0, 0, 0)); key_off[others[0]] = -E * 1.2; key_off[axis] = E * 1.4
fill_off = Vector((0, 0, 0)); fill_off[others[0]] = E * 1.3; fill_off[others[1]] = -E * 0.6; fill_off[axis] = E * 0.4
rim_off = Vector((0, 0, 0)); rim_off[others[1]] = E * 1.4; rim_off[axis] = E * 0.8
area("Key", center + key_off, 15 * diag, E * 1.0, (1.0, 0.96, 0.9))
area("Fill", center + fill_off, 8 * diag, E * 2.0, (0.95, 0.97, 1.0))
area("Rim", center + rim_off, 14 * diag, E * 0.8, (1.0, 0.93, 0.85))

world = bpy.data.worlds.new("World")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.9, 0.87, 0.82, 1)  # warm ambient
bg.inputs[1].default_value = 0.12

# ---------- render settings ----------
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE_NEXT"
sc.render.resolution_x = RES
sc.render.resolution_y = RES
sc.render.film_transparent = True
if WEBP:
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.quality = 85
else:
    sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.eevee.taa_render_samples = 64
sc.eevee.use_raytracing = True
sc.view_settings.look = "AgX - Medium High Contrast"

for i, t in enumerate(FACTORS):
    set_explode(t)
    sc.render.filepath = f"{OUT}/frame_{i:03d}"
    bpy.ops.render.render(write_still=True)
    print("WROTE", sc.render.filepath)
