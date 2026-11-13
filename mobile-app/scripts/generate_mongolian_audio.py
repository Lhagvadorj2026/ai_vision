"""Build the app's finite Mongolian warning vocabulary; no runtime TTS server.

Python deps: torch==2.2.2 transformers==4.44.2 numpy<2 scipy<1.14
Model: Meta MMS Mongolian, CC-BY-NC-4.0 (see Audio/README.md).
"""
import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'modules/ai-vision/ios/Audio'
REVISION = '4079cfbea1b6c96b53316bfd20aa93f8a50dfc9d'


def number_words(n):
    units = ['', 'нэг', 'хоёр', 'гурван', 'дөрвөн', 'таван', 'зургаан', 'долоон', 'найман', 'есөн']
    tens = ['', 'арван', 'хорин', 'гучин', 'дөчин', 'тавин', 'жаран', 'далан', 'наян', 'ерэн']
    parts = []
    if n >= 100:
        parts += [units[n // 100], 'зуун']
        n %= 100
    if n >= 10:
        parts.append(tens[n // 10])
        n %= 10
    if n:
        parts.append(units[n])
    return ' '.join(parts)


def vocabulary():
    phrases = {
        'stop': 'Зогсоорой.',
        'warning': 'Анхаар.',
        'obstacle_stop': 'Урд саад байна. Зогсоно уу.',
                'nearby_clear': 'Ойрын саад илрээгүй.',
        'range_lost': 'Зайны мэдээллийн холболт тасарлаа.',
        'sensor_unknown': 'Зайны мэдрэгчийн мэдээлэл ирэхгүй байна.',
        'vision_unavailable': 'Камерын танилт ажиллахгүй байна.',
        'object': 'Урд объект харагдаж байна.',
    }
    # Use the exact same translations as the camera UI.
    source = (ROOT / 'lib/vision.ts').read_text()
    names = source.split('const names: Record<string, string> = {', 1)[1].split('};', 1)[0]
    seen = set()
    for match in re.finditer(r"(?:'([^']+)'|(\w+)):\s*'([^']+)'", names):
        label, value = match.group(1) or match.group(2), match.group(3)
        if value in seen:
            continue
        seen.add(value)
        key = 'object_' + re.sub(r'[^a-z0-9]+', '_', label.lower())
        phrases[key] = f'Урд {value} харагдаж байна.'
    for cm in range(2, 401):
        phrases[f'distance_{cm}'] = f'Мэдрэгч {number_words(cm)} сантиметр зайд саад илрүүллээ.'
    return phrases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', action='store_true')
    args = parser.parse_args()
    import numpy as np
    import torch
    from scipy.io.wavfile import write
    from transformers import AutoTokenizer, VitsModel, VitsConfig
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file

    torch.set_num_threads(2)
    tokenizer = AutoTokenizer.from_pretrained('facebook/mms-tts-mon', revision=REVISION)
    model = VitsModel(VitsConfig.from_pretrained('facebook/mms-tts-mon', revision=REVISION))
    checkpoint = load_file(hf_hub_download('facebook/mms-tts-mon', 'model.safetensors', revision=REVISION))
    # PyTorch renamed weight-norm parameters. Load every trained weight strictly;
    # never synthesize with randomly initialized missing flow parameters.
    checkpoint = {
        key.replace('.weight_g', '.parametrizations.weight.original0')
           .replace('.weight_v', '.parametrizations.weight.original1'): value
        for key, value in checkpoint.items()
    }
    model.load_state_dict(checkpoint, strict=True)
    model.eval()
    model.speaking_rate = 1.12
    phrases = vocabulary()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    selected = {'stop': phrases['stop'], 'distance_100': phrases['distance_100']} if args.sample else phrases
    manifest_path = OUTPUT / 'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for index, (key, text) in enumerate(selected.items()):
        destination = OUTPUT / f'{key}.m4a'
        if destination.exists() and old.get(key) == text:
            continue
        torch.manual_seed(42)
        with torch.no_grad():
            audio = model(**tokenizer(text, return_tensors='pt')).waveform[0].cpu().numpy()
        assert np.isfinite(audio).all() and len(audio) > 100
        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory) / 'speech.wav'
            write(wav, model.config.sampling_rate, (np.clip(audio, -1, 1) * 32767).astype(np.int16))
            encoded = Path(directory) / 'speech.m4a'
            conversion = subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '32000', str(wav), str(encoded)], capture_output=True)
            if conversion.returncode:
                raise RuntimeError(conversion.stderr.decode(errors='replace'))
            encoded.replace(destination)
        old[key] = text
        manifest_path.write_text(json.dumps(old, ensure_ascii=False, indent=2) + '\n')
        if index % 20 == 0:
            print(f'Generated {index + 1}/{len(selected)}: {key}', flush=True)
    if not args.sample:
        assert all((OUTPUT / f'{key}.m4a').exists() for key in phrases)
    print(f'Audio ready: {len(selected)} clips', flush=True)


if __name__ == '__main__':
    main()
