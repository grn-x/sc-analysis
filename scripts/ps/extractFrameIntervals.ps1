$input="..\..\ignore\Fast X (2023) - Dom Saves The Vatican Scene.mp4"
$out = "frames"
mkdir $out -ea 0 | Out-Null

$times = @(
  "00:05:28 00:00:03",
  "00:05:35 00:00:06",
  "00:05:57 00:00:05",
  "00:06:05 00:00:11",
  "00:06:18 00:00:02"
)

$i = 1
foreach ($t in $times) {
  $parts = $t -split " "
  $ss = $parts[0]
  $dur = $parts[1]
  $outPattern = "$out/frame_$('{0:00}' -f $i)_%04d.png"

  ffmpeg -i "$input" -ss $ss -t $dur -q:v 2 "$outPattern"

  $i++
}

