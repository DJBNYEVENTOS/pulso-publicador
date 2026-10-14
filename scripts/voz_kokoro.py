# Voz gratuita con Kokoro (español latino). Uso: python3 voz_kokoro.py pedido.json
import json, sys, os
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
cfg = json.load(open(sys.argv[1]))
modelo = os.environ.get('KOKORO_DIR', os.path.expanduser('~/.cache/kokoro'))
k = Kokoro(os.path.join(modelo, 'kokoro-v1.0.onnx'), os.path.join(modelo, 'voices-v1.0.bin'))
for i, linea in enumerate(cfg['lineas']):
    s, sr = k.create(linea, voice=cfg['voz'], speed=float(cfg.get('vel', 1.05)), lang='es-419')
    a = np.abs(s); idx = np.where(a > 0.012)[0]
    if len(idx): s = s[max(0, idx[0] - 300): idx[-1] + 1200]
    sf.write(os.path.join(cfg['dir'], f'l{i}.raw.wav'), s, sr)
    os.system(f"ffmpeg -y -loglevel error -i '{os.path.join(cfg['dir'], f'l{i}.raw.wav')}' -ar 48000 -ac 1 '{os.path.join(cfg['dir'], f'l{i}.wav')}'")
    print('  línea', i + 1, round(len(s) / sr, 2), 's')
