from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename
from predict_aksion import AkSionClassifier

BASE_DIR = Path(__file__).resolve().parent
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_FILES_PER_REQUEST = 20

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES * MAX_FILES_PER_REQUEST
classifier = AkSionClassifier(BASE_DIR)  # Muat model sekali saat server dimulai.

AKSARA = {
    "ha": {"glyph": "ꦲ", "sound": "ha"},
    "na": {"glyph": "ꦤ", "sound": "na"},
    "ca": {"glyph": "ꦕ", "sound": "ca"},
    "ra": {"glyph": "ꦫ", "sound": "ra"},
    "ka": {"glyph": "ꦏ", "sound": "ka"},
    "da": {"glyph": "ꦢ", "sound": "da"},
    "ta": {"glyph": "ꦠ", "sound": "ta"},
    "sa": {"glyph": "ꦱ", "sound": "sa"},
    "wa": {"glyph": "ꦮ", "sound": "wa"},
    "la": {"glyph": "ꦭ", "sound": "la"},
    "pa": {"glyph": "ꦥ", "sound": "pa"},
    "dha": {"glyph": "ꦝ", "sound": "dha"},
    "ja": {"glyph": "ꦗ", "sound": "ja"},
    "ya": {"glyph": "ꦪ", "sound": "ya"},
    "nya": {"glyph": "ꦚ", "sound": "nya"},
    "ma": {"glyph": "ꦩ", "sound": "ma"},
    "ga": {"glyph": "ꦒ", "sound": "ga"},
    "ba": {"glyph": "ꦧ", "sound": "ba"},
    "tha": {"glyph": "ꦛ", "sound": "tha"},
    "nga": {"glyph": "ꦔ", "sound": "nga"},
}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def predict_one(file_storage):
    filename = secure_filename(file_storage.filename or "gambar")
    if not allowed_file(filename):
        return {"filename": filename, "error": "Format harus PNG, JPG, JPEG, atau WEBP."}
    raw = file_storage.read()
    if not raw:
        return {"filename": filename, "error": "File gambar kosong."}
    if len(raw) > MAX_UPLOAD_BYTES:
        return {"filename": filename, "error": "Ukuran setiap gambar maksimal 5 MB."}
    try:
        result = classifier.predict(raw, top_k=3)
        dikenali = result["dikenali"]
        label = result["label"].lower() if dikenali else "unknown"
        info = AKSARA.get(label, {"glyph": "—", "sound": label})
        return {
            "filename": filename,
            "label": label,
            "label_display": label.upper() if dikenali else "TIDAK JELAS",
            "glyph": info["glyph"],
            "sound": info["sound"],
            "confidence": result["confidence"],
            "dikenali": dikenali,
            "alasan": result["alasan"],
            "pesan": result["pesan"],
            "top_k": [
                {
                    **item,
                    "label_display": item["label"].upper(),
                    "glyph": AKSARA.get(item["label"].lower(), {}).get("glyph", "—"),
                }
                for item in result["top_k"]
            ],
        }
    except Exception:
        app.logger.exception("Prediksi gagal untuk %s", filename)
        return {"filename": filename, "error": "Gambar gagal diproses. Coba gunakan gambar PNG/JPG yang valid."}


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/predict")
def predict():
    files = request.files.getlist("images")
    if not files:
        single = request.files.get("image")
        if single:
            files = [single]
    files = [f for f in files if f and f.filename]
    if not files:
        return jsonify({"error": "Pilih atau gambar setidaknya satu aksara."}), 400
    if len(files) > MAX_FILES_PER_REQUEST:
        return jsonify({"error": f"Maksimal {MAX_FILES_PER_REQUEST} gambar sekali proses."}), 400
    results = [predict_one(file) for file in files]
    return jsonify({"results": results, "count": len(results)})


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "Total ukuran upload terlalu besar. Maksimal 5 MB per gambar."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
