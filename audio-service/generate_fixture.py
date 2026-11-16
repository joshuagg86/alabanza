"""Generate a short synthetic signal; tests execution, not musical quality."""
import math
from pathlib import Path
import random
import struct
import wave


def main():
    destination = Path(__file__).resolve().parent / ".local" / "inputs" / "synthetic.wav"
    destination.parent.mkdir(parents=True, exist_ok=True)
    random.seed(42)
    with wave.open(str(destination), "wb") as audio:
        audio.setparams((2, 2, 44100, 0, "NONE", "not compressed"))
        for i in range(44100 * 8):
            t = i / 44100
            beat = t % 0.5
            bass = 0.16 * math.sin(2 * math.pi * 110 * t)
            percussion = 0.2 * math.exp(-beat * 60) * random.uniform(-1, 1)
            harmonics = 0.08 * math.sin(2 * math.pi * 440 * t) * (1 + math.sin(t * 3))
            value = int(32767 * (bass + percussion + harmonics))
            audio.writeframesraw(struct.pack("<hh", value, value))
    print(destination)


if __name__ == "__main__":
    main()
