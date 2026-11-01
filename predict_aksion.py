# predict_aksion.py - modul inferensi AkSion (Aksara Vision), versi 4 (TFLite, tanpa TensorFlow)
# Antarmuka sama persis dengan versi 3: AkSionClassifier(model_dir).predict(bytes_atau_path, top_k=3)
# Alur: gambar -> gatekeeper (aksara / bukan) -> klasifikasi 20 aksara -> ambang keyakinan.
import json
import pathlib
import threading

import numpy as np
from PIL import Image
import io

MODULE_VERSION = 4

PESAN = {
    "bukan_aksara": "Gambar tidak terdeteksi sebagai aksara Jawa. Coba tulis atau foto satu aksara dengan latar polos.",
    "tidak_yakin": "Tulisan kurang jelas. Coba tulis ulang dengan lebih jelas dan lebih besar.",
}


def _axis_coords(out_size, in_size):
    """Koordinat bilinear ala tf.image.resize (half-pixel centers, tanpa antialias)."""
    scale = in_size / out_size
    x = (np.arange(out_size, dtype=np.float32) + 0.5) * scale - 0.5
    floor = np.floor(x)
    lerp = (x - floor).astype(np.float32)
    lo = np.clip(floor, 0, in_size - 1).astype(np.int64)
    hi = np.clip(np.ceil(x), 0, in_size - 1).astype(np.int64)
    return lo, hi, lerp


def resize_bilinear(img, out_h, out_w):
    """img: float32 (H, W, C). Meniru tf.image.resize(method='bilinear')."""
    in_h, in_w = img.shape[:2]
    y_lo, y_hi, y_l = _axis_coords(out_h, in_h)
    x_lo, x_hi, x_l = _axis_coords(out_w, in_w)
    y_l = y_l[:, None, None]
    x_l = x_l[None, :, None]
    tl = img[y_lo][:, x_lo]
    tr = img[y_lo][:, x_hi]
    bl = img[y_hi][:, x_lo]
    br = img[y_hi][:, x_hi]
    top = tl + (tr - tl) * x_l
    bottom = bl + (br - bl) * x_l
    return (top + (bottom - top) * y_l).astype(np.float32)


def load_gray(source, height, width):
    """Preprocessing HARUS sama dengan training: decode RGB -> resize bilinear -> grayscale -> skala 0-1."""
    if isinstance(source, (bytes, bytearray)):
        raw = bytes(source)
    else:
        raw = pathlib.Path(source).read_bytes()
    with Image.open(io.BytesIO(raw)) as im:
        rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    rgb = resize_bilinear(rgb, height, width)
    # Bobot sama dengan tf.image.rgb_to_grayscale
    gray = rgb[..., 0] * 0.2989 + rgb[..., 1] * 0.5870 + rgb[..., 2] * 0.1140
    gray = gray[..., np.newaxis] / 255.0
    return gray.astype(np.float32)


def _get_interpreter_class():
    try:
        from ai_edge_litert.interpreter import Interpreter
    except ImportError:  # cadangan untuk dev lokal
        try:
            from tflite_runtime.interpreter import Interpreter
        except ImportError:
            import tensorflow as tf
            Interpreter = tf.lite.Interpreter
    return Interpreter


class _TFLiteModel:
    def __init__(self, path):
        Interpreter = _get_interpreter_class()
        self._interp = Interpreter(model_path=str(path))
        self._interp.allocate_tensors()
        self._in = self._interp.get_input_details()[0]["index"]
        self._out = self._interp.get_output_details()[0]["index"]
        self._lock = threading.Lock()

    def predict(self, batch):
        with self._lock:
            self._interp.set_tensor(self._in, batch.astype(np.float32))
            self._interp.invoke()
            return self._interp.get_tensor(self._out).copy()


class AkSionClassifier:
    def __init__(self, model_dir):
        model_dir = pathlib.Path(model_dir)
        self.cfg = json.loads((model_dir / "config.json").read_text(encoding="utf-8"))
        self.class_names = self.cfg["class_names"]
        self.height = self.cfg["img_height"]
        self.width = self.cfg["img_width"]
        self.representation = self.cfg.get("input_representation", "image")
        if self.representation != "image":
            raise ValueError("Versi TFLite hanya mendukung input_representation='image'.")

        self.model = _TFLiteModel(model_dir / self.cfg["model_file"])

        rejection = self.cfg.get("rejection") or {}
        self.gatekeeper = None
        self.gate_threshold = rejection.get("gate_threshold")
        self.min_confidence = rejection.get("min_confidence")
        if rejection.get("gatekeeper_file"):
            self.gatekeeper = _TFLiteModel(model_dir / rejection["gatekeeper_file"])

    def _hasil(self, dikenali, alasan, label, confidence, aksara_score, top):
        return {
            "app": self.cfg["app_name"],
            "dikenali": dikenali,
            "alasan": alasan,
            "pesan": PESAN.get(alasan),
            "label": label,
            "confidence": confidence,
            "aksara_score": aksara_score,
            "top_k": top,
        }

    def predict(self, source, top_k=3):
        image = load_gray(source, self.height, self.width)
        batch = image[np.newaxis, ...]  # (1, tinggi, lebar, 1)

        # 1) Gatekeeper: apakah ini aksara?
        aksara_score = None
        if self.gatekeeper is not None:
            aksara_score = float(self.gatekeeper.predict(batch)[0][0])
            if aksara_score < self.gate_threshold:
                return self._hasil(False, "bukan_aksara", None, 0.0, aksara_score, [])

        # 2) Klasifikasi 20 aksara
        proba = self.model.predict(batch)[0]
        order = np.argsort(proba)[::-1][:top_k]
        top = [{"label": self.class_names[i], "confidence": float(proba[i])} for i in order]

        # 3) Ambang keyakinan
        if self.min_confidence is not None and top[0]["confidence"] < self.min_confidence:
            return self._hasil(False, "tidak_yakin", None, top[0]["confidence"], aksara_score, top)

        return self._hasil(True, None, top[0]["label"], top[0]["confidence"], aksara_score, top)


if __name__ == "__main__":
    import sys
    classifier = AkSionClassifier(pathlib.Path(__file__).parent)
    print(json.dumps(classifier.predict(sys.argv[1]), indent=2, ensure_ascii=False))
