"""生成 AI宿造局 tabBar 卡通图标（纯本地绘制，输出 81x81 PNG）。"""
import math
import os
from PIL import Image, ImageDraw

S = 4
W = 81
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'miniprogram', 'images')

NORMAL = {
    'line': (160, 139, 121, 255),
    'fill': (243, 236, 226, 255),
    'accent': (198, 182, 166, 255),
    'detail': (160, 139, 121, 255),
}
ACTIVE = {
    'line': (244, 102, 44, 255),
    'fill': (255, 214, 92, 255),
    'accent': (95, 211, 166, 255),
    'detail': (59, 43, 38, 255),
}


def sc(v):
    return int(round(v * S))


def rr(d, box, radius, fill, outline, width=3):
    d.rounded_rectangle(tuple(sc(v) for v in box), radius=sc(radius), fill=fill,
                        outline=outline, width=sc(width))


def circle(d, cx, cy, r, fill, outline=None, width=3):
    box = (sc(cx - r), sc(cy - r), sc(cx + r), sc(cy + r))
    d.ellipse(box, fill=fill, outline=outline, width=sc(width) if outline else 1)


def line(d, pts, fill, width=8):
    d.line([(sc(x), sc(y)) for x, y in pts], fill=fill, width=sc(width), joint='curve')


def star(d, cx, cy, r, fill, outline, width=2.5):
    pts = []
    for i in range(8):
        ang = -math.pi / 2 + i * math.pi / 4
        rad = r if i % 2 == 0 else r * 0.40
        pts.append((sc(cx + rad * math.cos(ang)), sc(cy + rad * math.sin(ang))))
    d.polygon(pts, fill=fill)
    d.line(pts + [pts[0]], fill=outline, width=sc(width), joint='curve')


def heart(d, cx, cy, size, fill, outline):
    r = size * 0.32
    circle(d, cx - r * 0.85, cy - r * 0.35, r, fill)
    circle(d, cx + r * 0.85, cy - r * 0.35, r, fill)
    pts = [(sc(cx - size * 0.55), sc(cy)), (sc(cx + size * 0.55), sc(cy)), (sc(cx), sc(cy + size * 0.72))]
    d.polygon(pts, fill=fill)
    # 简化描边：外轮廓用线勾一遍
    d.line([(sc(cx - size * 0.55), sc(cy)), (sc(cx), sc(cy + size * 0.72)),
            (sc(cx + size * 0.55), sc(cy))], fill=outline, width=sc(2), joint='curve')


def draw_camera(d, c):
    rr(d, (8, 24, 73, 68), 11, c['fill'], c['line'])
    rr(d, (22, 15, 44, 26), 5, c['accent'], c['line'])
    circle(d, 40, 46, 15, c['accent'], c['line'], 3)
    circle(d, 40, 46, 7, c['fill'], c['line'], 2)
    rr(d, (58, 31, 68, 39), 3, c['detail'], None, 1)


def draw_wand(d, c):
    line(d, [(20, 66), (52, 26)], c['line'], 11)
    line(d, [(20, 66), (52, 26)], c['accent'], 7)
    star(d, 55, 22, 19, c['fill'], c['line'], 2.5)
    star(d, 22, 24, 7, c['accent'], c['line'], 2)
    star(d, 68, 52, 6, c['accent'], c['line'], 2)


def draw_bubbles(d, c):
    rr(d, (7, 15, 48, 43), 11, c['fill'], c['line'])
    d.polygon([(sc(17), sc(41)), (sc(25), sc(41)), (sc(18), sc(51))], fill=c['fill'])
    d.line([(sc(17), sc(41)), (sc(18), sc(51)), (sc(25), sc(41))], fill=c['line'], width=sc(2.5))
    rr(d, (33, 38, 74, 65), 11, c['accent'], c['line'])
    d.polygon([(sc(57), sc(63)), (sc(65), sc(63)), (sc(60), sc(72))], fill=c['accent'])
    d.line([(sc(57), sc(63)), (sc(60), sc(72)), (sc(65), sc(63))], fill=c['line'], width=sc(2.5))
    circle(d, 20, 29, 2.6, c['detail'])
    circle(d, 28, 29, 2.6, c['detail'])
    circle(d, 36, 29, 2.6, c['detail'])
    heart(d, 53, 50, 12, c['fill'], c['line'])


def draw_person(d, c):
    circle(d, 40, 28, 17, c['fill'], c['line'])
    rr(d, (17, 50, 63, 82), 16, c['accent'], c['line'])
    circle(d, 34, 27, 2.4, c['detail'])
    circle(d, 46, 27, 2.4, c['detail'])
    d.arc((sc(32), sc(29), sc(48), sc(41)), 15, 165, fill=c['detail'], width=sc(2.6))


DRAWERS = {'post': draw_camera, 'upcycle': draw_wand, 'mutual': draw_bubbles, 'me': draw_person}


def main():
    os.makedirs(OUT, exist_ok=True)
    made = []
    for name, fn in DRAWERS.items():
        for state, palette in (('', NORMAL), ('-on', ACTIVE)):
            img = Image.new('RGBA', (W * S, W * S), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            fn(d, palette)
            img = img.resize((W, W), Image.LANCZOS)
            path = os.path.join(OUT, 'tab-' + name + state + '.png')
            img.save(path, 'PNG')
            made.append(path)
    print('\n'.join(made))
    print('total', len(made), 'icons')


if __name__ == '__main__':
    main()
