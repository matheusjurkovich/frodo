import sys
from pathlib import Path

from PIL import Image

frames_dir, output, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
paths = sorted(Path(frames_dir).glob('*.png'))[:-15]
frames = []
for path in paths:
    image = Image.open(path).convert('RGB')
    frames.append(image.resize((width, round(image.height * width / image.width)), Image.LANCZOS))

reference = Image.new('RGB', (width, frames[0].height * 3))
for row, index in enumerate((len(frames) // 4, len(frames) // 2, len(frames) * 3 // 4)):
    reference.paste(frames[index], (0, row * frames[0].height))
palette = reference.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
indexed[0].save(output, save_all=True, append_images=indexed[1:], duration=67, loop=0, optimize=True)
