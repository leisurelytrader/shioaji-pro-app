from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "public" / "shioaji-logo.png"
target = root / "src-tauri" / "icons" / "icon.ico"
target.parent.mkdir(parents=True, exist_ok=True)
image = Image.open(source).convert("RGBA")
image.thumbnail((256, 256), Image.Resampling.LANCZOS)
canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
canvas.alpha_composite(image, ((256 - image.width) // 2, (256 - image.height) // 2))
canvas.save(target, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(f"created {target}")
