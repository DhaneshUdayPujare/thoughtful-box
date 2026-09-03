(function () {
  "use strict";

  var THUMBS = {
    note: "/assets/note.png",
    photo: "/assets/photo.png",
    song: "/assets/song.png",
    video: "/assets/video.png",
    gift: "/assets/gift.png",
    voice: "/assets/voice.png",
    drawing: "/assets/drawing.png",
    map: "/assets/map.png",
    coupon: "/assets/coupon.png",
    news: "/assets/news.png"
  };
  var LABELS = { note: "Note", photo: "Photo", song: "Song", video: "Video", gift: "Gift", voice: "Voice", drawing: "Drawing", map: "Location", coupon: "Coupon", news: "News" };
  var DRAW_COLORS = ["#1a1a1a", "#8A6A4A", "#A9483F", "#c96a8e", "#7a9e62", "#ffffff"];
  var BOX_PHOTO = "/assets/care-package-box.webp";
  var MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB — enough for phone photos, keeps mobile decode/resize sane

  var state = { theme: "custom", title: "", message: "", from: "", anonymous: false, items: [] };

  // ---------- helpers ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function resizeImageToBlob(file, maxW, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxW / img.width);
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) { resolve(blob); }, "image/jpeg", quality || 0.8);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function formatAudioTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function pickVoiceRecorderMime() {
    if (typeof MediaRecorder === "undefined") return "";
    var candidates = [
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/aac",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ];
    if (typeof MediaRecorder.isTypeSupported !== "function") return "";
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (err) {}
    }
    return "";
  }

  function voiceExtForMime(mime) {
    var base = String(mime || "").split(";")[0].trim().toLowerCase();
    if (base === "audio/mp4" || base === "audio/aac" || base === "audio/x-m4a") return "m4a";
    if (base === "audio/mpeg" || base === "audio/mp3") return "mp3";
    if (base === "audio/ogg") return "ogg";
    if (base === "audio/wav" || base === "audio/wave" || base === "audio/x-wav") return "wav";
    return "webm";
  }

  function stopMediaStream(stream) {
    if (!stream) return;
    try {
      stream.getTracks().forEach(function (t) { t.stop(); });
    } catch (err) {}
  }

  function createVoicePlayer(src) {
    var wrap = el("div", { class: "voice-player" });
    var audio = el("audio", { preload: "auto", playsinline: "true" });
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    if (src) audio.src = src;
    var playBtn = el("button", { type: "button", class: "voice-player__play", "aria-label": "Play" });
    playBtn.textContent = "▶";
    var seek = el("input", {
      type: "range",
      class: "voice-player__seek",
      min: "0",
      max: "0",
      value: "0",
      step: "0.01"
    });
    var time = el("span", { class: "voice-player__time", text: "0:00" });
    wrap.appendChild(playBtn);
    wrap.appendChild(seek);
    wrap.appendChild(time);
    wrap.appendChild(audio);

    var scrubbing = false;
    var fixingDuration = false;

    function syncTime() {
      time.textContent = formatAudioTime(audio.currentTime) + " / " + formatAudioTime(audio.duration || 0);
      if (!scrubbing && isFinite(audio.duration) && audio.duration > 0) {
        seek.max = String(audio.duration);
        seek.value = String(audio.currentTime);
      }
    }

    function revealDuration() {
      if (isFinite(audio.duration) && audio.duration > 0) {
        syncTime();
        return;
      }
      // MediaRecorder WebM often reports Infinity until we seek to the end
      if (fixingDuration) return;
      fixingDuration = true;
      var done = function () {
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        audio.removeEventListener("timeupdate", done);
        audio.removeEventListener("durationchange", done);
        fixingDuration = false;
        try { audio.currentTime = 0; } catch (err) {}
        syncTime();
      };
      audio.addEventListener("timeupdate", done);
      audio.addEventListener("durationchange", done);
      try {
        audio.currentTime = 1e10;
      } catch (err) {
        fixingDuration = false;
      }
    }

    playBtn.addEventListener("click", function () {
      if (audio.paused) {
        var playP = audio.play();
        if (playP && playP.catch) {
          playP.catch(function () {
            playBtn.textContent = "▶";
            playBtn.setAttribute("aria-label", "Play");
            time.textContent = "Can't play";
          });
        }
      } else {
        audio.pause();
      }
    });
    audio.addEventListener("play", function () { playBtn.textContent = "❚❚"; playBtn.setAttribute("aria-label", "Pause"); });
    audio.addEventListener("pause", function () { playBtn.textContent = "▶"; playBtn.setAttribute("aria-label", "Play"); });
    audio.addEventListener("ended", function () { playBtn.textContent = "▶"; playBtn.setAttribute("aria-label", "Play"); });
    audio.addEventListener("error", function () {
      playBtn.textContent = "▶";
      playBtn.setAttribute("aria-label", "Play");
      time.textContent = "Can't play";
    });
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("loadedmetadata", revealDuration);
    seek.addEventListener("pointerdown", function () { scrubbing = true; });
    seek.addEventListener("pointerup", function () { scrubbing = false; });
    seek.addEventListener("input", function () {
      var v = Number(seek.value);
      if (isFinite(v)) audio.currentTime = v;
      time.textContent = formatAudioTime(audio.currentTime) + " / " + formatAudioTime(audio.duration || 0);
    });

    return {
      root: wrap,
      audio: audio,
      setSrc: function (url) {
        fixingDuration = false;
        audio.src = url || "";
        audio.load();
        playBtn.textContent = "▶";
        seek.value = "0";
        seek.max = "0";
        syncTime();
      }
    };
  }

  function uploadFile(blob, filename) {
    var fd = new FormData();
    fd.append("file", blob, filename);
    return fetch("/api/upload", { method: "POST", body: fd }).then(function (r) {
      return r.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (err) {
          throw new Error(
            r.ok
              ? "Upload failed: server returned a non-JSON response"
              : "Upload failed (" + r.status + "). Open the app via npm start (http://localhost:3010), or redeploy so /api/upload exists on Vercel."
          );
        }
        if (!r.ok) throw new Error((data && data.error) || "Upload failed");
        if (!data || !data.fileUrl) throw new Error("Upload failed: missing file URL");
        return data.fileUrl;
      });
    });
  }

  function youtubeId(url) {
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/i);
    return m ? m[1] : null;
  }
  function vimeoId(url) {
    var m = url.match(/vimeo\.com\/(\d+)/i);
    return m ? m[1] : null;
  }
  function spotifyEmbed(url) {
    var m = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/i);
    return m ? "https://open.spotify.com/embed/" + m[1] + "/" + m[2] : null;
  }

  // ---------- builder: item type chooser ----------
  function markerCircle() {
    return el("span", {
      class: "marker-circle",
      "aria-hidden": "true"
    });
  }

  function renderTypeGrid() {
    var grid = document.getElementById("typeGrid");
    grid.innerHTML = "";
    Object.keys(THUMBS).forEach(function (type) {
      var icon = el("div", { class: "type-icon" }, [
        markerCircle(),
        el("img", { src: THUMBS[type], alt: LABELS[type] })
      ]);
      var btn = el("button", { class: "type-btn", type: "button", onclick: function () { showItemForm(type); } }, [
        icon,
        el("span", { text: "+ " + LABELS[type] })
      ]);
      grid.appendChild(btn);
    });
  }

  function showItemForm(type) {
    var host = document.getElementById("itemFormHost");
    var backdrop = document.getElementById("itemFormBackdrop");
    var titleEl = document.getElementById("itemFormTitle");
    host.innerHTML = "";
    titleEl.textContent = ("Add " + (LABELS[type] || type)).toUpperCase();
    var form = el("div", { class: "item-form" });

    function closeForm() {
      if (form._teardown) {
        try { form._teardown(); } catch (err) {}
        form._teardown = null;
      }
      host.innerHTML = "";
      backdrop.classList.remove("visible");
      document.body.classList.remove("modal-open");
    }

    function addField(labelText, inputEl) {
      form.appendChild(el("label", { class: "field-label", text: labelText }));
      form.appendChild(inputEl);
    }

    var draft = { type: type };

    if (type === "note") {
      var ta = el("textarea", { placeholder: "write something..." });
      addField("Note", ta);
      form._collect = function () { draft.text = ta.value.trim(); return draft.text ? draft : null; };
    }

    if (type === "photo") {
      var file = el("input", { type: "file", accept: "image/*" });
      var preview = el("img", { class: "photo-preview", alt: "Photo preview" });
      preview.hidden = true;
      var previewUrl = "";
      var photoHint = el("div", { class: "upload-status", text: "Max file size: 5MB" });
      var cap = el("input", { type: "text", placeholder: "caption (optional)" });
      addField("Photo", file);
      form.appendChild(photoHint);
      form.appendChild(preview);
      addField("Caption", cap);

      function clearPhotoPreview() {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = "";
        }
        preview.hidden = true;
        preview.removeAttribute("src");
      }

      file.addEventListener("change", function () {
        clearPhotoPreview();
        photoHint.textContent = "Max file size: 5MB";
        photoHint.classList.remove("is-error");
        if (!file.files || !file.files[0]) return;
        if (file.files[0].size > MAX_PHOTO_BYTES) {
          file.value = "";
          photoHint.textContent = "That photo is too large — please choose one under 5MB.";
          photoHint.classList.add("is-error");
          return;
        }
        previewUrl = URL.createObjectURL(file.files[0]);
        preview.src = previewUrl;
        preview.hidden = false;
      });

      form._teardown = function () {
        clearPhotoPreview();
      };

      form._collect = function () {
        if (!file.files || !file.files[0]) return null;
        if (file.files[0].size > MAX_PHOTO_BYTES) {
          throw new Error("Photo must be under 5MB");
        }
        return resizeImageToBlob(file.files[0], 640, 0.8).then(function (blob) {
          if (!blob) throw new Error("Could not process that image");
          return uploadFile(blob, "photo.jpg");
        }).then(function (fileUrl) {
          draft.fileUrl = fileUrl;
          draft.caption = cap.value.trim();
          return draft;
        });
      };
    }

    if (type === "song") {
      var url1 = el("input", { type: "url", placeholder: "https://open.spotify.com/track/..." });
      var titleInput = el("input", { type: "text", placeholder: "song title (optional)" });
      addField("Song link (Spotify, Apple Music, YouTube Music...)", url1);
      addField("Title", titleInput);
      form._collect = function () {
        draft.url = url1.value.trim();
        draft.title = titleInput.value.trim();
        return draft.url ? draft : null;
      };
    }

    if (type === "video") {
      var url2 = el("input", { type: "url", placeholder: "https://youtube.com/watch?v=..." });
      var cap2 = el("input", { type: "text", placeholder: "caption (optional)" });
      addField("Video link (YouTube, Vimeo...)", url2);
      addField("Caption", cap2);
      form._collect = function () {
        draft.url = url2.value.trim();
        draft.caption = cap2.value.trim();
        return draft.url ? draft : null;
      };
    }

    if (type === "gift") {
      var url3 = el("input", { type: "url", placeholder: "https://..." });
      var note3 = el("textarea", { placeholder: "a note to go with it (optional)" });
      addField("Gift card / e-gift link", url3);
      addField("Note", note3);
      form._collect = function () {
        draft.url = url3.value.trim();
        draft.note = note3.value.trim();
        return draft.url ? draft : null;
      };
    }

    if (type === "map") {
      var placeName = el("input", { type: "text", placeholder: "our coffee shop / the park / home" });
      var mapUrl = el("input", { type: "url", placeholder: "https://maps.google.com/..." });
      var mapNote = el("textarea", { placeholder: "why this place matters (optional)" });
      addField("Place name", placeName);
      addField("Map link (Google Maps, Apple Maps...)", mapUrl);
      addField("Note", mapNote);
      form._collect = function () {
        draft.title = placeName.value.trim();
        draft.url = mapUrl.value.trim();
        draft.note = mapNote.value.trim();
        return (draft.title && draft.url) ? draft : null;
      };
    }

    if (type === "coupon") {
      var couponFor = el("input", { type: "text", placeholder: "one movie night / one free hug / one vent call" });
      var couponNote = el("textarea", { placeholder: "fine print or a little note (optional)" });
      addField("This coupon is good for", couponFor);
      addField("Note", couponNote);
      form._collect = function () {
        draft.title = couponFor.value.trim();
        draft.note = couponNote.value.trim();
        return draft.title ? draft : null;
      };
    }

    if (type === "news") {
      var newsUrl = el("input", { type: "url", placeholder: "https://..." });
      var newsTitle = el("input", { type: "text", placeholder: "article title (optional)" });
      var newsNote = el("textarea", { placeholder: "why you're sending this (optional)" });
      addField("Article link", newsUrl);
      addField("Headline", newsTitle);
      addField("Note", newsNote);
      form._collect = function () {
        draft.url = newsUrl.value.trim();
        draft.title = newsTitle.value.trim();
        draft.note = newsNote.value.trim();
        return draft.url ? draft : null;
      };
    }

    if (type === "voice") {
      var BAR_COUNT = 24;
      var voiceUI = el("div", { class: "voice-recorder" });
      var viz = el("div", { class: "voice-recorder__viz", "aria-hidden": "true" });
      var bars = [];
      for (var bi = 0; bi < BAR_COUNT; bi++) {
        var bar = el("span", { class: "voice-recorder__bar" });
        bar.style.setProperty("--i", String(bi));
        viz.appendChild(bar);
        bars.push(bar);
      }
      var recBadge = el("span", { class: "voice-recorder__badge", text: "REC" });
      recBadge.insertBefore(el("span", { class: "voice-recorder__dot" }), recBadge.firstChild);
      var timeEl = el("span", { class: "voice-recorder__time", text: "0:00" });
      var meta = el("div", { class: "voice-recorder__meta" }, [recBadge, timeEl]);
      var status = el("div", { class: "upload-status", text: "Not recorded yet" });
      var recBtn = el("button", { type: "button", class: "voice-recorder__btn", text: "Record" });
      var actions = el("div", { class: "voice-recorder__actions" }, [recBtn]);
      var memoPlayer = createVoicePlayer();
      memoPlayer.root.classList.add("voice-recorder__player");
      voiceUI.appendChild(viz);
      voiceUI.appendChild(meta);
      voiceUI.appendChild(actions);
      voiceUI.appendChild(status);
      voiceUI.appendChild(memoPlayer.root);

      var mediaRecorder = null, chunks = [], recording = false, uploading = false;
      var audioCtx = null, analyser = null, rafId = 0, timerId = 0, startedAt = 0;
      var activeStream = null, meterStream = null;

      function formatTime(ms) {
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        s = s % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
      }

      function resetBars() {
        for (var i = 0; i < bars.length; i++) {
          bars[i].style.transform = "scaleY(0.12)";
        }
      }

      function stopMeter() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        if (timerId) { clearInterval(timerId); timerId = 0; }
        if (audioCtx) {
          audioCtx.close().catch(function () {});
          audioCtx = null;
          analyser = null;
        }
        resetBars();
        timeEl.textContent = "0:00";
      }

      function showMemo(fileUrl) {
        draft.fileUrl = fileUrl;
        memoPlayer.setSrc(fileUrl);
        memoPlayer.root.classList.add("is-visible");
        voiceUI.classList.add("has-memo");
        recBtn.textContent = "Record again";
        status.textContent = "Recorded — play it back or record again";
      }

      function paintMeter() {
        if (!recording || !analyser) return;
        var data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        for (var i = 0; i < bars.length; i++) {
          var idx = Math.floor((i / bars.length) * data.length);
          var level = data[idx] / 255;
          var idle = 0.12 + 0.08 * Math.sin((Date.now() / 280) + i * 0.45);
          var h = Math.max(idle, 0.14 + level * 0.86);
          bars[i].style.transform = "scaleY(" + h.toFixed(3) + ")";
        }
        rafId = requestAnimationFrame(paintMeter);
      }

      function startMeter(stream) {
        startedAt = Date.now();
        timeEl.textContent = "0:00";
        timerId = setInterval(function () {
          timeEl.textContent = formatTime(Date.now() - startedAt);
        }, 250);
        if (!stream) {
          voiceUI.classList.add("is-fallback");
          return;
        }
        try {
          var Ctx = window.AudioContext || window.webkitAudioContext;
          audioCtx = new Ctx();
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.72;
          audioCtx.createMediaStreamSource(stream).connect(analyser);
          if (audioCtx.state === "suspended") audioCtx.resume();
          paintMeter();
        } catch (err) {
          voiceUI.classList.add("is-fallback");
        }
      }

      recBtn.addEventListener("click", function () {
        if (uploading) return;
        if (!recording) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            status.textContent = "Voice recording isn't supported in this browser.";
            return;
          }
          // Replace any existing memo when starting a new take
          if (draft.fileUrl) {
            draft.fileUrl = "";
            memoPlayer.audio.pause();
            memoPlayer.setSrc("");
            memoPlayer.root.classList.remove("is-visible");
            voiceUI.classList.remove("has-memo");
          }
          navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1
            }
          }).then(function (stream) {
            chunks = [];
            var mimeType = pickVoiceRecorderMime();
            try {
              mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType: mimeType })
                : new MediaRecorder(stream);
            } catch (err) {
              mediaRecorder = new MediaRecorder(stream);
            }
            mediaRecorder.ondataavailable = function (e) {
              if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = function () {
              var recType = "";
              try { recType = mediaRecorder.mimeType || mimeType || ""; } catch (err) {}
              recType = String(recType).split(";")[0].trim() || "audio/webm";
              if (recType === "audio/aac" || recType === "video/mp4") recType = "audio/mp4";
              var blob = new Blob(chunks, { type: recType });
              stopMediaStream(activeStream);
              activeStream = null;
              stopMediaStream(meterStream);
              meterStream = null;
              stopMeter();
              voiceUI.classList.remove("is-recording", "is-fallback");
              recBtn.textContent = "Record";
              if (!blob.size) {
                status.textContent = "Recording was empty — try again.";
                return;
              }
              uploading = true;
              status.textContent = "Uploading...";
              uploadFile(blob, "voice." + voiceExtForMime(recType)).then(function (fileUrl) {
                showMemo(fileUrl);
                uploading = false;
              }).catch(function (err) {
                status.textContent = "Upload failed: " + err.message;
                uploading = false;
              });
            };
            try {
              meterStream = stream.clone();
            } catch (err) {
              meterStream = null;
            }
            mediaRecorder.start();
            activeStream = stream;
            recording = true;
            voiceUI.classList.add("is-recording");
            recBtn.textContent = "Stop";
            status.textContent = "Listening… speak into your mic";
            // Visualize a clone so Web Audio can't resample the take being saved
            startMeter(meterStream);
          }).catch(function () {
            status.textContent = "Microphone permission was denied.";
          });
        } else {
          // Close the meter before stop() so it can't touch the final encoded cluster
          stopMeter();
          stopMediaStream(meterStream);
          meterStream = null;
          if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
          }
          recording = false;
          recBtn.textContent = "Record";
        }
      });
      form.appendChild(el("label", { class: "field-label", text: "Voice memo" }));
      form.appendChild(voiceUI);
      form._collect = function () { return draft.fileUrl ? draft : null; };
      form._teardown = function () {
        if (recording && mediaRecorder && mediaRecorder.state !== "inactive") {
          try { mediaRecorder.onstop = null; mediaRecorder.stop(); } catch (err) {}
          recording = false;
        }
        stopMediaStream(activeStream);
        activeStream = null;
        stopMediaStream(meterStream);
        meterStream = null;
        stopMeter();
      };
    }

    if (type === "drawing") {
      var drawPad = createDrawPad();
      var capDraw = el("input", { type: "text", placeholder: "caption (optional)" });
      form.appendChild(el("label", { class: "field-label", text: "Draw something" }));
      form.appendChild(drawPad.root);
      addField("Caption", capDraw);
      form._collect = function () {
        if (!drawPad.hasInk()) return null;
        return new Promise(function (resolve, reject) {
          drawPad.canvas.toBlob(function (blob) {
            if (!blob) {
              reject(new Error("Could not export that drawing — try again"));
              return;
            }
            uploadFile(blob, "drawing.png").then(function (fileUrl) {
              draft.fileUrl = fileUrl;
              draft.caption = capDraw.value.trim();
              resolve(draft);
            }).catch(reject);
          }, "image/png");
        });
      };
    }

    var addBtn = el("button", {
      type: "button", text: "Add to package",
      onclick: function () {
        addBtn.disabled = true;
        addBtn.textContent = "Adding...";
        Promise.resolve(form._collect()).then(function (item) {
          addBtn.disabled = false;
          addBtn.textContent = "Add to package";
          if (!item) return;
          state.items.push(item);
          renderItemList();
          // Non-quiet save so quota / private-mode failures are visible after adding
          saveDraftToCache();
          closeForm();
        }).catch(function (err) {
          addBtn.disabled = false;
          addBtn.textContent = "Add to package";
          alert("Couldn't add item: " + err.message);
        });
      }
    });
    var buttons = el("div", { class: "row-buttons" }, [
      addBtn,
      el("button", { type: "button", class: "secondary", text: "Cancel", onclick: closeForm })
    ]);
    form.appendChild(buttons);
    host.appendChild(form);
    backdrop.classList.add("visible");
    document.body.classList.add("modal-open");
  }

  function createDrawPad() {
    var W = 560, H = 420;
    var color = DRAW_COLORS[0];
    var size = 4;
    var drawing = false;
    var hasMarks = false;
    var lastX = 0, lastY = 0;

    var canvas = el("canvas", { class: "draw-canvas", width: String(W), height: String(H) });
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff8f4";
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var src = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * (W / rect.width),
        y: (src.clientY - rect.top) * (H / rect.height)
      };
    }

    function start(e) {
      e.preventDefault();
      drawing = true;
      var p = pos(e);
      lastX = p.x;
      lastY = p.y;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      hasMarks = true;
    }

    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
      hasMarks = true;
    }

    function end(e) {
      if (e) e.preventDefault();
      drawing = false;
    }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    canvas.addEventListener("touchcancel", end);

    var colors = el("div", { class: "draw-colors" });
    DRAW_COLORS.forEach(function (c, idx) {
      var swatch = el("button", {
        type: "button",
        class: "draw-swatch" + (idx === 0 ? " active" : "") + (c === "#ffffff" ? " light" : ""),
        style: "background:" + c,
        title: c,
        onclick: function () {
          color = c;
          Array.prototype.forEach.call(colors.children, function (n) { n.classList.remove("active"); });
          swatch.classList.add("active");
        }
      });
      colors.appendChild(swatch);
    });

    var sizes = el("div", { class: "draw-sizes" });
    [
      { label: "thin", value: 2 },
      { label: "med", value: 4 },
      { label: "thick", value: 10 }
    ].forEach(function (opt, idx) {
      var btn = el("button", {
        type: "button",
        class: "small secondary draw-size" + (idx === 1 ? " active" : ""),
        text: opt.label,
        onclick: function () {
          size = opt.value;
          Array.prototype.forEach.call(sizes.children, function (n) { n.classList.remove("active"); });
          btn.classList.add("active");
        }
      });
      sizes.appendChild(btn);
    });

    var clearBtn = el("button", {
      type: "button",
      class: "small secondary",
      text: "clear",
      onclick: function () {
        ctx.fillStyle = "#fff8f4";
        ctx.fillRect(0, 0, W, H);
        hasMarks = false;
      }
    });

    var tools = el("div", { class: "draw-tools" }, [colors, sizes, clearBtn]);
    var root = el("div", { class: "draw-pad" }, [canvas, tools]);

    return {
      root: root,
      canvas: canvas,
      hasInk: function () { return hasMarks; }
    };
  }

  function itemSummary(item) {
    if (item.type === "note") return item.text;
    if (item.type === "photo") return item.caption || "photo";
    if (item.type === "song") return item.title || item.url;
    if (item.type === "video") return item.caption || item.url;
    if (item.type === "gift") return item.url;
    if (item.type === "voice") return "voice memo";
    if (item.type === "drawing") return item.caption || "hand drawing";
    if (item.type === "map") return item.title || item.url;
    if (item.type === "coupon") return item.title || "coupon";
    if (item.type === "news") return item.title || item.url;
    return "";
  }
  function itemThumb(item) {
    if ((item.type === "photo" || item.type === "drawing") && (item.fileUrl || item.file_url)) {
      return item.fileUrl || item.file_url;
    }
    return THUMBS[item.type];
  }

  function renderItemList() {
    var list = document.getElementById("itemList");
    list.innerHTML = "";
    state.items.forEach(function (item, idx) {
      var row = el("div", { class: "item-row" }, [
        el("img", { src: itemThumb(item), alt: item.type }),
        el("div", { class: "meta" }, [
          el("div", { class: "t", text: LABELS[item.type] }),
          el("div", { class: "s", text: itemSummary(item) })
        ]),
        el("div", { class: "actions" }, [
          el("button", {
            class: "small danger",
            type: "button",
            text: "remove",
            onclick: function () {
              state.items.splice(idx, 1);
              renderItemList();
            }
          })
        ])
      ]);
      list.appendChild(row);
    });
    saveDraftToCache({ quiet: true });
  }

  // ---------- create package via API ----------
  function collectState() {
    state.title = document.getElementById("pkgTitle").value.trim() || "cutie";
    state.message = "";
    state.from = document.getElementById("pkgFrom").value.trim() || "bestie";
    state.anonymous = false;
    return state;
  }

  function showError(msg) {
    var box = document.getElementById("errorMsg");
    box.textContent = msg;
    box.style.display = msg ? "block" : "none";
  }

  function parseApiJson(r) {
    return r.text().then(function (text) {
      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(
            (text || "").trim().slice(0, 180) ||
              ("Server error (" + r.status + ")")
          );
        }
      }
      if (!r.ok) {
        throw new Error(
          (data && data.error) || ("Request failed (" + r.status + ")")
        );
      }
      return data || {};
    });
  }

  var DRAFT_KEY = "carePackageDraft";

  function setGenerateBusy(busy, label) {
    var btn = document.getElementById("generateBtn");
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = label || (busy ? "Working…" : "Generate Link");
  }

  function isInlineDataUrl(url) {
    return typeof url === "string" && url.indexOf("data:") === 0;
  }

  /** Draft copy of items — keep metadata + short URLs; drop huge data: payloads so quota fits. */
  function slimItemsForDraft(items) {
    return (items || []).map(function (item) {
      var copy = { type: item.type };
      if (item.text) copy.text = item.text;
      if (item.caption) copy.caption = item.caption;
      if (item.note) copy.note = item.note;
      if (item.title) copy.title = item.title;
      if (item.url) copy.url = item.url;
      var fileUrl = item.fileUrl || item.file_url;
      if (fileUrl && !isInlineDataUrl(fileUrl)) copy.fileUrl = fileUrl;
      return copy;
    });
  }

  function clonePackageSnapshot(pkg) {
    return JSON.parse(
      JSON.stringify({
        theme: pkg.theme,
        title: pkg.title,
        message: pkg.message || "",
        from: pkg.from,
        anonymous: !!pkg.anonymous,
        items: pkg.items || []
      })
    );
  }

  function applyPackageSnapshot(snap) {
    if (!snap) return;
    state.theme = snap.theme || state.theme;
    state.title = snap.title || state.title;
    state.message = snap.message || "";
    state.from = snap.from || state.from;
    state.anonymous = !!snap.anonymous;
    state.items = Array.isArray(snap.items) ? snap.items.slice() : [];
    if (document.getElementById("pkgTitle")) {
      document.getElementById("pkgTitle").value = state.title;
    }
    if (document.getElementById("pkgFrom")) {
      document.getElementById("pkgFrom").value = state.from;
    }
  }

  function draftHasMissingMedia(items) {
    return (items || []).some(function (item) {
      if (item.type !== "photo" && item.type !== "drawing" && item.type !== "voice") {
        return false;
      }
      return !(item.fileUrl || item.file_url);
    });
  }

  /**
   * Persist builder draft (items + To/From) so close/reopen keeps work in progress.
   * Media data: URLs are omitted so localStorage usually has room for every item slot.
   */
  function saveDraftToCache(opts) {
    opts = opts || {};
    try {
      var titleEl = document.getElementById("pkgTitle");
      var fromEl = document.getElementById("pkgFrom");
      var draft = {
        theme: state.theme,
        title: titleEl ? titleEl.value : state.title || "",
        message: state.message || "",
        from: fromEl ? fromEl.value : state.from || "",
        anonymous: !!state.anonymous,
        items: slimItemsForDraft(state.items)
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      return true;
    } catch (e) {
      // Quota / private mode — keep working in memory; pay still saves to Supabase
      if (!opts.quiet) {
        showError(
          "Couldn’t save your draft in this browser — don’t refresh until you generate your link. Your items are still here for now."
        );
      }
      return false;
    }
  }

  /**
   * Restore To/From + goodies list from localStorage (cancel / refresh / reopen UX).
   * Never replace a richer in-memory item list with a poorer draft (stale quota lag).
   */
  function restoreDraftFromCache() {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    var draft;
    try {
      draft = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    state.theme = draft.theme || state.theme;
    state.title = draft.title || state.title;
    state.message = draft.message || "";
    state.from = draft.from || state.from;
    state.anonymous = !!draft.anonymous;
    var draftItems = Array.isArray(draft.items) ? draft.items : [];
    if (draftItems.length >= state.items.length) {
      state.items = draftItems;
    } else if (state.items.length > 0) {
      // Keep richer memory; rewrite draft so a later cancel/reload doesn't shrink the list
      saveDraftToCache({ quiet: true });
    }
    if (document.getElementById("pkgTitle")) {
      document.getElementById("pkgTitle").value = state.title;
    }
    if (document.getElementById("pkgFrom")) {
      document.getElementById("pkgFrom").value = state.from;
    }
    return true;
  }

  function wireDraftFieldAutosave() {
    ["pkgTitle", "pkgFrom"].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("input", function () {
        saveDraftToCache({ quiet: true });
      });
      input.addEventListener("change", function () {
        saveDraftToCache({ quiet: true });
      });
    });
  }

    function generatePackageLink() {
    showError("");
    var pkg = collectState();
    if (pkg.items.length === 0) {
      showError("Add at least one item before generating a link.");
      return;
    }
    var memorySnapshot = clonePackageSnapshot(pkg);
    setGenerateBusy(true, "Sealing package…");
    fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, pkg, { origin: location.origin }))
    })
      .then(parseApiJson)
      .then(function (data) {
        if (!data.url) throw new Error("Could not generate package link");
        var fullUrl = location.origin + data.url;
        var out = document.getElementById("linkOutput");
        if (out) out.value = fullUrl;
        var resBox = document.getElementById("linkResult");
        if (resBox) resBox.style.display = "flex";
        setGenerateBusy(false, "Generate Link");
        localStorage.removeItem(DRAFT_KEY);
        openShareSuccessPopup(fullUrl);
      })
      .catch(function (err) {
        setGenerateBusy(false, "Generate Link");
        applyPackageSnapshot(memorySnapshot);
        renderItemList();
        showError(err.message || "Could not generate link");
      });
  }

  function openShareSuccessPopup(url) {
    var backdrop = document.getElementById("shareSuccessBackdrop");
    var input = document.getElementById("shareSuccessLink");
    var copied = document.getElementById("shareSuccessCopied");
    if (!backdrop || !input) return;
    input.value = url;
    if (copied) copied.hidden = true;
    backdrop.hidden = false;
    backdrop.classList.add("visible");
    document.body.classList.add("modal-open");
    try {
      input.focus();
      input.select();
    } catch (e) {}
  }

  function closeShareSuccessPopup() {
    var backdrop = document.getElementById("shareSuccessBackdrop");
    if (!backdrop) return;
    backdrop.classList.remove("visible");
    backdrop.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function copyShareLink(inputId, copiedId) {
    var input = document.getElementById(inputId);
    var copied = document.getElementById(copiedId);
    if (!input || !input.value) return;
    var done = function () {
      if (copied) {
        copied.hidden = false;
        setTimeout(function () { copied.hidden = true; }, 2000);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done).catch(function () {
        input.select();
        document.execCommand("copy");
        done();
      });
    } else {
      input.select();
      document.execCommand("copy");
      done();
    }
  }

  
  document.getElementById("generateBtn").addEventListener("click", function () {
    generatePackageLink();
  });

  (function wireShareSuccessPopup() {
    var backdrop = document.getElementById("shareSuccessBackdrop");
    var closeBtn = document.getElementById("shareSuccessClose");
    var doneBtn = document.getElementById("shareSuccessDone");
    var copyBtn = document.getElementById("shareSuccessCopy");
    if (closeBtn) closeBtn.addEventListener("click", closeShareSuccessPopup);
    if (doneBtn) doneBtn.addEventListener("click", closeShareSuccessPopup);
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        copyShareLink("shareSuccessLink", "shareSuccessCopied");
      });
    }
    if (backdrop) {
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) closeShareSuccessPopup();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (backdrop && backdrop.classList.contains("visible")) closeShareSuccessPopup();
    });
  })();

  function enterPreview() {
    showError("");
    var pkg = collectState();
    if (pkg.items.length === 0) {
      showError("Add at least one item before previewing.");
      return;
    }
    document.documentElement.classList.add("is-recipient", "is-preview");
    document.documentElement.classList.remove("is-package-open");
    document.getElementById("builderView").style.display = "none";
    document.getElementById("recipientView").style.display = "flex";
    document.getElementById("notfoundMsg").style.display = "none";
    document.getElementById("boxScreen").classList.remove("hidden");
    document.getElementById("openScreen").classList.remove("visible");
    renderRecipient({
      id: null,
      title: pkg.title,
      from: pkg.from,
      message: pkg.message,
      items: pkg.items.slice()
    }, { preview: true });
    window.scrollTo(0, 0);
  }

  function exitPreview() {
    document.documentElement.classList.remove("is-recipient", "is-preview", "is-package-open");
    document.getElementById("recipientView").style.display = "none";
    document.getElementById("builderView").style.display = "";
    document.getElementById("boxScreen").classList.remove("hidden");
    document.getElementById("openScreen").classList.remove("visible");
    document.getElementById("stage").style.display = "none";
    document.getElementById("recipientFooter").hidden = true;
    window.scrollTo(0, 0);
  }

  document.getElementById("previewBtn").addEventListener("click", enterPreview);
  document.getElementById("editPkgBtn").addEventListener("click", exitPreview);
  document.getElementById("copyBtn").addEventListener("click", function () {
    var out = document.getElementById("linkOutput");
    var done = function () {
      var msg = document.getElementById("copiedMsg");
      msg.style.display = "inline";
      setTimeout(function () { msg.style.display = "none"; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out.value).then(done);
    } else {
      out.select();
      document.execCommand("copy");
      done();
    }
  });

  // ---------- recipient view ----------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function layoutScatteredFloaties() {
    var host = document.getElementById("floatyHost");
    if (!host) return;
    var nodes = host.querySelectorAll(".floaty");
    var n = nodes.length;
    if (!n) return;

    var W = Math.max(280, host.clientWidth || 400);
    var tablet = W >= 600 && W < 900;
    var desktop = W >= 900;

    // Item size by viewport
    var iw;
    if (desktop) iw = 120;
    else if (tablet) iw = 108;
    else iw = Math.min(96, Math.floor(W * 0.28));
    if (n >= 8) iw = Math.min(iw, 92);
    if (n >= 10) iw = Math.min(iw, 84);

    var labelH = 34;
    // Clearance for slight rotation so visuals never clip into neighbors
    var rotPad = 12;
    var minGap = (desktop ? 48 : tablet ? 40 : 32) + rotPad;
    var idealGap = desktop ? 72 : tablet ? 56 : 44;
    var edgePadX = desktop ? 20 : tablet ? 16 : 12;
    var edgePadY = 8;

    var sizes = [];
    for (var s = 0; s < n; s++) {
      var extra = nodes[s].classList.contains("floaty--polaroid") ? 26 : 0;
      sizes.push({ w: iw, h: iw + extra + labelH });
      nodes[s].style.width = iw + "px";
      var img = nodes[s].querySelector("img");
      if (!img) continue;
      if (nodes[s].classList.contains("floaty--polaroid")) {
        img.style.width = "";
        img.style.height = "";
      } else {
        img.style.width = iw + "px";
        img.style.height = iw + "px";
      }
    }

    var avgH = sizes.reduce(function (sum, sz) { return sum + sz.h; }, 0) / n;
    var colsGuess = Math.max(1, Math.floor((W - edgePadX * 2 + minGap) / (iw + minGap)));
    var rowsGuess = Math.ceil(n / colsGuess);
    var H = Math.ceil(edgePadY * 2 + rowsGuess * (avgH + idealGap) * 1.05);

    var seed = n * 7919 + 101 + Math.floor(W / 23) + Math.floor(iw * 7);
    function rnd() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    function edgeGap(a, b) {
      var aw = a.w || iw;
      var ah = a.h || avgH;
      var bw = b.w || iw;
      var bh = b.h || avgH;
      var ax2 = a.x + aw;
      var ay2 = a.y + ah;
      var bx2 = b.x + bw;
      var by2 = b.y + bh;
      var overlapX = Math.min(ax2, bx2) - Math.max(a.x, b.x);
      var overlapY = Math.min(ay2, by2) - Math.max(a.y, b.y);
      if (overlapX > 0 && overlapY > 0) return -Math.min(overlapX, overlapY);
      if (overlapX > 0) return Math.max(a.y, b.y) - Math.min(ay2, by2);
      if (overlapY > 0) return Math.max(a.x, b.x) - Math.min(ax2, bx2);
      var dx = Math.max(a.x, b.x) - Math.min(ax2, bx2);
      var dy = Math.max(a.y, b.y) - Math.min(ay2, by2);
      return Math.sqrt(dx * dx + dy * dy);
    }

    function collides(cand) {
      for (var j = 0; j < placed.length; j++) {
        if (edgeGap(cand, placed[j]) < minGap) return true;
      }
      return false;
    }

    var placed = [];
    var rotations = [];
    var golden = Math.PI * (3 - Math.sqrt(5));

    for (var i = 0; i < n; i++) {
      var sw = sizes[i].w;
      var sh = sizes[i].h;
      var best = null;
      var bestScore = -Infinity;

      function consider(x, y) {
        x = clamp(x, edgePadX, Math.max(edgePadX, W - sw - edgePadX));
        y = Math.max(edgePadY, y);
        if (x + sw > W - edgePadX) return;
        var cand = { x: x, y: y, w: sw, h: sh };
        if (collides(cand)) return;
        // Prefer packing near the TOP (no large empty band above items)
        var nearest = Infinity;
        for (var j = 0; j < placed.length; j++) {
          nearest = Math.min(nearest, edgeGap(cand, placed[j]));
        }
        var gapScore = placed.length ? -Math.abs(nearest - idealGap) : 0;
        var topBias = -y * 1.8;
        var xSpread = -Math.abs(x + sw / 2 - W / 2) * 0.08;
        var sc = topBias + gapScore * 1.2 + xSpread + (rnd() - 0.5) * 10;
        if (sc > bestScore) {
          bestScore = sc;
          best = cand;
        }
      }

      var baseAngle = i * golden + (rnd() - 0.5) * 1.2;
      var attempts = 0;
      while (!best && attempts < 24) {
        attempts++;
        // Bias samples toward the upper portion of the current host height
        for (var attempt = 0; attempt < 80; attempt++) {
          var ang = baseAngle + (rnd() - 0.5) * 2;
          var band = 0.15 + 0.55 * Math.min(1, (i + 1) / Math.max(n, 1));
          var yy = edgePadY + rnd() * Math.max(1, (H - sh - edgePadY * 2) * band);
          var xx = edgePadX + rnd() * Math.max(1, W - sw - edgePadX * 2);
          // Mix in a mild spiral for irregularity
          if (attempt % 3 === 0) {
            var rr = Math.sqrt((i + 0.4) / Math.max(n, 1));
            xx = W / 2 - sw / 2 + Math.cos(ang) * rr * (W * 0.35) + (rnd() - 0.5) * 40;
            yy = edgePadY + Math.abs(Math.sin(ang)) * rr * (H * 0.45) + rnd() * 30;
          }
          consider(xx, yy);
        }

        // Deterministic top-to-bottom scan — guarantees a free slot
        if (!best) {
          var step = Math.max(8, Math.floor(minGap * 0.35));
          for (var sy = edgePadY; sy <= H - sh && !best; sy += step) {
            for (var sx = edgePadX; sx <= W - sw - edgePadX && !best; sx += step) {
              consider(sx, sy);
            }
          }
        }

        if (!best) {
          H += Math.ceil(sh + minGap * 0.75);
        }
      }

      if (!best) {
        best = {
          x: edgePadX + (i % Math.max(1, colsGuess)) * (iw + minGap),
          y: H,
          w: sw,
          h: sh
        };
        best.x = clamp(best.x, edgePadX, W - sw - edgePadX);
        H = best.y + sh + edgePadY;
      }

      rotations.push(rnd() * 8 - 4);
      placed.push(best);
      H = Math.max(H, best.y + best.h + edgePadY);
    }

    // Pull the whole group up so there isn't a large empty gap above
    var minY = Infinity;
    for (var p = 0; p < placed.length; p++) minY = Math.min(minY, placed[p].y);
    if (minY > edgePadY) {
      var lift = minY - edgePadY;
      for (var p2 = 0; p2 < placed.length; p2++) placed[p2].y -= lift;
    }

    // Hard resolve overlaps — grow downward instead of allowing collision
    for (var pass = 0; pass < 10; pass++) {
      var moved = false;
      for (var a = 0; a < placed.length; a++) {
        for (var b = a + 1; b < placed.length; b++) {
          var g = edgeGap(placed[a], placed[b]);
          if (g >= minGap) continue;
          moved = true;
          var need = minGap - g;
          // Prefer separating vertically to keep a compact top band
          if (placed[a].y <= placed[b].y) {
            placed[b].y += need * 0.55 + 1;
          } else {
            placed[a].y += need * 0.55 + 1;
          }
          // Slight horizontal nudge for organic look
          var dir = placed[a].x <= placed[b].x ? 1 : -1;
          placed[a].x = clamp(placed[a].x - dir * 2, edgePadX, W - placed[a].w - edgePadX);
          placed[b].x = clamp(placed[b].x + dir * 2, edgePadX, W - placed[b].w - edgePadX);
        }
        placed[a].x = clamp(placed[a].x, edgePadX, W - placed[a].w - edgePadX);
        placed[a].y = Math.max(edgePadY, placed[a].y);
      }
      if (!moved) break;
    }

    // Compact upward again after separation
    minY = Infinity;
    for (var p3 = 0; p3 < placed.length; p3++) minY = Math.min(minY, placed[p3].y);
    if (minY > edgePadY) {
      var lift2 = minY - edgePadY;
      for (var p4 = 0; p4 < placed.length; p4++) placed[p4].y -= lift2;
    }

    // Final no-overlap verification pass: if still colliding, stack with offset
    for (var a2 = 0; a2 < placed.length; a2++) {
      for (var b2 = 0; b2 < a2; b2++) {
        var guard = 0;
        while (edgeGap(placed[a2], placed[b2]) < minGap && guard < 40) {
          placed[a2].y = placed[b2].y + placed[b2].h + minGap;
          placed[a2].x = clamp(
            edgePadX + rnd() * Math.max(1, W - placed[a2].w - edgePadX * 2),
            edgePadX,
            W - placed[a2].w - edgePadX
          );
          guard++;
        }
      }
    }

    var maxBottom = 0;
    for (var k = 0; k < placed.length; k++) {
      nodes[k].style.left = Math.round(placed[k].x) + "px";
      nodes[k].style.top = Math.round(placed[k].y) + "px";
      nodes[k].style.setProperty("--float-rot", rotations[k].toFixed(2) + "deg");
      nodes[k].style.zIndex = String(2 + (k % 5));
      maxBottom = Math.max(maxBottom, placed[k].y + placed[k].h);
    }
    host.style.minHeight = Math.ceil(maxBottom + edgePadY + 12) + "px";
  }

  function renderRecipient(pkg, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    document.getElementById("stage").style.display = "block";
    document.getElementById("recipientFooter").hidden = false;

    var toName = String(pkg.title || "").trim() || "cutie";
    var fromName = String(pkg.from || pkg.from_name || "").trim() || "bestie";
    document.getElementById("rTitle").textContent = "you've got mail";
    var oTitle = document.getElementById("oTitle");
    oTitle.classList.remove("ransom-title");
    oTitle.className = "pkg-title pkg-title--stamp";
    oTitle.innerHTML = "";
    oTitle.appendChild(el("img", {
      src: "/assets/stamp-goodies.webp",
      alt: "your little box of goodies"
    }));
    document.getElementById("oMsg").textContent = pkg.message || "";
    document.getElementById("rFrom").textContent = "";
    document.getElementById("boxImg").src = BOX_PHOTO;
    document.getElementById("boxLabelTo").textContent = toName;
    document.getElementById("boxLabelFrom").textContent = fromName;

    var host = document.getElementById("floatyHost");
    host.innerHTML = "";
    host.style.minHeight = "";
    (pkg.items || []).forEach(function (item, idx) {
      var anim = "fl" + (idx % 6);
      var isPhoto = item.type === "photo";
      var wrap = el("div", {
        class: "floaty" + (isPhoto ? " floaty--polaroid" : ""),
        style: "animation:" + anim + " " + (3.4 + (idx % 4) * 0.3) + "s ease-in-out infinite;"
      });
      var thumb = el("img", { src: itemThumb(item), alt: item.type });
      var btn = el("button", { type: "button", onclick: function () { openModal(item); } }, [
        isPhoto ? el("div", { class: "polaroid" }, [thumb]) : thumb,
        el("div", { class: "fl-label", text: LABELS[item.type] })
      ]);
      wrap.appendChild(btn);
      host.appendChild(wrap);
    });

    var opening = false;
    document.getElementById("openBtn").onclick = function () {
      if (opening) return;
      opening = true;
      var scene = document.querySelector(".box-scene");
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      function goOpen() {
        document.documentElement.classList.add("is-package-open");
        document.getElementById("boxScreen").classList.add("hidden");
        document.getElementById("openScreen").classList.add("visible");
        if (!isPreview && pkg.id) {
          fetch("/api/packages/" + pkg.id + "/opened", { method: "POST" }).catch(function () {});
        }
        window.requestAnimationFrame(function () {
          layoutScatteredFloaties();
          window.requestAnimationFrame(layoutScatteredFloaties);
        });
      }

      if (!scene || reduceMotion) {
        goOpen();
        return;
      }

      scene.classList.remove("is-shaking");
      // force reflow so shake can re-trigger
      void scene.offsetWidth;
      scene.classList.add("is-shaking");
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        scene.classList.remove("is-shaking");
        goOpen();
      }
      scene.addEventListener("animationend", function (e) {
        if (e.animationName === "box-shake") finish();
      }, { once: true });
      setTimeout(finish, 850);
    };
  }

  function openModal(item) {
    var body = document.getElementById("modalBody");
    body.innerHTML = "";
    if (item.type === "note") {
      body.appendChild(el("div", { class: "note-text", text: "\u201c" + item.text + "\u201d" }));
    } else if (item.type === "photo" || item.type === "drawing") {
      body.appendChild(el("img", { class: "full", src: item.fileUrl || item.file_url, alt: item.type === "drawing" ? "drawing" : "photo" }));
      if (item.caption) body.appendChild(el("div", { class: "note-text", text: item.caption }));
    } else if (item.type === "song") {
      var sp = spotifyEmbed(item.url);
      if (sp) {
        body.appendChild(el("iframe", { src: sp, height: "152", allow: "encrypted-media" }));
      } else {
        body.appendChild(el("div", { class: "note-text", text: item.title || "a song for you" }));
        body.appendChild(linkOutButton(item.url));
      }
    } else if (item.type === "video") {
      var yt = youtubeId(item.url), vm = vimeoId(item.url);
      if (yt) {
        body.appendChild(el("iframe", { src: "https://www.youtube.com/embed/" + yt, height: "240", allowfullscreen: "true" }));
      } else if (vm) {
        body.appendChild(el("iframe", { src: "https://player.vimeo.com/video/" + vm, height: "240", allowfullscreen: "true" }));
      } else {
        body.appendChild(el("div", { class: "note-text", text: item.caption || "a video for you" }));
        body.appendChild(linkOutButton(item.url));
      }
      if ((yt || vm) && item.caption) body.appendChild(el("div", { class: "note-text", text: item.caption, style: "margin-top:10px;" }));
    } else if (item.type === "gift") {
      if (item.note) body.appendChild(el("div", { class: "note-text", text: item.note }));
      body.appendChild(linkOutButton(item.url, "Open gift"));
    } else if (item.type === "map") {
      body.appendChild(el("div", { class: "note-text", text: item.title || "a place for you" }));
      if (item.note) body.appendChild(el("div", { class: "pkg-msg", text: item.note, style: "text-align:center; margin: 8px 0 14px;" }));
      body.appendChild(linkOutButton(item.url, "Open in maps"));
    } else if (item.type === "coupon") {
      body.appendChild(el("img", { class: "full coupon-ticket", src: THUMBS.coupon, alt: "coupon" }));
      body.appendChild(el("div", { class: "note-text", text: "good for: " + (item.title || "something special") }));
      if (item.note) body.appendChild(el("div", { class: "pkg-msg", text: item.note, style: "text-align:center; margin-top: 10px;" }));
    } else if (item.type === "news") {
      body.appendChild(el("div", { class: "note-text", text: item.title || "an article for you" }));
      if (item.note) body.appendChild(el("div", { class: "pkg-msg", text: item.note, style: "text-align:center; margin: 8px 0 14px;" }));
      body.appendChild(linkOutButton(item.url, "Read article"));
    } else if (item.type === "voice") {
      body.appendChild(createVoicePlayer(item.fileUrl || item.file_url).root);
    }
    document.getElementById("modalBackdrop").classList.add("visible");
  }
  function linkOutButton(url, label) {
    var a = el("a", { href: url, target: "_blank", rel: "noopener", class: "link-out" });
    var btn = el("button", { type: "button", text: label || "Open link" });
    a.appendChild(btn);
    return a;
  }
  document.getElementById("modalClose").addEventListener("click", function () {
    document.getElementById("modalBackdrop").classList.remove("visible");
  });
  document.getElementById("modalBackdrop").addEventListener("click", function (e) {
    if (e.target === document.getElementById("modalBackdrop")) {
      document.getElementById("modalBackdrop").classList.remove("visible");
    }
  });

  function closeItemFormModal() {
    var host = document.getElementById("itemFormHost");
    var form = host && host.querySelector(".item-form");
    if (form && form._teardown) {
      try { form._teardown(); } catch (err) {}
    }
    if (host) host.innerHTML = "";
    document.getElementById("itemFormBackdrop").classList.remove("visible");
    document.body.classList.remove("modal-open");
  }
  document.getElementById("itemFormClose").addEventListener("click", closeItemFormModal);
  document.getElementById("itemFormBackdrop").addEventListener("click", function (e) {
    if (e.target === document.getElementById("itemFormBackdrop")) closeItemFormModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (document.getElementById("itemFormBackdrop").classList.contains("visible")) {
      closeItemFormModal();
    } else if (document.getElementById("modalBackdrop").classList.contains("visible")) {
      document.getElementById("modalBackdrop").classList.remove("visible");
    }
  });

  var scatterResizeTimer = 0;
  window.addEventListener("resize", function () {
    if (!document.documentElement.classList.contains("is-package-open")) return;
    window.clearTimeout(scatterResizeTimer);
    scatterResizeTimer = window.setTimeout(layoutScatteredFloaties, 120);
  });

  // ---------- boot ----------
  function boot() {
    var match = location.pathname.match(/^\/p\/([A-Za-z0-9_-]+)/);
    if (match) {
      document.documentElement.classList.add("is-recipient");
      document.getElementById("builderView").style.display = "none";
      document.getElementById("recipientView").style.display = "flex";
      document.getElementById("recipientFooter").hidden = true;
      fetch("/api/packages/" + match[1])
        .then(function (r) {
          if (!r.ok) throw new Error("not found");
          return r.json();
        })
        .then(function (pkg) { renderRecipient(pkg); })
        .catch(function () {
          document.getElementById("notfoundMsg").style.display = "block";
          document.getElementById("recipientFooter").hidden = true;
        });
      return;
    }

        restoreDraftFromCache();
    if (draftHasMissingMedia(state.items)) {
      showError(
        "Restored your draft, but some photos/voice/drawings couldn’t be kept locally. Re-add those before generating your link."
      );
    }

    wireDraftFieldAutosave();
    renderTypeGrid();
    renderItemList();
  }
  boot();
})();