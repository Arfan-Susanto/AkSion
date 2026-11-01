# predict_aksion.py - modul inferensi AkSion (Aksara Vision), versi 3
# Klasifikasi aksara Jawa (Carakan) + penolakan input yang bukan aksara / tidak jelas.
# Simpan bersama config.json, file model (.keras), dan aksion_gatekeeper.keras.
#
# Contoh pemakaian:
#   from predict_aksion import AkSionClassifier
#   clf = AkSionClassifier("folder_model")     # muat SEKALI saat server start
#   hasil = clf.predict("gambar.png")          # path file atau bytes hasil upload
#   if hasil["dikenali"]:
#       print(hasil["label"], hasil["confidence"])
#   else:
#       print(hasil["pesan"])                  # tampilkan ke pengguna
#
# Alur: gambar -> gatekeeper (aksara / bukan) -> klasifikasi 20 aksara -> ambang keyakinan.
# Ambang dibaca dari config.json bagian "rejection". Jika bagian itu tidak ada,
# semua input diklasifikasikan seperti biasa (dikenali selalu True).
import json
import pathlib

import numpy as np
import tensorflow as tf

MODULE_VERSION = 3

PESAN = {
    "bukan_aksara": "Gambar tidak terdeteksi sebagai aksara Jawa. Coba tulis atau foto satu aksara dengan latar polos.",
    "tidak_yakin": "Tulisan kurang jelas. Coba tulis ulang dengan lebih jelas dan lebih besar.",
}


class AkSionClassifier:
    def __init__(self, model_dir):
        model_dir = pathlib.Path(model_dir)
        self.cfg = json.loads((model_dir / "config.json").read_text(encoding="utf-8"))
        self.class_names = self.cfg["class_names"]
        self.height = self.cfg["img_height"]
        self.width = self.cfg["img_width"]
        self.representation = self.cfg.get("input_representation", "image")

        self.hog_params = None
        if self.representation == "hog_image":
            hog_params = dict(self.cfg["hog_params"])
            hog_params["pixels_per_cell"] = tuple(hog_params["pixels_per_cell"])
            hog_params["cells_per_block"] = tuple(hog_params["cells_per_block"])
            self.hog_params = hog_params

        self.model = tf.keras.models.load_model(model_dir / self.cfg["model_file"], compile=False)

        # Pengaturan penolakan (opsional)
        rejection = self.cfg.get("rejection") or {}
        self.gatekeeper = None
        self.gate_threshold = rejection.get("gate_threshold")
        self.min_confidence = rejection.get("min_confidence")
        if rejection.get("gatekeeper_file"):
            self.gatekeeper = tf.keras.models.load_model(
                model_dir / rejection["gatekeeper_file"], compile=False
            )

    # Preprocessing HARUS sama dengan saat training: decode -> resize bilinear -> grayscale -> skala 0-1
    def _load_gray(self, source):
        if isinstance(source, (bytes, bytearray)):
            raw = bytes(source)
        else:
            raw = pathlib.Path(source).read_bytes()
        image = tf.image.decode_image(raw, channels=3, expand_animations=False)
        image = tf.image.resize(image, [self.height, self.width], method=tf.image.ResizeMethod.BILINEAR)
        image = tf.image.rgb_to_grayscale(image)
        image = tf.cast(image, tf.float32) / 255.0
        return image.numpy()

    def _build_input(self, image):
        if self.representation == "image":
            return image[np.newaxis, ...]                     # bentuk (1, tinggi, lebar, 1)
        if self.representation == "hog_image":
            from skimage.feature import hog
            _, hog_img = hog(image.squeeze(), visualize=True, **self.hog_params)
            hog_img = hog_img.astype(np.float32)
            hog_img = hog_img / (hog_img.max() + 1e-8)
            return hog_img[np.newaxis, ..., np.newaxis]
        raise ValueError(f"input_representation tidak dikenal: {self.representation}")

    def _hasil(self, dikenali, alasan, label, confidence, aksara_score, top):
        return {
            "app": self.cfg["app_name"],
            "dikenali": dikenali,
            "alasan": alasan,                       # None | "bukan_aksara" | "tidak_yakin"
            "pesan": PESAN.get(alasan),             # teks untuk ditampilkan ke pengguna
            "label": label,                         # None jika ditolak
            "confidence": confidence,
            "aksara_score": aksara_score,           # skor gatekeeper (None jika tidak dipakai)
            "top_k": top,
        }

    def predict(self, source, top_k=3):
        image = self._load_gray(source)

        # 1) Gatekeeper: apakah ini aksara?
        aksara_score = None
        if self.gatekeeper is not None:
            aksara_score = float(self.gatekeeper.predict(image[np.newaxis, ...], verbose=0)[0][0])
            if aksara_score < self.gate_threshold:
                return self._hasil(False, "bukan_aksara", None, 0.0, aksara_score, [])

        # 2) Klasifikasi 20 aksara
        proba = self.model.predict(self._build_input(image), verbose=0)[0]
        order = np.argsort(proba)[::-1][:top_k]
        top = [{"label": self.class_names[i], "confidence": float(proba[i])} for i in order]

        # 3) Ambang keyakinan: tolak jika tidak yakin (top_k tetap dikirim untuk ditampilkan sebagai "mungkin")
        if self.min_confidence is not None and top[0]["confidence"] < self.min_confidence:
            return self._hasil(False, "tidak_yakin", None, top[0]["confidence"], aksara_score, top)

        return self._hasil(True, None, top[0]["label"], top[0]["confidence"], aksara_score, top)


if __name__ == "__main__":
    import sys
    classifier = AkSionClassifier(pathlib.Path(__file__).parent)
    print(json.dumps(classifier.predict(sys.argv[1]), indent=2, ensure_ascii=False))
