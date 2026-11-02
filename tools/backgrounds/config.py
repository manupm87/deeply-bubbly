"""Every art decision for the parallax backgrounds. Imported by Blender's Python and by the system Python, so
it must stay plain data. Lengths are design px (1 px = 0.1 Three units, see docs/engineering/WEB3D.md)."""


def hx(v):
    return ((v >> 16 & 255) / 255.0, (v >> 8 & 255) / 255.0, (v & 255) / 255.0)


# Same values as apps/web/src/palette.ts (GDD 3.2); gold is the backdrop's branch coral.
Z1 = dict(waterTop=0x3fc1c9, waterBottom=0x1f7a8c, accent=0xf9d56e, rock=0x4a5568, rockLight=0x6b7a8f, coral=0xf26b4f, kelp=0x5fae5a, foam=0xe8f6f3, pink=0xf7a8d8, gold=0xe0b050)
Z2 = dict(waterTop=0x1f7a8c, waterBottom=0x14506b, accent=0xf26b4f, rock=0x3d4a5c, rockLight=0x5a6b80, coral=0xff8c5a, kelp=0x4a9a52, foam=0xd8ecec, pink=0xe89ad0, gold=0xe0a060)

OVERSCAN_PX = 16

# role comes from the name. `towers`, `decor`, `haze*` are read by render_layers.py, `post` by finish_layers.py.
# post.mix and post.blur (design px) are what keep decoration from reading as somewhere to land (GDD pillar 5).
REEF_LAYERS = {
    "z1_far": dict(
        living=0.46, zone=1, tile=(360, 720), size=(512, 1024), seed=1101, parallax=(0.12, 0.12), fade=(70, 230),
        haze=0x63c6cf, hazeBase=0.42, hazeDepth=0.25, depth=70,
        sun=1.9, ambient=0.72, decor=dict(coral=0.6, kelp=0.0, fan=0.0, sponge=0.0, brain=0.0, grass=0.0), decorScale=0.55,
        towers=[dict(x=45, w=42, amp=8, n=2, m=3), dict(x=150, w=26, amp=7, n=1, m=2), dict(x=240, w=48, amp=10, n=2, m=2), dict(x=325, w=22, amp=5, n=3, m=3)],
        post=dict(haze=0x4fbbc8, mix=0.58, gain=1.04, blur=2.4)),
    "z1_mid": dict(
        living=0.32, zone=1, tile=(540, 540), size=(1024, 1024), seed=1102, parallax=(0.42, 0.42), fade=(50, 180),
        haze=0x3fa9b6, hazeBase=0.30, hazeDepth=0.25, depth=45,
        sun=1.9, ambient=0.72, decor=dict(coral=0.9, kelp=0.25, fan=0.5, sponge=0.0, brain=0.3, grass=0.5), decorScale=0.68,
        towers=[dict(x=70, w=52, amp=12, n=1, m=2), dict(x=265, w=38, amp=10, n=1, m=3), dict(x=430, w=58, amp=12, n=2, m=2)],
        post=dict(haze=0x37a0b0, mix=0.44, gain=1.04, blur=1.6)),
    "z1_near": dict(
        living=0.24, zone=1, tile=(540, 540), size=(1024, 1024), seed=1103, parallax=(0.72, 0.72), fade=(30, 150),
        haze=0x2e93a4, hazeBase=0.22, hazeDepth=0.18, depth=30,
        sun=2.0, ambient=0.72, decor=dict(coral=1.0, kelp=0.8, fan=0.6, sponge=0.0, brain=0.5, grass=1.0), decorScale=0.8,
        towers=[dict(x=14, w=44, amp=10, n=1, m=2), dict(x=400, w=38, amp=10, n=1, m=3)],
        post=dict(haze=0x2a8fa2, mix=0.34, gain=1.04, blur=1.1)),
    "z2_far": dict(
        living=0.5, zone=2, tile=(360, 720), size=(512, 1024), seed=2101, parallax=(0.15, 0.15), fade=None,
        haze=0x1f7088, hazeBase=0.45, hazeDepth=0.25, depth=70,
        sun=1.5, ambient=0.72, decor=dict(coral=0.7, kelp=0.0, fan=0.3, sponge=0.3, brain=0.0, grass=0.0), decorScale=0.6,
        towers=[dict(x=30, w=52, amp=9, n=2, m=2), dict(x=135, w=32, amp=8, n=1, m=3), dict(x=225, w=44, amp=10, n=2, m=3), dict(x=318, w=30, amp=6, n=3, m=2)],
        post=dict(haze=0x1c6b84, mix=0.58, gain=1.04, blur=2.4)),
    "z2_mid": dict(
        living=0.34, zone=2, tile=(540, 540), size=(1024, 1024), seed=2102, parallax=(0.45, 0.45), fade=None,
        haze=0x1a6a82, hazeBase=0.30, hazeDepth=0.22, depth=45,
        sun=1.7, ambient=0.72, decor=dict(coral=1.6, kelp=0.3, fan=0.5, sponge=0.5, brain=0.3, grass=0.2), decorScale=0.7,
        towers=[dict(x=75, w=46, amp=12, n=1, m=2), dict(x=310, w=40, amp=10, n=2, m=3), dict(x=465, w=36, amp=8, n=1, m=2)],
        post=dict(haze=0x186580, mix=0.44, gain=1.04, blur=1.6)),
    "z2_near": dict(
        living=0.2, zone=2, tile=(540, 540), size=(1024, 1024), seed=2103, parallax=(0.85, 0.85), fade=None,
        haze=0x1b6a80, hazeBase=0.16, hazeDepth=0.16, depth=30, wall=True,
        sun=1.9, ambient=0.72, decor=dict(coral=1.8, kelp=0.5, fan=0.5, sponge=0.6, brain=0.5, grass=0.3), decorScale=0.8,
        towers=[dict(x=0, w=108, amp=20, n=1, m=2)],
        post=dict(haze=0x1b6a80, mix=0.34, gain=1.04, blur=1.1)),
}

WATER_LAYERS = {
    "z1_water": dict(zone=1, tile=(360, 720), size=(512, 1024), seed=1100, parallax=(0.06, 0.13)),
    "z2_water": dict(zone=2, tile=(360, 720), size=(512, 1024), seed=2100, parallax=(0.06, 0.082)),
}
RAY_LAYERS = {
    "z1_rays": dict(zone=1, tile=(360, 420), size=(512, 512), seed=1104, parallax=(0.25, 0.0), slant=0.36, peak=0.18, reach=0.95, colour=0xfff0b8,
                    beams=[(40, 15), (95, 26), (150, 11), (205, 30), (280, 17), (325, 12)]),
    "z2_rays": dict(zone=2, tile=(360, 420), size=(512, 512), seed=2104, parallax=(0.25, 0.0), slant=0.30, peak=0.16, reach=0.62, colour=0xb8efe6,
                    beams=[(60, 14), (175, 22), (300, 12)]),
}
ZONES = {1: dict(worldY=(0, 2880)), 2: dict(worldY=(2880, 7200))}

# (name, x, y) in design px from the view's top-left, y down. A hand-placed slice, not a level.
LAYOUTS = {
    "z1": [("ledge_z1_foam_short", 40, 66), ("ledge_z1_rock_medium", 60, 120), ("bur", 62, 100), ("pickup_aire", 112, 80), ("pickup_perla", 85, 150), ("pickup_concha", 158, 92),
           ("ledge_z1_coral_short", 140, 172), ("peces_payaso", 115, 215), ("medusa_farolillo", 45, 225), ("ledge_z1_kelp_short", 140, 275), ("tortuga_paseante", 55, 300), ("boya_z1", 145, 330), ("ledge_z1_rock_short", 40, 360)],
    "z2": [("ledge_z2_rock_medium", 125, 60), ("erizo_coralino", 125, 48), ("bur", 130, 84), ("ledge_z2_coral_short", 50, 122), ("anemona_pegajosa", 50, 110), ("pickup_aire", 92, 148), ("pickup_concha", 28, 185),
           ("pickup_perla", 112, 190), ("ledge_z2_kelp_short", 140, 225), ("pulpo_camuflado", 55, 260), ("corriente_mota", 90, 300), ("corriente_mota", 125, 310), ("boya_z2", 150, 310), ("ledge_z2_rock_short", 60, 355), ("almeja_porton", 60, 342)],
}
