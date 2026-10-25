"""Generate the extension icons (pure Python, no Pillow). Run: python3 extension/icons/make-icons.py"""
import struct
import zlib
from pathlib import Path

ACCENT = (47, 91, 234)
WHITE = (255, 255, 255)
SOFT = (232, 238, 252)


def inside_rounded(x, y, x0, y0, x1, y1, r):
    if x < x0 or x >= x1 or y < y0 or y >= y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def paint(size, ss=4):
    big = size * ss
    px = [[(0, 0, 0, 0)] * big for _ in range(big)]
    r = big * 0.22
    cx0, cy0, cx1, cy1 = big * 0.2, big * 0.26, big * 0.8, big * 0.78
    lx0, ly0, lx1, ly1 = big * 0.3, big * 0.42, big * 0.7, big * 0.5
    sx0, sy0, sx1, sy1 = big * 0.3, big * 0.58, big * 0.56, big * 0.64
    for y in range(big):
        for x in range(big):
            fx, fy = x + 0.5, y + 0.5
            if not inside_rounded(fx, fy, 0, 0, big, big, r):
                continue
            color = ACCENT
            if inside_rounded(fx, fy, cx0, cy0, cx1, cy1, big * 0.06):
                color = WHITE
                if inside_rounded(fx, fy, lx0, ly0, lx1, ly1, big * 0.03) or inside_rounded(fx, fy, sx0, sy0, sx1, sy1, big * 0.025):
                    color = ACCENT if fy < ly1 else SOFT
            px[y][x] = (*color, 255)
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0, 0]
            for dy in range(ss):
                for dx in range(ss):
                    p = px[y * ss + dy][x * ss + dx]
                    a = p[3] / 255
                    acc[0] += p[0] * a
                    acc[1] += p[1] * a
                    acc[2] += p[2] * a
                    acc[3] += p[3]
            n = ss * ss
            a = acc[3] / n
            if a == 0:
                row.append((0, 0, 0, 0))
            else:
                k = acc[3] / 255
                row.append((round(acc[0] / k), round(acc[1] / k), round(acc[2] / k), round(a)))
        out.append(row)
    return out


def png(rows):
    size = len(rows)
    raw = b"".join(b"\x00" + bytes(c for p in row for c in p) for row in rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


here = Path(__file__).resolve().parent
for size in (16, 32, 48, 128):
    (here / f"icon{size}.png").write_bytes(png(paint(size)))
    print("wrote", f"icon{size}.png")
