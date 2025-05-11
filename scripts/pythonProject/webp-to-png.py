from PIL import Image
import os

def convert_webp_to_png(webp_path, png_path):
    """
    Convert a .webp image to .png format.

    :param webp_path: Path to the input .webp file.
    :param png_path: Path to save the output .png file.
    """
    with Image.open(webp_path) as img:
        img.save(png_path, "PNG")


def convert_directory_webp_to_png(input_dir, output_dir):
    """
    Convert all .webp images in a directory to .png format.

    :param input_dir: Directory containing .webp files.
    :param output_dir: Directory to save the converted .png files.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for filename in os.listdir(input_dir):
        if filename.endswith(".webp"):
            webp_path = os.path.join(input_dir, filename)
            png_path = os.path.join(output_dir, filename[:-5] + ".png")
            #png_path = os.path.join(output_dir, filename[:-5]) # PIL's save method automatically adds the .png extension
            convert_webp_to_png(webp_path, png_path)
            print(f"Converted {os.path.basename(webp_path)} to {os.path.basename(png_path)}")


if __name__ == "__main__":
    input_directory = "../../rw-params/assets"
    output_directory = "../../rw-params/assets"

    print(f"Converting files in {os.path.abspath(input_directory)} to {os.path.abspath(output_directory)}")
    convert_directory_webp_to_png(input_directory, output_directory)
    print("Conversion completed.")