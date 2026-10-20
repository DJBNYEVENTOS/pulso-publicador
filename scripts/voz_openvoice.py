# Pasa locuciones (hechas con Kokoro) al timbre de una voz de muestra con OpenVoice V2 (licencia MIT).
# Uso: python3 voz_openvoice.py <checkpoints> <repo_openvoice> <muestra.wav> <salida_dir> l0.wav l1.wav ...
# Deja <salida_dir>/l0.wav, l1.wav... a 48 kHz mono.
import os, sys
import numpy as np, librosa, soundfile as sf, torch

ck, repo, muestra, salida = sys.argv[1:5]
lineas = sys.argv[5:]
sys.path.insert(0, repo)
from openvoice import utils  # noqa: E402
from openvoice.models import SynthesizerTrn  # noqa: E402
from openvoice.mel_processing import spectrogram_torch  # noqa: E402

torch.set_num_threads(max(1, os.cpu_count() or 2))
hps = utils.get_hparams_from_file(os.path.join(ck, 'config.json'))
SR = hps.data.sampling_rate
modelo = SynthesizerTrn(len(getattr(hps, 'symbols', [])), hps.data.filter_length // 2 + 1, n_speakers=hps.data.n_speakers, **hps.model).eval()
estado = torch.load(os.path.join(ck, 'checkpoint.pth'), map_location='cpu')
modelo.load_state_dict(estado['model'], strict=False)


def espectro(a):
    y = torch.FloatTensor(a).unsqueeze(0)
    return spectrogram_torch(y, hps.data.filter_length, SR, hps.data.hop_length, hps.data.win_length, center=False)


def huella(audios):
    # Promedia la huella de timbre de trozos de ~8 s con voz (descarta silencios).
    trozos = []
    for a in audios:
        a, _ = librosa.effects.trim(a, top_db=35)
        for i in range(0, max(1, len(a) - SR * 2), SR * 8):
            t = a[i:i + SR * 8]
            if len(t) > SR * 2 and np.sqrt(np.mean(t ** 2)) > 0.01:
                trozos.append(t)
    if not trozos:
        raise SystemExit('La muestra no tiene voz suficiente (graba de 1 a 2 minutos hablando).')
    with torch.no_grad():
        return torch.stack([modelo.ref_enc(espectro(t).transpose(1, 2)).unsqueeze(-1) for t in trozos[:24]]).mean(0)


ref, _ = librosa.load(muestra, sr=SR)
tgt = huella([ref])
bases = [librosa.load(f, sr=SR)[0] for f in lineas]
src = huella(bases)
os.makedirs(salida, exist_ok=True)
for f, a in zip(lineas, bases):
    with torch.no_grad():
        s = espectro(a)
        o = modelo.voice_conversion(s, torch.LongTensor([s.size(-1)]), sid_src=src, sid_tgt=tgt, tau=0.3)[0][0, 0].numpy()
    sf.write(os.path.join(salida, os.path.basename(f)), librosa.resample(o, orig_sr=SR, target_sr=48000), 48000)
    print('  convertida', os.path.basename(f))
