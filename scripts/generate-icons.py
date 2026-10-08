"""Generate the code-native Selio monogram, with no imaging dependencies."""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def distance(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x-a[0])*dx + (y-a[1])*dy) / (dx*dx + dy*dy)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)

def quadratic(a, b, c):
    return [((1-t)**2*a[0] + 2*(1-t)*t*b[0] + t*t*c[0], (1-t)**2*a[1] + 2*(1-t)*t*b[1] + t*t*c[1]) for t in [n/12 for n in range(13)]]

points = [(22, 9.5), (14.5, 9.5)] + quadratic((14.5,9.5), (10,9.5), (10,13))[1:] + quadratic((10,13), (10,16), (14.5,16))[1:] + [(17.5,16)] + quadratic((17.5,16), (22,16), (22,19))[1:] + quadratic((22,19), (22,22.5), (17.5,22.5))[1:] + [(10,22.5)]
segments = list(zip(points, points[1:])) + [((22,7),(22,12)), ((10,20),(10,25))]

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))

for size in (16, 32, 48, 128):
    rows = bytearray()
    for row in range(size):
        rows.append(0)
        for col in range(size):
            sums = [0,0,0,0]
            for sy in range(4):
                for sx in range(4):
                    x, y = (col+(sx+.5)/4)*32/size, (row+(sy+.5)/4)*32/size
                    inside = math.hypot(max(abs(x-16)-6,0), max(abs(y-16)-6,0)) <= 10
                    white = inside and min(distance(x,y,a,b) for a,b in segments) < 1.2
                    color = (255,255,255,255) if white else (46,99,73,255) if inside else (0,0,0,0)
                    for i,v in enumerate(color): sums[i] += v
            rows.extend(round(v/16) for v in sums)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B',size,size,8,6,0,0,0)) + chunk(b'IDAT',zlib.compress(rows)) + chunk(b'IEND',b'')
    (ROOT / 'public' / 'icon' / f'{size}.png').write_bytes(png)
