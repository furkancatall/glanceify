// Glanceify — Content Script
// Handles text selection detection, overlay panel UI, and RSVP reader logic

(function () {
    "use strict";

    // Prevent double injection
    if (window.__glanceifyLoaded) return;
    window.__glanceifyLoaded = true;

    // ─── State ───
    let words = [];
    let currentIndex = 0;
    let wpm = 300;
    let isPlaying = false;
    let intervalId = null;
    let panel = null;
    let floatingBtn = null;

    // ─── Floating "Read" Button ───
    function showFloatingButton(x, y, selectedText) {
        removeFloatingButton();

        floatingBtn = document.createElement("div");
        floatingBtn.id = "glanceify-float-btn";
        floatingBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Read`;

        // Position near cursor
        const btnX = Math.min(x + 10, window.innerWidth - 120);
        const btnY = Math.max(y - 45, 10);
        floatingBtn.style.left = btnX + "px";
        floatingBtn.style.top = btnY + "px";

        floatingBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeFloatingButton();
            openPanel(selectedText);
        });

        document.body.appendChild(floatingBtn);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (floatingBtn && floatingBtn.parentNode) {
                floatingBtn.classList.add("glanceify-fade-out");
                setTimeout(removeFloatingButton, 300);
            }
        }, 4000);
    }

    function removeFloatingButton() {
        if (floatingBtn && floatingBtn.parentNode) {
            floatingBtn.parentNode.removeChild(floatingBtn);
        }
        floatingBtn = null;
    }

    // ─── Listen for text selection ───
    document.addEventListener("mouseup", (e) => {
        // Ignore clicks inside our own UI
        if (e.target.closest && (e.target.closest("#glanceify-panel") || e.target.closest("#glanceify-float-btn"))) {
            return;
        }

        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : "";

            if (text.length > 1) {
                showFloatingButton(e.clientX, e.clientY, text);
            } else {
                removeFloatingButton();
            }
        }, 10);
    });

    // Hide button on scroll
    document.addEventListener("scroll", removeFloatingButton, { passive: true });

    // ─── Listen for context menu message ───
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "startReading" && message.text) {
            removeFloatingButton();
            openPanel(message.text);
        }
    });

    // ─── Open Overlay Panel ───
    function openPanel(text) {
        // Close existing panel if any
        closePanel();

        words = text.split(/\s+/).filter((w) => w.length > 0);
        if (words.length === 0) return;

        currentIndex = 0;
        isPlaying = false;

        // Build DOM
        panel = document.createElement("div");
        panel.id = "glanceify-panel";
        panel.innerHTML = `
      <div id="glanceify-backdrop"></div>
      <div id="glanceify-card">
        <div id="glanceify-header">
          <div id="glanceify-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Glanceify</span>
          </div>
          <button id="glanceify-close" title="Close (Esc)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div id="glanceify-display">
          <div id="glanceify-word-area">
            <span id="glanceify-word-before"></span><span id="glanceify-word-focus"></span><span id="glanceify-word-after"></span>
          </div>
          <div id="glanceify-focus-line"></div>
        </div>

        <div id="glanceify-progress-track">
          <div id="glanceify-progress-bar"></div>
        </div>

        <div id="glanceify-controls">
          <button id="glanceify-restart" title="Restart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
          <button id="glanceify-back" title="Previous word">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <button id="glanceify-play" title="Play / Pause (Space)">
            <svg id="glanceify-icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
            <svg id="glanceify-icon-pause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:none">
              <rect x="5" y="3" width="4" height="18"/>
              <rect x="15" y="3" width="4" height="18"/>
            </svg>
          </button>
          <button id="glanceify-forward" title="Next word">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        <div id="glanceify-speed-row">
          <label id="glanceify-speed-label">
            <span id="glanceify-wpm-value">${wpm}</span> WPM
          </label>
          <input type="range" id="glanceify-speed" min="100" max="900" step="25" value="${wpm}">
        </div>

        <div id="glanceify-counter">
          <span id="glanceify-current-num">1</span> / <span id="glanceify-total-num">${words.length}</span> words
        </div>
      </div>
    `;

        document.body.appendChild(panel);

        // Force reflow then animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                panel.classList.add("glanceify-visible");
            });
        });

        // Show first word
        displayWord(0);

        // ─── Bind Events ───
        const backdrop = panel.querySelector("#glanceify-backdrop");
        const closeBtn = panel.querySelector("#glanceify-close");
        const playBtn = panel.querySelector("#glanceify-play");
        const backBtn = panel.querySelector("#glanceify-back");
        const forwardBtn = panel.querySelector("#glanceify-forward");
        const restartBtn = panel.querySelector("#glanceify-restart");
        const speedSlider = panel.querySelector("#glanceify-speed");

        backdrop.addEventListener("click", closePanel);
        closeBtn.addEventListener("click", closePanel);

        playBtn.addEventListener("click", togglePlay);
        backBtn.addEventListener("click", () => stepWord(-1));
        forwardBtn.addEventListener("click", () => stepWord(1));
        restartBtn.addEventListener("click", restart);

        speedSlider.addEventListener("input", (e) => {
            wpm = parseInt(e.target.value, 10);
            panel.querySelector("#glanceify-wpm-value").textContent = wpm;
            if (isPlaying) {
                stopInterval();
                startInterval();
            }
        });

        // Keyboard shortcuts
        document.addEventListener("keydown", handleKeydown);
    }

    // ─── Display Word ───
    function displayWord(index) {
        if (!panel || index < 0 || index >= words.length) return;

        currentIndex = index;
        const word = words[index];

        // ORP: optimal recognition point (~35% of word length)
        const orpIndex = Math.max(0, Math.floor(word.length * 0.35));
        const before = word.substring(0, orpIndex);
        const focus = word.charAt(orpIndex);
        const after = word.substring(orpIndex + 1);

        panel.querySelector("#glanceify-word-before").textContent = before;
        panel.querySelector("#glanceify-word-focus").textContent = focus;
        panel.querySelector("#glanceify-word-after").textContent = after;

        // Update progress
        const progress = words.length > 1 ? (index / (words.length - 1)) * 100 : 100;
        panel.querySelector("#glanceify-progress-bar").style.width = progress + "%";
        panel.querySelector("#glanceify-current-num").textContent = index + 1;
    }

    // ─── Playback Controls ───
    function togglePlay() {
        if (isPlaying) {
            pause();
        } else {
            // If at the end, restart
            if (currentIndex >= words.length - 1) {
                currentIndex = 0;
                displayWord(0);
            }
            play();
        }
    }

    function play() {
        isPlaying = true;
        updatePlayIcon();
        startInterval();
    }

    function pause() {
        isPlaying = false;
        updatePlayIcon();
        stopInterval();
    }

    function startInterval() {
        const ms = 60000 / wpm;
        intervalId = setInterval(() => {
            if (currentIndex < words.length - 1) {
                currentIndex++;
                displayWord(currentIndex);
            } else {
                // Reached end
                pause();
                showDone();
            }
        }, ms);
    }

    function stopInterval() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    function stepWord(delta) {
        pause();
        const newIndex = Math.max(0, Math.min(words.length - 1, currentIndex + delta));
        displayWord(newIndex);
        clearDone();
    }

    function restart() {
        pause();
        currentIndex = 0;
        displayWord(0);
        clearDone();
    }

    function showDone() {
        if (!panel) return;
        panel.querySelector("#glanceify-word-before").textContent = "";
        panel.querySelector("#glanceify-word-focus").textContent = "✓";
        panel.querySelector("#glanceify-word-after").textContent = " Done";
    }

    function clearDone() {
        // Just display current word, which overwrites any "Done" state
    }

    function updatePlayIcon() {
        if (!panel) return;
        const playIcon = panel.querySelector("#glanceify-icon-play");
        const pauseIcon = panel.querySelector("#glanceify-icon-pause");
        if (isPlaying) {
            playIcon.style.display = "none";
            pauseIcon.style.display = "block";
        } else {
            playIcon.style.display = "block";
            pauseIcon.style.display = "none";
        }
    }

    // ─── Keyboard Shortcuts ───
    function handleKeydown(e) {
        if (!panel) return;

        // Don't interfere with input fields
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
            return;
        }

        switch (e.key) {
            case " ":
                e.preventDefault();
                togglePlay();
                break;
            case "Escape":
                closePanel();
                break;
            case "ArrowLeft":
                e.preventDefault();
                stepWord(-1);
                break;
            case "ArrowRight":
                e.preventDefault();
                stepWord(1);
                break;
            case "ArrowUp":
                e.preventDefault();
                adjustSpeed(25);
                break;
            case "ArrowDown":
                e.preventDefault();
                adjustSpeed(-25);
                break;
        }
    }

    function adjustSpeed(delta) {
        if (!panel) return;
        const slider = panel.querySelector("#glanceify-speed");
        wpm = Math.max(100, Math.min(900, wpm + delta));
        slider.value = wpm;
        panel.querySelector("#glanceify-wpm-value").textContent = wpm;
        if (isPlaying) {
            stopInterval();
            startInterval();
        }
    }

    // ─── Close Panel ───
    function closePanel() {
        stopInterval();
        isPlaying = false;
        document.removeEventListener("keydown", handleKeydown);

        if (panel) {
            panel.classList.remove("glanceify-visible");
            panel.classList.add("glanceify-closing");
            setTimeout(() => {
                if (panel && panel.parentNode) {
                    panel.parentNode.removeChild(panel);
                }
                panel = null;
            }, 300);
        }
    }
})();
