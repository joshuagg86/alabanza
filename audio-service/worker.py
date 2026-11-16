"""Internal, bounded subprocess. Invoke separate.py instead of this module."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--device", choices=("cpu", "mps"), default="cpu")
    args = parser.parse_args()
    import numpy as np
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    torch.set_num_threads(4)
    torch.manual_seed(0)
    if args.device == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS no está disponible; utiliza --device cpu.")
    model = get_model("htdemucs_6s")
    model.eval()
    audio, rate = sf.read(args.source, dtype="float32", always_2d=True)
    if rate != model.samplerate or audio.shape[1] != model.audio_channels:
        raise RuntimeError("El audio no coincide con el formato del modelo.")
    mix = torch.from_numpy(audio.T.copy())
    reference = mix.mean(0)
    mean, std = reference.mean(), reference.std()
    if not torch.isfinite(std) or std < 1e-8:
        raise ValueError("El archivo está vacío o no contiene una señal utilizable.")
    with torch.inference_mode():
        stems = apply_model(model, ((mix - mean) / std)[None],
                            device=args.device, shifts=1, split=True,
                            overlap=0.25, segment=7, progress=True, num_workers=0)[0]
        stems = (stems * std + mean).cpu().numpy()
    if set(model.sources) != {"vocals", "guitar", "bass", "piano", "drums", "other"}:
        raise RuntimeError("El modelo no produjo las seis fuentes esperadas.")
    if stems.shape != (6, 2, audio.shape[0]) or not np.isfinite(stems).all():
        raise RuntimeError("Las pistas tienen muestras inválidas o distinta longitud.")
    # One gain for every stem preserves the relative levels of the model output.
    peak = float(np.max(np.abs(stems)))
    gain = min(1.0, 0.98 / max(peak, 1e-8))
    args.destination.mkdir(parents=True, exist_ok=True)
    for name, stem in zip(model.sources, stems):
        sf.write(args.destination / (name + ".wav"), (stem * gain).T,
                 rate, subtype="PCM_16")
    (args.destination / "worker.json").write_text(json.dumps({
        "sampleRate": rate, "frames": audio.shape[0], "channels": 2,
        "commonGain": gain, "device": args.device,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
