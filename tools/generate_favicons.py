"""Generate the site's square favicon assets from the original transparent PNG."""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"


def main():
    with Image.open(ASSETS / "favicon-source.png") as source:
        image = source.convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("The favicon source is fully transparent")
    image = ImageOps.expand(image.crop(bounds), border=1, fill=(0, 0, 0, 0))
    image = ImageOps.contain(image, (488, 488), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    # Balance the slanted stroke optically and lift it slightly within the square.
    canvas.alpha_composite(image, ((512 - image.width) // 2 - 4, 2))
    canvas.save(
        ROOT / "docs" / "favicon.ico",
        format="ICO",
        sizes=[(size, size) for size in (16, 32, 48, 64, 96, 128, 256)],
    )
    for size, name in (
        (32, "favicon-32x32.png"),
        (96, "favicon-96x96.png"),
        (180, "apple-touch-icon.png"),
    ):
        canvas.resize((size, size), Image.Resampling.LANCZOS).save(ASSETS / name)


if __name__ == "__main__":
    main()
