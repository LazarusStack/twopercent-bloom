"""Convert a Bambu Studio colour-painted 3MF into a light, web-friendly GLB.

- reads vertices + triangles (with Bambu's per-triangle paint_color codes)
- maps codes to the project's filament colours
- simplifies by vertex clustering to roughly TARGET faces
- writes one mesh per colour (Z-up millimetres -> Y-up, same units)
"""
import json, re, sys, zipfile
import numpy as np
import trimesh

src, dst = sys.argv[1], sys.argv[2]
TARGET = int(sys.argv[3]) if len(sys.argv) > 3 else 220_000

z = zipfile.ZipFile(src)
colours = [c[:7] for c in json.loads(z.read('Metadata/project_settings.config'))['filament_colour']]
# Bambu paint codes -> filament index (1-based): "4"=1, "8"=2, then "0C"=3, "1C"=4, ... "9C"=12
code_to_idx = {'4': 1, '8': 2, **{f'{i}C': i + 3 for i in range(10)}}

xml = z.read('3D/Objects/object_1.model').decode()
vx = np.array(re.findall(r'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"', xml), dtype=np.float64)
tri = re.findall(r'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?: paint_color="([^"]*)")?', xml)
faces = np.array([t[:3] for t in tri], dtype=np.int64)
fcol = np.array([code_to_idx.get(t[3], 2) for t in tri], dtype=np.int64)  # unpainted -> skin
del xml, tri
print(f'loaded {len(vx):,} vertices, {len(faces):,} faces')

# Z-up -> Y-up
vx = np.column_stack([vx[:, 0], vx[:, 2], -vx[:, 1]])

def cluster(cell):
    q = np.floor(vx / cell).astype(np.int64)
    _, inv = np.unique(q, axis=0, return_inverse=True)
    inv = inv.ravel()
    n = inv.max() + 1
    nv = np.zeros((n, 3)); np.add.at(nv, inv, vx)
    nv /= np.bincount(inv, minlength=n)[:, None]
    f = inv[faces]
    keep = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
    return nv, f[keep], fcol[keep]

size = vx.max(0) - vx.min(0)
lo, hi = 0.01, size.max() / 20
for _ in range(14):  # binary search the cell size that lands near TARGET faces
    mid = (lo + hi) / 2
    nv, nf, nc = cluster(mid)
    if len(nf) > TARGET: lo = mid
    else: hi = mid
nv, nf, nc = cluster(hi)
print(f'simplified to {len(nf):,} faces (cell {hi:.3f} mm), height {size[1]:.1f} mm')

scene = trimesh.Scene()
for idx in np.unique(nc):
    sel = nf[nc == idx]
    used, remap = np.unique(sel, return_inverse=True)
    m = trimesh.Trimesh(vertices=nv[used], faces=remap.reshape(-1, 3), process=False)
    srgb = [int(colours[idx - 1][i:i + 2], 16) / 255 for i in (1, 3, 5)]
    # glTF colour factors are linear; the filament hex values are sRGB
    rgb = [round(255 * (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)) for c in srgb]
    m.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
        name=f'filament{idx}', baseColorFactor=rgb + [255], roughnessFactor=0.7, metallicFactor=0.0))
    scene.add_geometry(m, geom_name=f'filament{idx}')
scene.export(dst)
print('wrote', dst)
