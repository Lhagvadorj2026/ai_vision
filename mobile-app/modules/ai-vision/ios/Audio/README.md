# Offline Mongolian warning audio

These warning phrases, translated object names, and distances 2–400 cm are generated locally with Meta's `facebook/mms-tts-mon` Mongolian model. The app plays the bundled clips; it does not download a voice or send text/audio to a server at runtime. This is a finite warning vocabulary, not a general-purpose arbitrary-text speech synthesizer.

Model source: https://huggingface.co/facebook/mms-tts-mon

Revision: `4079cfbea1b6c96b53316bfd20aa93f8a50dfc9d`

Model authors: Meta AI, Massively Multilingual Speech (MMS).

The model is provided under CC-BY-NC-4.0. This prototype uses it for noncommercial generation; review the upstream terms before commercial use. The checkpoint is not bundled in the iPhone app.

Generation script: `scripts/generate_mongolian_audio.py`. `manifest.json` records each clip's exact Mongolian text. Distances are spoken as words, not unread digit tokens. Synthetic pronunciation and physical alerts still require human listening and bench testing.
