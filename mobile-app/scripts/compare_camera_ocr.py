"""Compare Tesseract and Google Cloud Vision on one local book image."""
import argparse
import base64
import getpass
import json
import os
import subprocess
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def google_text(image, api_key):
    body = {
        'requests': [{
            'image': {'content': base64.b64encode(image).decode('ascii')},
            'features': [{'type': 'DOCUMENT_TEXT_DETECTION'}],
            'imageContext': {'languageHints': ['mn']},
        }],
    }
    request = Request(
        'https://vision.googleapis.com/v1/images:annotate',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'X-Goog-Api-Key': api_key},
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.load(response)['responses'][0]
    except HTTPError as error:
        try:
            details = json.load(error).get('error', {})
        except ValueError:
            details = {}
        status = details.get('status', 'request failed')
        message = details.get('message', '').replace(api_key, '[redacted]')
        reason = next((item['reason'] for item in details.get('details', []) if 'reason' in item), '')
        explanation = ' — '.join(part for part in (status, reason, message) if part)
        raise SystemExit(f'Google Cloud Vision HTTP {error.code}: {explanation}') from None
    except (URLError, TimeoutError) as error:
        raise SystemExit(f'Google Cloud Vision connection failed: {error.reason if isinstance(error, URLError) else error}') from None
    if 'error' in result:
        raise SystemExit(f"Google Cloud Vision: {result['error'].get('message', 'OCR failed')}")
    return result.get('fullTextAnnotation', {}).get('text', '').strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    args = parser.parse_args()
    image = args.image.read_bytes()
    if not image:
        parser.error('Image file is empty.')
    key = os.environ.get('GOOGLE_VISION_API_KEY') or getpass.getpass('Google Vision API key: ').strip()
    if not key:
        parser.error('Google Vision API key is required.')

    local = subprocess.run(
        ['tesseract', 'stdin', 'stdout', '-l', 'mon'],
        input=image, capture_output=True, check=True, timeout=15,
    ).stdout.decode().strip()
    cloud = google_text(image, key)
    print('Tesseract')
    print(local or '(бичиг танигдсангүй)')
    print('\nGoogle Cloud Vision')
    print(cloud or '(бичиг танигдсангүй)')


if __name__ == '__main__':
    main()
