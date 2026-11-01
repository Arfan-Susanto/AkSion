(() => {
  const canvasGrid = document.getElementById("canvasGrid");
  const addCanvasButton = document.getElementById("addCanvas");
  const canvasCount = document.getElementById("canvasCount");
  const clearAllCanvases = document.getElementById("clearAllCanvases");
  const eraserToggle = document.getElementById("eraserToggle");
  const predictDrawing = document.getElementById("predictDrawing");
  const imageInput = document.getElementById("imageInput");
  const uploadQueue = document.getElementById("uploadQueue");
  const predictUpload = document.getElementById("predictUpload");
  const clearUploads = document.getElementById("clearUploads");
  const status = document.getElementById("status");
  const resultsSection = document.getElementById("resultsSection");
  const resultsGrid = document.getElementById("resultsGrid");
  const resultCount = document.getElementById("resultCount");
  const closeResultsButton = document.getElementById("closeResults");
  const dropZone = document.getElementById("dropZone");
  const fileTrigger = document.getElementById("fileTrigger");
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraPlaceholder = document.getElementById("cameraPlaceholder");
  const startCameraButton = document.getElementById("startCamera");
  const captureCameraButton = document.getElementById("captureCamera");
  const cameraCount = document.getElementById("cameraCount");
  const cameraQueue = document.getElementById("cameraQueue");
  const clearCameraButton = document.getElementById("clearCamera");
  const predictCameraButton = document.getElementById("predictCamera");
  const heroCopy = document.querySelector(".hero-copy");
  const creativeHeading = document.querySelector(".section-heading");
  const revealTargets = [
    creativeHeading,
    document.querySelector(".studio"),
    document.querySelector(".bottom-banner")
  ].filter(Boolean);
  let brushWidth = 1.5;
  let eraserEnabled = false;
  let resultsReturnFocus = null;
  let canvasId = 0;
  let uploadFiles = [];
  let cameraFiles = [];
  let cameraStream = null;
  let cameraRequestId = 0;
  let cameraObjectUrls = [];
  let drawingCanvases = [];

  requestAnimationFrame(() => {
    requestAnimationFrame(() => heroCopy.classList.add("animate-entrance"));
  });
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.2 });
    revealTargets.forEach(target => revealObserver.observe(target));
  } else {
    revealTargets.forEach(target => target.classList.add("is-visible"));
  }

  const drawTab = document.getElementById("drawTab");
  const uploadTab = document.getElementById("uploadTab");
  const cameraTab = document.getElementById("cameraTab");
  const drawPanel = document.getElementById("drawPanel");
  const uploadPanel = document.getElementById("uploadPanel");
  const cameraPanel = document.getElementById("cameraPanel");
  const modeSwitch = document.querySelector(".mode-switch");
  const brushHighlight = document.querySelector(".brush-highlight");
  const modeTabs = [drawTab, uploadTab, cameraTab];
  const modePanels = [drawPanel, uploadPanel, cameraPanel];
  let activeMode = "draw";
  function updateModeSwitch() {
    modeSwitch.dataset.mode = activeMode;
    const activeTab = modeTabs.find(tab => tab.id === `${activeMode}Tab`);
    if (!activeTab) return;
    const track = modeSwitch.querySelector(".mode-slider");
    if (!track) return;
    const rect = activeTab.getBoundingClientRect();
    const parentRect = modeSwitch.getBoundingClientRect();
    const inset = Number.parseFloat(getComputedStyle(modeSwitch).paddingLeft) || 0;
    const offset = rect.left - parentRect.left - inset;
    track.style.width = `${rect.width}px`;
    track.style.transform = `translateX(${offset}px)`;
  }
  function setMode(mode) {
    if (activeMode === "camera" && mode !== "camera") stopCamera();
    activeMode = mode;
    modeTabs.forEach(tab => {
      const selected = tab.id === `${mode}Tab`;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    modePanels.forEach(panel => panel.classList.toggle("hidden", panel.id !== `${mode}Panel`));
    updateModeSwitch();
    hideStatus();
    closeResults(false);
    if (mode === "camera") startCamera();
  }
  drawTab.addEventListener("click", () => setMode("draw"));
  uploadTab.addEventListener("click", () => setMode("upload"));
  cameraTab.addEventListener("click", () => setMode("camera"));

  function updateBrushHighlight() {
    const active = document.querySelector(".brush-option.active");
    if (!active || !brushHighlight) return;
    const optionRect = active.getBoundingClientRect();
    const parentRect = active.parentElement.getBoundingClientRect();
    const inset = Number.parseFloat(getComputedStyle(active.parentElement).paddingLeft) || 0;
    const offset = optionRect.left - parentRect.left - inset;
    brushHighlight.style.width = `${optionRect.width}px`;
    brushHighlight.style.transform = `translateX(${offset}px)`;
  }
  document.querySelectorAll(".brush-option").forEach(button => {
    button.addEventListener("click", () => {
      brushWidth = Number(button.dataset.width);
      document.querySelectorAll(".brush-option").forEach(b => b.classList.toggle("active", b === button));
      updateBrushHighlight();
    });
  });
  eraserToggle.addEventListener("click", () => {
    eraserEnabled = !eraserEnabled;
    eraserToggle.classList.toggle("active", eraserEnabled);
    eraserToggle.setAttribute("aria-pressed", String(eraserEnabled));
    eraserToggle.setAttribute("aria-label", eraserEnabled ? "Nonaktifkan penghapus" : "Aktifkan penghapus");
    canvasGrid.querySelectorAll(".drawing-canvas").forEach(canvas => {
      canvas.classList.toggle("eraser-active", eraserEnabled);
    });
  });

  function createCanvasCard() {
    if (drawingCanvases.length >= 20) {
      showStatus("Maksimal 20 kanvas sekali prediksi.", true);
      return;
    }
    const id = ++canvasId;
    const card = document.createElement("article");
    card.className = "draw-card";
    card.innerHTML = `<div class="draw-card-head"><span>SKETCH ${String(id).padStart(2,"0")}</span><button class="remove-canvas" type="button" aria-label="Hapus kanvas"><svg aria-hidden="true" viewBox="0 0 12 12"><path d="m3 3 6 6M9 3 3 9"/></svg></button></div><canvas class="drawing-canvas" width="66" height="66" aria-label="Kanvas gambar aksara ${id}"></canvas><div class="draw-card-foot">66 × 66 px · satu aksara</div>`;
    const canvas = card.querySelector("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const state = { id, card, canvas, ctx, hasInk: false };
    resetCanvas(state);
    let drawing = false;
    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return {x: Math.max(0, Math.min(66, (event.clientX - rect.left) * 66 / rect.width)),
              y: Math.max(0, Math.min(66, (event.clientY - rect.top) * 66 / rect.height))};
    }
    canvas.addEventListener("pointerdown", event => {
      event.preventDefault();
      drawing = true;
      canvas.setPointerCapture?.(event.pointerId);
      const p = point(event);
      ctx.beginPath();
      ctx.fillStyle = eraserEnabled ? "#ffffff" : "#171512";
      ctx.arc(p.x, p.y, brushWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      state.hasInk = true;
    });
    canvas.addEventListener("pointermove", event => {
      if (!drawing) return;
      event.preventDefault();
      const p = point(event);
      ctx.lineWidth = brushWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = eraserEnabled ? "#ffffff" : "#171512";
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      state.hasInk = true;
    });
    const stop = () => {
      drawing = false;
      ctx.beginPath();
      const pixels = ctx.getImageData(0, 0, 66, 66).data;
      state.hasInk = false;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] < 255 || pixels[index + 1] < 255 || pixels[index + 2] < 255) {
          state.hasInk = true;
          break;
        }
      }
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("lostpointercapture", stop);
    canvas.classList.toggle("eraser-active", eraserEnabled);
    card.querySelector(".remove-canvas").addEventListener("click", () => {
      drawingCanvases = drawingCanvases.filter(item => item.id !== id);
      card.remove();
      updateCanvasCount();
    });
    drawingCanvases.push(state);
    canvasGrid.appendChild(card);
    updateCanvasCount();
  }
  function resetCanvas(state) {
    state.ctx.save();
    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.fillStyle = "#ffffff";
    state.ctx.fillRect(0, 0, 66, 66);
    state.ctx.restore();
    state.hasInk = false;
  }
  function updateCanvasCount() {
    canvasCount.textContent = `${drawingCanvases.length} kanvas`;
    addCanvasButton.disabled = drawingCanvases.length >= 20;
  }
  addCanvasButton.addEventListener("click", createCanvasCard);
  window.addEventListener("resize", () => {
    updateModeSwitch();
    updateBrushHighlight();
  });
  requestAnimationFrame(() => {
    updateModeSwitch();
    updateBrushHighlight();
  });
  clearAllCanvases.addEventListener("click", () => {
    drawingCanvases.forEach(resetCanvas);
    hideStatus();
    closeResults(false);
    showStatus("Semua kanvas sudah dibersihkan.");
  });
  createCanvasCard();

  function squareImageFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const size = 66;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          const side = Math.min(img.width, img.height);
          const x = (img.width - side) / 2;
          const y = (img.height - side) / 2;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, x, y, side, side, 0, 0, size, size);
          canvas.toBlob(blob => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error("Gambar gagal diproses."));
              return;
            }
            resolve(new File([blob], file.name || "frame-66.png", { type: "image/png" }));
          }, "image/png", 0.95);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`${file.name || "Gambar"} gagal dibaca.`));
      };
      img.src = objectUrl;
    });
  }

  async function validateFiles(files, source = "upload") {
    const valid = [];
    const errors = [];
    for (const file of files) {
      const type = file.type || "";
      const isImage = ["image/png", "image/jpeg", "image/webp", "image/jpg", "image/*"].includes(type) || type.startsWith("image/");
      if (!isImage) {
        errors.push(`${file.name}: format tidak didukung`);
      } else if (file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: ukuran lebih dari 5 MB`);
      } else {
        valid.push(file);
      }
    }
    if (!valid.length) {
      if (errors.length) showStatus(errors.join(". "), true);
      return;
    }
    try {
      const normalized = await Promise.all(valid.map(squareImageFile));
      const combined = [...uploadFiles, ...normalized];
      uploadFiles = combined.slice(0, 20);
      if (combined.length > 20) errors.push("Maksimal 20 gambar.");
      renderUploadQueue();
      if (errors.length) showStatus(errors.join(". "), true);
      else if (normalized.length) {
        const durationLabel = source === "camera" ? "foto" : "gambar";
        showStatus(`${normalized.length} ${durationLabel} ditambahkan. Total ${uploadFiles.length} gambar.`);
      }
    } catch (error) {
      showStatus(error.message || "Gambar gagal diproses.", true);
    }
  }
  imageInput.addEventListener("change", async () => {
    await validateFiles(Array.from(imageInput.files || []), "upload");
    imageInput.value = "";
  });
  fileTrigger.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    imageInput.click();
  });
  dropZone.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    imageInput.click();
  });
  dropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      imageInput.click();
    }
  });
  ["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault(); dropZone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault(); dropZone.classList.remove("dragover");
  }));
  dropZone.addEventListener("drop", async event => {
    await validateFiles(Array.from(event.dataTransfer?.files || []), "upload");
  });
  async function startCamera() {
    if (cameraStream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showStatus("Browser ini tidak mendukung kamera. Coba gunakan browser terbaru melalui HTTPS atau localhost.", true);
      return;
    }
    const requestId = ++cameraRequestId;
    startCameraButton.disabled = true;
    showStatus("Meminta akses kamera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (requestId !== cameraRequestId || activeMode !== "camera") {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      await cameraVideo.play();
      cameraPlaceholder.hidden = true;
      cameraVideo.parentElement.classList.add("camera-active");
      captureCameraButton.disabled = false;
      startCameraButton.disabled = false;
      startCameraButton.textContent = "Matikan kamera";
      hideStatus();
    } catch (error) {
      if (requestId !== cameraRequestId) return;
      stopCamera();
      const message = error.name === "NotAllowedError"
        ? "Izin kamera ditolak. Izinkan akses kamera di pengaturan browser lalu coba lagi."
        : error.name === "NotFoundError"
          ? "Kamera tidak ditemukan pada perangkat ini."
          : error.name === "NotReadableError"
            ? "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi."
            : `Kamera tidak dapat dibuka: ${error.message || "terjadi kesalahan."}`;
      showStatus(message, true);
    }
  }
  function stopCamera() {
    cameraRequestId += 1;
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
    cameraVideo.parentElement.classList.remove("camera-active");
    cameraPlaceholder.hidden = false;
    captureCameraButton.disabled = true;
    startCameraButton.disabled = false;
    startCameraButton.textContent = "Aktifkan kamera";
  }
  startCameraButton.addEventListener("click", () => {
    if (cameraStream) {
      stopCamera();
      return;
    }
    startCamera();
  });
  captureCameraButton.addEventListener("click", () => {
    if (!cameraStream || cameraVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      showStatus("Tunggu sampai preview kamera siap, lalu ambil foto.", true);
      return;
    }
    if (cameraFiles.length >= 20) {
      showStatus("Maksimal 20 foto sekali prediksi.", true);
      return;
    }
    const size = 66;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      showStatus("Tidak dapat menyiapkan gambar dari kamera.", true);
      return;
    }
    const side = Math.min(cameraVideo.videoWidth, cameraVideo.videoHeight);
    const x = (cameraVideo.videoWidth - side) / 2;
    const y = (cameraVideo.videoHeight - side) / 2;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(cameraVideo, x, y, side, side, 0, 0, size, size);
    captureCameraButton.disabled = true;
    canvas.toBlob(blob => {
      captureCameraButton.disabled = !cameraStream;
      if (!blob) {
        showStatus("Foto dari kamera gagal disimpan. Coba ambil ulang.", true);
        return;
      }
      const filename = `kamera-${String(cameraFiles.length + 1).padStart(2, "0")}.png`;
      cameraFiles.push(new File([blob], filename, { type: "image/png" }));
      renderCameraQueue();
      showStatus(`Foto berhasil diambil (${cameraFiles.length}/20).`);
    }, "image/png");
  });
  function renderCameraQueue() {
    cameraObjectUrls.forEach(url => URL.revokeObjectURL(url));
    cameraObjectUrls = [];
    cameraQueue.replaceChildren();
    cameraFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "upload-item";
      const img = document.createElement("img");
      img.alt = `Pratinjau ${file.name}`;
      img.src = URL.createObjectURL(file);
      cameraObjectUrls.push(img.src);
      const name = document.createElement("span");
      name.className = "upload-name";
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.className = "remove-upload";
      remove.type = "button";
      remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 12 12"><path d="m3 3 6 6M9 3 3 9"/></svg>';
      remove.setAttribute("aria-label", `Hapus ${file.name}`);
      remove.addEventListener("click", () => {
        cameraFiles.splice(index, 1);
        renderCameraQueue();
      });
      item.append(img, name, remove);
      cameraQueue.appendChild(item);
    });
    cameraCount.textContent = `${cameraFiles.length} foto`;
    captureCameraButton.disabled = !cameraStream || cameraFiles.length >= 20;
    predictCameraButton.disabled = cameraFiles.length === 0;
  }
  clearCameraButton.addEventListener("click", () => {
    cameraFiles = [];
    renderCameraQueue();
    hideStatus();
    closeResults(false);
  });
  predictCameraButton.addEventListener("click", async () => {
    if (!cameraFiles.length) return showStatus("Ambil setidaknya satu foto terlebih dahulu.", true);
    await predictBatch(cameraFiles, predictCameraButton, "images");
  });
  window.addEventListener("pagehide", stopCamera);
  function renderUploadQueue() {
    uploadQueue.replaceChildren();
    uploadFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "upload-item";
      const img = document.createElement("img");
      img.alt = `Pratinjau ${file.name}`;
      img.src = URL.createObjectURL(file);
      const name = document.createElement("span");
      name.className = "upload-name";
      name.textContent = file.name;
      const remove = document.createElement("button");
      remove.className = "remove-upload";
      remove.type = "button";
      remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 12 12"><path d="m3 3 6 6M9 3 3 9"/></svg>';
      remove.setAttribute("aria-label", `Hapus ${file.name}`);
      remove.addEventListener("click", () => {
        uploadFiles.splice(index, 1);
        renderUploadQueue();
      });
      item.append(img, name, remove);
      uploadQueue.appendChild(item);
    });
    predictUpload.disabled = uploadFiles.length === 0;
    predictUpload.innerHTML = `Prediksi ${uploadFiles.length || "semua"} gambar <span>↗</span>`;
  }
  clearUploads.addEventListener("click", () => {
    uploadFiles = [];
    renderUploadQueue();
    hideStatus();
    closeResults(false);
  });
  closeResultsButton.addEventListener("click", closeResults);
  resultsSection.addEventListener("click", event => {
    if (event.target === resultsSection) closeResults();
  });
  resultsSection.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeResults();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = resultsSection.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex='-1'])");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  predictDrawing.addEventListener("click", async () => {
    const nonEmpty = drawingCanvases.filter(state => state.hasInk);
    if (!nonEmpty.length) return showStatus("Gambar minimal satu aksara terlebih dahulu.", true);
    const files = [];
    for (const state of nonEmpty) {
      const blob = await new Promise(resolve => state.canvas.toBlob(resolve, "image/png"));
      if (blob) files.push({blob, name: `sketsa-${String(state.id).padStart(2,"0")}.png`});
    }
    await predictBatch(files.map(f => new File([f.blob], f.name, {type:"image/png"})), predictDrawing, "images");
  });
  predictUpload.addEventListener("click", async () => {
    if (!uploadFiles.length) return showStatus("Pilih setidaknya satu gambar.", true);
    await predictBatch(uploadFiles, predictUpload, "images");
  });

  async function predictBatch(files, button, fieldName) {
    closeResults(false);
    showStatus(`Sedang memproses ${files.length} gambar…`);
    const oldHTML = button.innerHTML;
    button.disabled = true;
    button.textContent = "Memproses…";
    const formData = new FormData();
    files.forEach(file => formData.append(fieldName, file, file.name));
    try {
      const response = await fetch("/api/predict", {method:"POST", body:formData});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Prediksi gagal.");
      renderResults(data.results || [], button);
      const errors = (data.results || []).filter(item => item.error).length;
      showStatus(`Selesai: ${data.results.length - errors} berhasil${errors ? `, ${errors} gagal` : ""}.`);
    } catch (error) {
      showStatus(error.message || "Tidak dapat terhubung ke server.", true);
    } finally {
      button.disabled = fieldName === "images" && button === predictUpload ? uploadFiles.length === 0 : false;
      button.innerHTML = oldHTML;
      if (button === predictUpload) renderUploadQueue();
    }
  }

  function renderResults(items, returnFocus) {
    resultsGrid.replaceChildren();
    resultCount.textContent = `${items.length} hasil`;
    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "result-card";
      if (item.error) {
        card.innerHTML = `<div class="result-card-top"><span class="file-tag"></span><span class="status-dot" style="background:#F76C5E"></span></div><p class="meaning-note"></p>`;
        card.querySelector(".file-tag").textContent = item.filename || `Gambar ${index + 1}`;
        card.querySelector(".meaning-note").textContent = item.error;
        resultsGrid.appendChild(card);
        return;
      }
      if (item.dikenali === false) {
        card.innerHTML = `<div class="result-card-top"><span class="file-tag"></span><span class="status-dot" style="background:#E9842C"></span></div><div class="result-main"><div class="result-glyph" aria-hidden="true">?</div><div><div class="result-name">TIDAK JELAS</div><div class="result-sound">UNKNOWN</div></div></div><p class="meaning-note"></p>`;
        card.querySelector(".file-tag").textContent = item.filename || `Gambar ${index + 1}`;
        card.querySelector(".meaning-note").textContent = item.pesan || "Gambar tidak cukup jelas untuk dikenali sebagai aksara.";
        resultsGrid.appendChild(card);
        return;
      }
      card.innerHTML = `<div class="result-card-top"><span class="file-tag"></span><span class="status-dot"></span></div><div class="result-main"><div class="result-glyph"></div><div><div class="result-name"></div><div class="result-sound"></div></div></div><div class="probability-line"><span>Probabilitas model</span><strong class="confidence"></strong></div><div class="prob-track"><div class="prob-fill"></div></div><p class="meaning-note"></p><div class="top-three"></div>`;
      card.querySelector(".file-tag").textContent = item.filename || `Gambar ${index + 1}`;
      card.querySelector(".result-glyph").textContent = item.glyph || "—";
      card.querySelector(".result-name").textContent = item.label_display || item.label.toUpperCase();
      card.querySelector(".result-sound").textContent = `Bunyi: /${item.sound || item.label}/`;
      const percent = Math.max(0, Math.min(100, item.confidence * 100));
      card.querySelector(".confidence").textContent = `${percent.toFixed(2)}%`;
      card.querySelector(".prob-fill").style.width = `${percent}%`;
      card.querySelector(".meaning-note").textContent = `Aksara Jawa: ${item.glyph || "—"} · Kelas “${item.label}” mewakili bunyi /${item.sound || item.label}/, bukan arti kata.`;
      const top = card.querySelector(".top-three");
      (item.top_k || []).forEach(candidate => {
        const row = document.createElement("div");
        row.className = "top-three-row";
        const label = document.createElement("strong");
        label.textContent = (candidate.label || "").toUpperCase();
        const track = document.createElement("div");
        track.className = "mini-track";
        const fill = document.createElement("span");
        fill.style.width = `${Math.max(0, Math.min(100, candidate.confidence * 100))}%`;
        track.appendChild(fill);
        const value = document.createElement("span");
        value.textContent = `${(candidate.confidence * 100).toFixed(1)}%`;
        row.append(label, track, value);
        top.appendChild(row);
      });
      resultsGrid.appendChild(card);
    });
    resultsSection.classList.remove("hidden");
    document.body.classList.add("results-open");
    resultsReturnFocus = returnFocus;
    closeResultsButton.focus();
  }
  function closeResults(restoreFocus = true) {
    resultsSection.classList.add("hidden");
    document.body.classList.remove("results-open");
    if (restoreFocus && resultsReturnFocus && !resultsReturnFocus.disabled) resultsReturnFocus.focus();
  }
  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.remove("hidden", "error");
    if (isError) status.classList.add("error");
  }
  function hideStatus() { status.classList.add("hidden"); status.classList.remove("error"); }
})();
