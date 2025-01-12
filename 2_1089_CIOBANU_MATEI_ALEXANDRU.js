(function () {
  "use strict";

  const videoPlayer = {
    // Config
    metadataUrl: "./media/metadata/metadata.json", //URL pentru playlist
    configFile: "playerConfig", //Cheia din LocalStorage pentru salvarea setarilor
    pauseBetween: 3000, //Delay-ul dintre videoclipuri cand autoplay este on

    // videoPlayer State
    currentVideoId: null, // Id-ul videoclipului curent
    isPlaying: false, // Arata daca videoclipul este in derulare
    isMute: true, // Toggle de mute
    autoplay: true, // Optiunea autoplay
    ended: true,

    // Canvas
    canvas: null, //Canvas-ul principal de randare a videoclipului
    ctx: null, //Context al canvasului principal
    video: null, // Elementul video (ascuns)
    playlist: [], // Array de videoclipuri
    volume: 1.0, // Volumul curent

    // Preview cadru
    previewCanvas: null, // Canvas pentru functionalitatea de preview
    previewCtx: null, // Context pentru canvasul de preview
    isHoveringProgressBar: false,
    hoverTime: 0,
  };

  // ------------------------------------------------
  // 1. initializare + localStorage
  // ------------------------------------------------
  videoPlayer.initialise = function () {
    try {
      const configJSON = localStorage.getItem(videoPlayer.configFile);
      if (configJSON) {
        const config = JSON.parse(configJSON);
        for (let k in config) {
          videoPlayer[k] = config[k];
        }
      }
    } catch (e) {
      console.warn("Nu s-au putut încărca setările", e);
    }
  };

  videoPlayer.saveState = function () {
    try {
      const { isMute, autoplay, volume, currentVideoId } = videoPlayer;
      localStorage.setItem(
        videoPlayer.configFile,
        JSON.stringify({
          autoplay,
          volume,
          currentVideoId,
        })
      );
    } catch (e) {
      console.warn("Eroare la salvarea stării:", e);
    }
  };

  // ------------------------------------------------
  // 2. Management-ul playlist-ului
  // ------------------------------------------------

  //Incarcarea playlist-ului din metadata
  videoPlayer.getPlaylist = async function () {
    videoPlayer.playlist = [];
    const playlistContainer = document.getElementById("playlist");
    try {
      const resp = await fetch(videoPlayer.metadataUrl);
      const data = await resp.json();

      //Introducem videoclipurile in array-ul intern
      data.videos.forEach((video, i) => {
        videoPlayer.playlist.push(video);
        if (
          (videoPlayer.currentVideoId === null && i === 0) ||
          videoPlayer.currentVideoId === video.id
        ) {
          if (!videoPlayer.currentVideoId)
            videoPlayer.currentVideoId = video.id;
          videoPlayer.loadVideo(video);
        }
      });

      videoPlayer.renderPlaylist();
    } catch (e) {
      videoPlayer.showError(e);
    }
  };

  //Randarea pe ecran a elementelor din playlist
  videoPlayer.renderPlaylist = function () {
    const playlist = document.getElementById("playlist");

    playlist.innerHTML = "";

    videoPlayer.playlist.forEach((video, idx) => {
      let itemHTML = videoPlayer.addPlaylistHTML(video, idx);
      playlist.insertAdjacentHTML("beforeend", itemHTML);
    });
  };

  //Stergere element din playlist
  videoPlayer.deleteVideo = function (index) {
    videoPlayer.playlist.splice(index, 1);
    videoPlayer.renderPlaylist();
  };

  //Mutare element playlist mai sus
  videoPlayer.moveVideoUp = function (index) {
    if (index > 0) {
      [videoPlayer.playlist[index], videoPlayer.playlist[index - 1]] = [
        videoPlayer.playlist[index - 1],
        videoPlayer.playlist[index],
      ];
      videoPlayer.renderPlaylist();
    }
  };

  //Mutare element playlist mai jos
  videoPlayer.moveVideoDown = function (index) {
    if (index < videoPlayer.playlist.length - 1) {
      [videoPlayer.playlist[index], videoPlayer.playlist[index + 1]] = [
        videoPlayer.playlist[index + 1],
        videoPlayer.playlist[index],
      ];
      videoPlayer.renderPlaylist();
    }
  };

  //Adaugarea html-ului unui item din playlist
  videoPlayer.addPlaylistHTML = function (video, index) {
    const isCurrent = video.id === videoPlayer.currentVideoId;
    return `
    <div class="playlist-item ${isCurrent ? "highlight" : ""}" data-id="${
      video.id
    }" data-index="${index}" style="border:1px solid #ccc; margin:5px; padding:5px; cursor:pointer;">
      <div class="info" style="margin-bottom:5px;">
        <b>${video.title}</b><br/>
        <small>${video.subtitle || ""}</small>
      </div>
      <div class="controls">
        <button class="btn-move-up">↑</button>
        <button class="btn-move-down">↓</button>
        <button class="btn-delete">X</button>
      </div>
    </div>
  `;
  };

  // ------------------------------------------------
  // 3. Incarcare video pe canvas
  // ------------------------------------------------
  videoPlayer.loadVideo = function (currentVideo) {
    // Schimba titlu
    const titleElem = document.getElementById("current-video-title");
    if (titleElem) {
      titleElem.textContent = currentVideo.title || "Untitled";
    }

    // Oprim video precedent
    if (videoPlayer.video) {
      videoPlayer.video.pause();
      videoPlayer.video.removeAttribute("src");
      videoPlayer.video = null;
      videoPlayer.isPlaying = false;
      videoPlayer.ended = false;
    }

    //Cream elementul video care va avea proprietatea display: none;
    videoPlayer.video = document.createElement("video");
    videoPlayer.video.src = currentVideo.src;
    videoPlayer.video.volume = videoPlayer.volume;
    videoPlayer.video.muted = videoPlayer.isMute;

    if (videoPlayer.autoplay || !videoPlayer.autoplay) {
      videoPlayer.video.play();
      videoPlayer.isPlaying = true;
    }

    videoPlayer.currentVideoId = currentVideo.id;
    videoPlayer.renderPlaylist();

    videoPlayer.video.addEventListener("play", () => {
      videoPlayer.isPlaying = true;
      videoPlayer.ended = false;
      requestAnimationFrame(updateFrame);
    });

    videoPlayer.video.addEventListener("ended", () => {
      videoPlayer.isPlaying = false;
      videoPlayer.ended = true;
      if (videoPlayer.autoplay) {
        setTimeout(videoPlayer.playNext, videoPlayer.pauseBetween);
      }
    });

    // Functie principala de redesenare
    function updateFrame() {
      if (!videoPlayer.video.paused && !videoPlayer.video.ended) {
        // 1) Desenam frame video
        videoPlayer.ctx.clearRect(
          0,
          0,
          videoPlayer.canvas.width,
          videoPlayer.canvas.height
        );
        videoPlayer.ctx.drawImage(
          videoPlayer.video,
          0,
          0,
          videoPlayer.canvas.width,
          videoPlayer.canvas.height
        );

        videoPlayer.applyEffect(videoPlayer.ctx, videoPlayer.video);

        // 2) Desenam controalele
        drawControls();

        requestAnimationFrame(updateFrame);
      }
    }

    // Activeaza redarea imediat daca e autoplay true
    // altfel, asteapta user-ul sa dea click pe buton
  };

  // ------------------------------------------------
  // 4. Desenare controale pe canvas
  // ------------------------------------------------
  function drawControls() {
    const w = videoPlayer.canvas.width;
    const h = videoPlayer.canvas.height;

    // fundal semitransparent
    videoPlayer.ctx.fillStyle = "rgba(0,0,0,0.5)";
    videoPlayer.ctx.fillRect(0, h - 50, w, 50);

    videoPlayer.ctx.fillStyle = "#fff";
    videoPlayer.ctx.font = "20px Arial";

    //Buton mute

    const speakerX = w - 60;
    const speakerY = h - 45;
    const speakerSize = 24;

    const speakerImage = videoPlayer.isMute
      ? videoPlayer.speakerOffImage
      : videoPlayer.speakerOnImage;
    videoPlayer.ctx.drawImage(
      speakerImage,
      speakerX,
      speakerY,
      speakerSize,
      speakerSize
    );

    // Buton Previous
    // zona x: 20..40, y: h-40..h-10
    drawCircle(35, h - 25, 15, "white");
    drawLeftArrow(25, h - 36, 32, 23, "black");

    // Buton Play/Pause
    // zona x: 70..90
    if (videoPlayer.isPlaying) {
      // Desenarea barelor "||"
      drawBar(71, h - 36, 36, 19); // un bar
      drawBar(81, h - 36, 36, 19); // al doilea bar
    } else {
      drawPlayButton(55, h - 36, 32, 23, "red");
    }

    // Buton Next
    // (ex) x: 110..130
    drawCircle(125, h - 25, 15, "white");
    drawPlayButton(103, h - 36, 32, 23, "black");

    // Bara progres
    let barX = 160;
    let barWidth = w - 400;
    let barY = h - 35;
    let barHeight = 10;
    // fundal
    videoPlayer.ctx.fillStyle = "#666";
    videoPlayer.ctx.fillRect(barX, barY, barWidth, barHeight);
    // progres
    if (videoPlayer.video && videoPlayer.video.duration) {
      let ratio = videoPlayer.video.currentTime / videoPlayer.video.duration;
      videoPlayer.ctx.fillStyle = "red";
      videoPlayer.ctx.fillRect(barX, barY, barWidth * ratio, barHeight);
    }

    // Volum
    let volX = w - 180;
    let volWidth = 100;
    let volY = h - 35;
    let volHeight = 10;
    // background volum
    videoPlayer.ctx.fillStyle = "#666";
    videoPlayer.ctx.fillRect(volX, volY, volWidth, volHeight);
    // volum actual
    videoPlayer.ctx.fillStyle = "#0f0";
    let currentVolW = videoPlayer.volume * volWidth;
    videoPlayer.ctx.fillRect(volX, volY, currentVolW, volHeight);
  }

  // Functii helper de desenare
  function drawCircle(cx, cy, r, color) {
    videoPlayer.ctx.beginPath();
    videoPlayer.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    videoPlayer.ctx.fillStyle = color;
    videoPlayer.ctx.fill();
    videoPlayer.ctx.closePath();
  }
  function drawLeftArrow(x, y, w, h, color) {
    videoPlayer.ctx.beginPath();
    videoPlayer.ctx.fillStyle = color;

    videoPlayer.ctx.moveTo(x, y + h / 2);
    videoPlayer.ctx.lineTo(x + w / 6, y + h / 3);
    videoPlayer.ctx.lineTo(x + (2 * w) / 6, y + h / 6);
    videoPlayer.ctx.lineTo(x + (3 * w) / 6, y);

    videoPlayer.ctx.lineTo(x + (3 * w) / 6, y + h);
    videoPlayer.ctx.lineTo(x, y + h / 2);
    videoPlayer.ctx.fill();
    videoPlayer.ctx.closePath();
  }
  function drawPlayButton(x, y, w, h, color) {
    videoPlayer.ctx.beginPath();
    videoPlayer.ctx.fillStyle = color;
    // triunghi
    videoPlayer.ctx.moveTo(x + w, y + h / 2);
    videoPlayer.ctx.lineTo(x + (5 * w) / 6, y + h / 3);
    videoPlayer.ctx.lineTo(x + (4 * w) / 6, y + h / 6);
    videoPlayer.ctx.lineTo(x + (3 * w) / 6, y);

    videoPlayer.ctx.lineTo(x + (3 * w) / 6, y + h);
    videoPlayer.ctx.lineTo(x + w, y + h / 2);
    videoPlayer.ctx.fill();
    videoPlayer.ctx.closePath();
  }
  function drawBar(x, y, w, h) {
    videoPlayer.ctx.beginPath();
    videoPlayer.ctx.fillStyle = "grey";
    videoPlayer.ctx.rect(x, y, w / 6, h);
    videoPlayer.ctx.fill();
    videoPlayer.ctx.closePath();
  }

  // ------------------------------------------------
  // 5. Click pe canvas -> ce control a fost apasat?
  // ------------------------------------------------
  videoPlayer.onCanvasClick = function (e) {
    const rect = videoPlayer.canvas.getBoundingClientRect();

    // Dimensiune "afisata" pe ecran a canvasului
    const displayW = rect.width;
    const displayH = rect.height;

    // Dimensiune interna (definita prin canvas.width / canvas.height)
    const internalW = videoPlayer.canvas.width; // 960
    const internalH = videoPlayer.canvas.height; // 540

    // Factor de scalare
    const scaleX = internalW / displayW;
    const scaleY = internalH / displayH;

    // Coordonate mouse în sistemul intern (0..internalW, 0..internalH)
    let mouseX = (e.clientX - rect.left) * scaleX;
    let mouseY = (e.clientY - rect.top) * scaleY;

    // Atribui w=internalW, h=internalH pentru restul calculelor
    const w = internalW;
    const h = internalH;

    // Prev: ex. cerc center (35, h-25), r=15 => bounding box x: 20..50, y: h-40..h-10
    if (mouseX >= 20 && mouseX <= 50 && mouseY >= h - 40 && mouseY <= h - 10) {
      videoPlayer.playPrev();
      return;
    }
    // Next: x: 110..140, y: h-40..h-10
    if (
      mouseX >= 110 &&
      mouseX <= 140 &&
      mouseY >= h - 40 &&
      mouseY <= h - 10
    ) {
      videoPlayer.playNext();
      return;
    }
    // Play/Pause: x:70..90, y: h-40..h-10
    if (mouseX >= 70 && mouseX <= 90 && mouseY >= h - 40 && mouseY <= h - 10) {
      togglePlayPause();
      return;
    }
    // Bara de progres: x:160..160+barWidth, y: h-40..h-25
    let barX = 160;
    let barWidth = w - 400;
    let barY = h - 40;
    let barHeight = 15;
    if (
      mouseX >= barX &&
      mouseX <= barX + barWidth &&
      mouseY >= barY &&
      mouseY <= barY + barHeight
    ) {
      if (videoPlayer.video && videoPlayer.video.duration) {
        let ratio = (mouseX - barX) / barWidth;
        videoPlayer.video.currentTime = ratio * videoPlayer.video.duration;

        videoPlayer.video.addEventListener("seeked", function handleSeek() {
          drawStaticImage();
          videoPlayer.video.removeEventListener("seeked", handleSeek);
        });
      }
      return;
    }
    // Volum: x: w-180..w-80, y: h-40..h-25
    let volX = w - 180;
    let volWidth = 100;
    let volY = h - 40;
    let volHeight = 15;
    if (
      mouseX >= volX &&
      mouseX <= volX + volWidth &&
      mouseY >= volY &&
      mouseY <= volY + volHeight
    ) {
      let ratio = (mouseX - volX) / volWidth;
      if (ratio < 0) ratio = 0;
      if (ratio > 1) ratio = 1;
      videoPlayer.volume = ratio;
      if (videoPlayer.video) {
        videoPlayer.video.volume = videoPlayer.volume;
        drawStaticImage();
      }
      return;
    }

    //Click buton difuzor

    const speakerX = w - 60;
    const speakerY = h - 45;
    const speakerSize = 24;

    if (
      mouseX >= speakerX &&
      mouseX <= speakerX + speakerSize &&
      mouseY >= speakerY &&
      mouseY <= speakerY + speakerSize
    ) {
      toggleMute();
      return;
    }
  };

  function drawStaticImage() {
    videoPlayer.ctx.clearRect(
      0,
      0,
      videoPlayer.canvas.width,
      videoPlayer.canvas.height
    );
    videoPlayer.ctx.drawImage(
      videoPlayer.video,
      0,
      0,
      videoPlayer.canvas.width,
      videoPlayer.canvas.height
    );
    drawControls();
  }

  function togglePlayPause() {
    if (!videoPlayer.video) return;
    if (videoPlayer.isPlaying) {
      videoPlayer.video.pause();
      videoPlayer.isPlaying = false;
      drawStaticImage();
    } else {
      videoPlayer.video.play();
      videoPlayer.isPlaying = true;
    }
  }

  function toggleMute() {
    videoPlayer.isMute = !videoPlayer.isMute;
    if (videoPlayer.video) {
      videoPlayer.video.muted = videoPlayer.isMute;
    }
    drawStaticImage();
  }

  // Functie play Next/Prev
  videoPlayer.playNext = function () {
    const index = videoPlayer.playlist.findIndex(
      (video) => video.id == videoPlayer.currentVideoId
    );
    if (index === -1) return;
    let nextIndex = index + 1;
    if (nextIndex >= videoPlayer.playlist.length) nextIndex = 0;
    videoPlayer.currentVideoId = videoPlayer.playlist[nextIndex].id;
    videoPlayer.loadVideo(videoPlayer.playlist[nextIndex]);
  };
  videoPlayer.playPrev = function () {
    const index = videoPlayer.playlist.findIndex(
      (video) => video.id == videoPlayer.currentVideoId
    );
    if (index === -1) return;
    let prevIndex = index - 1;
    if (prevIndex < 0) prevIndex = videoPlayer.playlist.length - 1;
    videoPlayer.currentVideoId = videoPlayer.playlist[prevIndex].id;
    videoPlayer.loadVideo(videoPlayer.playlist[prevIndex]);
  };

  // ------------------------------------------------
  // 6. Drag & drop
  // ------------------------------------------------
  videoPlayer.initDragAndDrop = function () {
    const dragzone = document.getElementById("dragzone");

    dragzone.addEventListener("dragover", (ev) => ev.preventDefault());
    dragzone.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const file = ev.dataTransfer.files[0];
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        videoPlayer.showError("Fișierul nu e video");
        return;
      }
      const newId = "file-" + Date.now();
      const fileURL = URL.createObjectURL(file);
      const newVideo = {
        id: newId,
        title: file.name,
        subtitle: "Drag & Drop",
        src: fileURL,
      };
      videoPlayer.playlist.push(newVideo);

      // actualizăm playlist-ul în DOM
      const playlist = document.getElementById("playlist");
      if (playlist) {
        const itemHTML = videoPlayer.addPlaylistHTML(
          newVideo,
          videoPlayer.playlist.length - 1
        );
        playlist.insertAdjacentHTML("beforeend", itemHTML);
        const newItem = playlist.querySelector(`[data-id='${newId}']`);
        newItem.addEventListener("click", () => {
          videoPlayer.currentVideoId = newId;
          if (videoPlayer.video) videoPlayer.video.pause();
          videoPlayer.loadVideo(newVideo);
        });
      }
      // redăm direct
      videoPlayer.currentVideoId = newId;
      videoPlayer.loadVideo(newVideo);
    });
  };

  // ------------------------------------------------
  // 8. showError
  // ------------------------------------------------
  videoPlayer.showError = function (msg) {
    console.error(msg);
    const div = document.createElement("div");
    div.className = "alert alert-danger";
    div.innerHTML = `<strong>Eroare:</strong> ${msg}`;
    document.body.appendChild(div);
    setTimeout(() => {
      if (div.parentElement) {
        div.parentElement.removeChild(div);
      }
    }, 2000);
  };

  // ------------------------------------------------
  // 9. Initializare evenimente
  // ------------------------------------------------
  function initUIListeners() {
    const autoplay = document.getElementById("autoplay");
    if (autoplay) {
      autoplay.checked = videoPlayer.autoplay;
      autoplay.addEventListener("change", () => {
        videoPlayer.autoplay = autoplay.checked;

        if (videoPlayer.autoplay && videoPlayer.ended) {
          videoPlayer.ended = false;
          videoPlayer.playNext();
        }
      });
    }

    // CLICK PE CANVAS: detectare butoane
    videoPlayer.canvas.addEventListener("click", videoPlayer.onCanvasClick);

    const effectSelect = document.getElementById("video-effect");

    effectSelect.addEventListener("change", () => {
      if (videoPlayer.video && !videoPlayer.video.paused) {
        videoPlayer.applyEffect(videoPlayer.ctx, videoPlayer.video);
      }
    });

    videoPlayer.canvas.addEventListener("mousemove", function (e) {
      const rect = videoPlayer.canvas.getBoundingClientRect();
      const scaleX = videoPlayer.canvas.width / rect.width;
      const scaleY = videoPlayer.canvas.height / rect.height;

      let mouseX = (e.clientX - rect.left) * scaleX;
      let mouseY = (e.clientY - rect.top) * scaleY;

      const w = videoPlayer.canvas.width;
      const h = videoPlayer.canvas.height;

      let barX = 160;
      let barWidth = w - 400;
      let barY = h - 40;
      let barHeight = 15;

      if (
        mouseX >= barX &&
        mouseX <= barX + barWidth &&
        mouseY >= barY &&
        mouseY <= barY + barHeight
      ) {
        videoPlayer.isHoveringProgressBar = true;
        let ratio = (mouseX - barX) / barWidth;
        videoPlayer.hoverTime = ratio * videoPlayer.video.duration;

        // Poziționăm canvas-ul de preview
        videoPlayer.previewCanvas.style.left = `${e.clientX + 10}px`;
        videoPlayer.previewCanvas.style.top = `${e.clientY + 20}px`;
        videoPlayer.previewCanvas.style.display = "block";

        videoPlayer.previewVideo.src = videoPlayer.video.src;
        videoPlayer.previewVideo.currentTime = videoPlayer.hoverTime;
      } else {
        videoPlayer.isHoveringProgressBar = false;
        videoPlayer.previewCanvas.style.display = "none";
      }
    });

    videoPlayer.canvas.addEventListener("mouseleave", () => {
      videoPlayer.isHoveringProgressBar = false;
      videoPlayer.previewCanvas.style.display = "none";
    });
  }

  function initPreviewCanvas() {
    //CREEARE VIDEO SEPARAT PENTRU PREVIEW
    videoPlayer.previewVideo = document.createElement("video");
    videoPlayer.previewVideo.muted = true;
    videoPlayer.previewVideo.preload = "metadata";

    //CREARE CANVAS PENTRU PREVIEW
    videoPlayer.previewCanvas = document.createElement("canvas");
    videoPlayer.previewCanvas.width = 160;
    videoPlayer.previewCanvas.height = 90;
    videoPlayer.previewCanvas.style.position = "absolute";
    videoPlayer.previewCanvas.style.display = "none";
    videoPlayer.previewCanvas.style.pointerEvents = "none";
    videoPlayer.previewCanvas.style.border = "1px solid #ccc";
    videoPlayer.previewCanvas.style.backgroundColor = "black";
    document.body.appendChild(videoPlayer.previewCanvas);

    videoPlayer.previewCtx = videoPlayer.previewCanvas.getContext("2d");

    videoPlayer.previewVideo.addEventListener("loadeddata", () => {
      videoPlayer.previewCtx.clearRect(
        0,
        0,
        videoPlayer.previewCanvas.width,
        videoPlayer.previewCanvas.height
      );
      videoPlayer.previewCtx.drawImage(
        videoPlayer.previewVideo,
        0,
        0,
        videoPlayer.previewVideo.videoWidth,
        videoPlayer.previewVideo.videoHeight,
        0,
        0,
        videoPlayer.previewCanvas.width,
        videoPlayer.previewCanvas.height
      );
    });
  }

  function initPlaylistEvents() {
    const playlist = document.getElementById("playlist");

    playlist.addEventListener("click", (e) => {
      let target = e.target;
      let item = target.closest(".playlist-item");
      if (!item) return;

      let index = parseInt(item.getAttribute("data-index"));

      if (target.classList.contains("btn-delete")) {
        videoPlayer.deleteVideo(index);
      } else if (target.classList.contains("btn-move-up")) {
        videoPlayer.moveVideoUp(index);
      } else if (target.classList.contains("btn-move-down")) {
        videoPlayer.moveVideoDown(index);
      } else {
        let video = videoPlayer.playlist[index];
        if (video) {
          videoPlayer.currentVideoId = video.id;
          videoPlayer.isPlaying = false;
          videoPlayer.ended = false;
          if (videoPlayer.video) videoPlayer.video.pause();
          videoPlayer.loadVideo(video);
        }
      }
    });
  }

  videoPlayer.videoEffects = {
    none: (imageData) => imageData,
    invert: (imageData) => {
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      return imageData;
    },
    glitch: (imageData) => {
      const { data, width, height } = imageData;
      const blockHeight = Math.floor(height / 20);
      const maxShift = Math.floor(width / 10);

      for (let y = 0; y < height; y += blockHeight) {
        const shift = Math.floor((Math.random() * 2 - 1) * maxShift);
        for (let x = 0; x < width; x++) {
          const srcX = Math.min(Math.max(x + shift, 0), width - 1);
          const destIndex = (y * width + x) * 4;
          const srcIndex = (y * width + srcX) * 4;

          data[destIndex] = data[srcIndex];
          data[destIndex + 1] = data[srcIndex + 1];
          data[destIndex + 2] = data[srcIndex + 2];
        }
      }
      return imageData;
    },
    colorBoost: (imageData) => {
      const data = imageData.data;
      const boostFactor = 1.4;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * boostFactor);
        data[i + 1] = Math.min(255, data[i + 1] * boostFactor);
        data[i + 2] = Math.min(255, data[i + 2] * boostFactor);
      }
      return imageData;
    },
    blur: (imageData) => {
      const { data, width, height } = imageData;
      const kernel = [
        1 / 9,
        1 / 9,
        1 / 9,
        1 / 9,
        1 / 9,
        1 / 9,
        1 / 9,
        1 / 9,
        1 / 9,
      ];
      const tempData = new Uint8ClampedArray(data);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let r = 0,
            g = 0,
            b = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const px = (y + ky) * width + (x + kx);
              const weight = kernel[(ky + 1) * 3 + (kx + 1)];
              r += tempData[px * 4] * weight;
              g += tempData[px * 4 + 1] * weight;
              b += tempData[px * 4 + 2] * weight;
            }
          }

          const index = (y * width + x) * 4;
          data[index] = r;
          data[index + 1] = g;
          data[index + 2] = b;
        }
      }

      return imageData;
    },
  };

  videoPlayer.applyEffect = (ctx, video) => {
    ctx.drawImage(
      video,
      0,
      0,
      videoPlayer.canvas.width,
      videoPlayer.canvas.height
    );
    let imageData = ctx.getImageData(
      0,
      0,
      videoPlayer.canvas.width,
      videoPlayer.canvas.height
    );

    // Aplicam efectul selectat
    const selectedEffect = document.getElementById("video-effect").value;
    if (videoPlayer.videoEffects[selectedEffect]) {
      imageData = videoPlayer.videoEffects[selectedEffect](imageData);
    }

    // Redesenare cu efectul aplicat
    ctx.putImageData(imageData, 0, 0);
  };

  // ------------------------------------------------
  // 10. Event main
  // ------------------------------------------------
  window.addEventListener("load", () => {
    videoPlayer.speakerOnImage = new Image();
    videoPlayer.speakerOnImage.src = "./media/volume_on.png";
    videoPlayer.speakerOffImage = new Image();
    videoPlayer.speakerOffImage.src = "./media/volume_off.png";
    videoPlayer.canvas = document.getElementById("videoCanvas");
    if (videoPlayer.canvas) {
      videoPlayer.ctx = videoPlayer.canvas.getContext("2d");
    }
    initPreviewCanvas();
    videoPlayer.initialise();
    videoPlayer.getPlaylist();
    videoPlayer.initDragAndDrop();
    initUIListeners();
    initPlaylistEvents();
  });

  window.addEventListener("beforeunload", () => {
    videoPlayer.saveState();
  });
})();
