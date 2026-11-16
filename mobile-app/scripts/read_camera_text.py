"""Run Mongolian OCR and speech synthesis on the camera's local network."""
import argparse
import base64
import io
import json
import re
import subprocess
import unicodedata
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer

from generate_mongolian_audio import load_model, number_words


def speech_text(text):
    # MMS uses Cyrillic fita for Mongolian ө in its training vocabulary.
    normalized = unicodedata.normalize('NFC', text).lower().replace('ө', 'ѳ')
    return re.sub(r'[0-9]+', lambda match: ' '.join(
        number_words(int(digit)) if digit != '0' else 'тэг' for digit in match[0]
    ), ' '.join(normalized.split()))


def read_image(jpeg, model, tokenizer):
    result = subprocess.run(
        ['tesseract', 'stdin', 'stdout', '-l', 'mon'],
        input=jpeg, capture_output=True, check=True, timeout=10,
    )
    text = result.stdout.decode().strip()
    if not text:
        return {'text': ''}
    if len(text) > 1500:
        return {'text': text, 'message': 'Бичиг хэт урт байна. Хэсэгчлэн зураг авна уу.'}

    import numpy as np
    import torch

    words = speech_text(text).split()
    chunks = []
    chunk = ''
    for word in words:
        if chunk and len(chunk) + len(word) > 160:
            chunks.append(chunk)
            chunk = ''
        chunk = f'{chunk} {word}'.strip()
    chunks.append(chunk)
    output = io.BytesIO()
    with wave.open(output, 'wb') as audio:
        audio.setparams((1, 2, model.config.sampling_rate, 0, 'NONE', 'not compressed'))
        for chunk in chunks:
            inputs = tokenizer(chunk, return_tensors='pt')
            if inputs.input_ids.numel() == 0:
                continue
            with torch.inference_mode():
                samples = model(**inputs).waveform[0].cpu().numpy()
            if np.isfinite(samples).all() and len(samples) > 100:
                audio.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
        if not audio.getnframes():
            return {'text': text, 'message': 'Таньсан бичгийг дуугаар уншиж чадсангүй.'}
    return {'text': text, 'wavBase64': base64.b64encode(output.getvalue()).decode('ascii')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    languages = subprocess.check_output(['tesseract', '--list-langs'], text=True)
    if 'mon' not in languages.splitlines():
        parser.error('Install the Tesseract mon language data first.')
    model, tokenizer = load_model()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != '/read':
                self.send_error(404)
                return
            self.connection.settimeout(10)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if self.headers.get_content_type() != 'image/jpeg' or not 0 < length <= 512_000:
                    self.send_error(400, 'Expected a camera JPEG of at most 512000 bytes')
                    return
                jpeg = self.rfile.read(length)
                if len(jpeg) != length or not jpeg.startswith(b'\xff\xd8'):
                    self.send_error(400, 'Invalid JPEG')
                    return
                result = read_image(jpeg, model, tokenizer)
            except (ValueError, OSError, subprocess.SubprocessError, RuntimeError) as error:
                self.log_error('OCR/TTS failed: %s', error)
                self.send_error(500, 'OCR or speech synthesis failed')
                return
            body = json.dumps(result, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    with HTTPServer((args.host, args.port), Handler) as server:
        print(f'Ready on http://{args.host}:{args.port}/read', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
