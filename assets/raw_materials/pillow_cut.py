from PIL import Image

img = Image.open("box_left.png")
# 假设每帧宽高是64x64，需按实际尺寸修改
frame_width, frame_height = 480, 32
columns, rows = img.width // frame_width, img.height // frame_height

for y in range(rows):
    for x in range(columns):
        box = (x * frame_width, y * frame_height, (x+1) * frame_width, (y+1) * frame_height)
        frame = img.crop(box)
        frame.save(f"cat_{y}_{x}.png")
