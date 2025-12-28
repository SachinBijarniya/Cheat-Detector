# 🎓 Cheat Detector - Privacy-First Eye Movement Monitoring

A browser-based demonstration system that detects suspicious eye and gaze behavior during online exams using MediaPipe Face Mesh technology. This project emphasizes **privacy-first design** and **accessibility awareness**.

---

## ⚠️ Important Disclaimer

**This system detects behavioral anomalies only and must not be used as the sole method to accuse or punish students.**

This is an educational demonstration project. Real-world deployment requires:
- Ethical review and approval
- Consideration of accessibility needs
- Combination with human judgment
- Compliance with privacy regulations (GDPR, FERPA, etc.)
- Transparent communication with students

---

## 🎯 Project Overview

This demo creates a browser-based system that:
- Monitors eye and gaze direction in real-time
- Detects behavioral patterns that may indicate looking away from the exam
- Logs events in a privacy-safe manner (no video recording or biometric storage)
- Provides an accessibility mode for users with different needs
- Runs entirely in the browser with no external data transmission

---

## ✨ Core Features

### 1. **Webcam & Face Mesh Tracking**
- Safely requests webcam permission
- Uses MediaPipe Face Mesh (JavaScript CDN) for real-time facial landmark detection
- Draws face mesh overlay on canvas for visual feedback
- Tracks 468+ facial landmarks including iris position

### 2. **Eye & Gaze Direction Analysis**
- Tracks eye landmarks and iris position
- Calculates gaze direction: **CENTER**, **LEFT**, **RIGHT**, **DOWN**, or **FACE_NOT_DETECTED**
- Uses iris offset relative to eye center for accurate detection
- Real-time visual indicator shows current gaze direction

### 3. **Rule-Based Behavior Detection**
- **Time-based thresholds** (measured in seconds, not frames)
- Triggers behavior alert when:
  - Gaze is not CENTER beyond time limit (3 seconds in normal mode)
  - Face is not detected for extended period (5 seconds in normal mode)
- Separate counters for "Looking Away" and "Face Not Detected" events

### 4. **Privacy-Safe Behavior Logging**
- Logs only: timestamp, event type, and duration
- **NO video frames, images, or biometric data are stored**
- All processing happens locally in the browser
- No data transmission to external servers
- Export logs as CSV for review

### 5. **Accessibility Mode** ⭐ *Unique Feature*
- UI toggle to enable increased tolerance
- When enabled:
  - Looking away threshold: 3s → **8 seconds**
  - Face not detected threshold: 5s → **12 seconds**
  - Gaze sensitivity: reduced by 40%
- Designed for users with:
  - Mobility differences
  - Attention differences (ADHD)
  - Physical disabilities affecting head movement
  - Visual processing differences

### 6. **Privacy-First Design**
- 🔒 All processing runs locally in the browser
- 🔒 No video frames are recorded or transmitted
- 🔒 No biometric data storage
- 🔒 No external API calls (except MediaPipe CDN)
- 🔒 Clear privacy notice displayed in the UI
- 🔒 Optional Firebase integration is commented out

---

## 🔍 How Gaze Detection Works

### Technical Approach

1. **Face Detection**: MediaPipe Face Mesh detects 468+ facial landmarks
2. **Eye Center Calculation**: Averages positions of 6 landmarks around each eye
3. **Iris Position Detection**: Uses specialized iris landmarks (468-477)
4. **Offset Calculation**: Measures iris position relative to eye center
5. **Direction Classification**:
   - Horizontal offset < threshold & Vertical offset < threshold → **CENTER**
   - Horizontal offset < -threshold → **LEFT**
   - Horizontal offset > threshold → **RIGHT**
   - Vertical offset > threshold → **DOWN**

### Thresholds

| Mode | Looking Away Alert | Face Not Detected Alert | Gaze Sensitivity |
|------|-------------------|------------------------|------------------|
| **Normal** | 3 seconds | 5 seconds | 0.15 (standard) |
| **Accessibility** | 8 seconds | 12 seconds | 0.25 (reduced) |

---

## ♿ Accessibility Mode Details

The Accessibility Mode is designed to accommodate users with various needs:

### Why It's Important
- **Not all students can maintain constant eye contact with the screen**
- Some conditions (ADHD, autism, physical disabilities) affect gaze patterns
- Cultural differences in eye contact norms
- Individual learning styles and focus patterns vary

### What It Does
- **Increases time tolerance**: More time before triggering alerts
- **Reduces sensitivity**: Accommodates minor head movements
- **Ignores brief deviations**: Focuses on sustained behavioral patterns

### When to Enable
- Students with documented accommodations
- Users with mobility or attention differences
- Testing in diverse cultural contexts
- Any situation requiring inclusive design

---

## 🔐 Privacy & Ethics

### Privacy Guarantees
✅ **Local Processing Only**: All analysis happens in your browser  
✅ **No Recording**: Video frames are never saved or transmitted  
✅ **No Biometric Storage**: Only event timestamps and types are logged  
✅ **No External Servers**: No data leaves your device  
✅ **Transparent Operation**: Open-source code for full transparency  

### Ethical Considerations
⚖️ **Never use this as sole evidence** of cheating  
⚖️ **Consider accessibility needs** of all students  
⚖️ **Combine with human judgment** and context  
⚖️ **Respect cultural differences** in eye contact norms  
⚖️ **Provide clear communication** to students about monitoring  
⚖️ **Allow opt-outs** with alternative assessment methods  

---

## 🚀 How to Run

### Prerequisites
- Modern web browser (Chrome, Edge, Firefox recommended)
- Webcam access
- VS Code with **Live Server** extension (already installed ✅)

### Step-by-Step Instructions

1. **Open the project folder** in VS Code:
   ```bash
   cd /workspaces/copilot-cli/cheat-detector-demo
   code .
   ```

2. **Launch Live Server**:
   - Right-click on `index.html` in VS Code
   - Select **"Open with Live Server"**
   - Or press `Alt+L Alt+O` (keyboard shortcut)
   - Or click the "Go Live" button in the bottom status bar

3. **Allow webcam access** when prompted by the browser

4. **Click "Start Monitoring"** to begin

5. **Test the system**:
   - Look at different directions (left, right, down)
   - Move your face out of frame
   - Enable Accessibility Mode to see different thresholds
   - Watch the behavior log populate

6. **Stop monitoring** when done and review the logs

### Alternative: Open Directly in Browser
If Live Server is not available:
```bash
# Navigate to the folder
cd /workspaces/copilot-cli/cheat-detector-demo

# Open in default browser (Linux)
xdg-open index.html

# Or use Python's built-in server
python3 -m http.server 8000
# Then open http://localhost:8000
```

---

## 📁 Project Structure

```
cheat-detector-demo/
│
├── index.html          # Main HTML structure with UI layout
├── style.css           # Responsive styling and visual design
├── script.js           # Core logic: face tracking, gaze analysis, behavior detection
└── README.md           # This file
```

### File Descriptions

- **index.html**: Two-panel layout (webcam + analysis), privacy notices, accessibility toggle
- **style.css**: Professional gradient design, responsive grid, animations, accessibility styles
- **script.js**: MediaPipe integration, gaze detection algorithm, privacy-safe logging
- **README.md**: Complete documentation and ethical guidelines

---

## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript | Core interface and logic |
| **Face Tracking** | MediaPipe Face Mesh (CDN) | Real-time facial landmark detection |
| **Webcam API** | Browser MediaDevices API | Camera access |
| **Visualization** | HTML5 Canvas | Face mesh overlay drawing |
| **Logging** | In-memory JavaScript arrays | Privacy-safe event logging |
| **Export** | CSV Blob API | Log data export |

**No frameworks, no backend, no external dependencies** (except MediaPipe CDN)

---

## 📊 UI Layout

### Left Panel - Webcam Feed
- Live video stream with face mesh overlay
- Status indicator (green = active, yellow = warning, red = error)
- Start/Stop monitoring buttons
- Real-time face mesh visualization

### Right Panel - Analysis Dashboard
- **Gaze Direction Indicator**: Visual circle with moving pointer
- **Behavior Alerts Counter**: Total alerts + breakdown by type
- **Accessibility Toggle**: Switch between normal/accessibility modes
- **Privacy Notice**: Clear explanation of data handling
- **Behavior Log**: Scrollable list of events with timestamps

---

## 🔧 Configuration

Edit the `CONFIG` object in `script.js` to adjust thresholds:

```javascript
const CONFIG = {
    normal: {
        lookingAwayThreshold: 3,      // Seconds
        faceNotDetectedThreshold: 5,  // Seconds
        gazeThreshold: 0.15           // Sensitivity (0.0 - 1.0)
    },
    accessibility: {
        lookingAwayThreshold: 8,
        faceNotDetectedThreshold: 12,
        gazeThreshold: 0.25
    }
};
```

---

## 📝 Behavior Log Format

Privacy-safe CSV export includes only:
- **Timestamp**: When the event occurred
- **Type**: info, warning, or alert
- **Message**: Event description
- **Details**: Duration or additional context

**No images, video frames, or biometric data are included.**

---

## 🚫 Limitations

### Technical Limitations
- Requires good lighting conditions
- May not work well with glasses or facial accessories
- Accuracy varies by webcam quality
- Can be affected by head angle and distance

### Ethical Limitations
- Cannot detect all forms of cheating
- May produce false positives/negatives
- Not suitable as sole assessment method
- Requires consideration of individual circumstances

---

## 🌐 Optional: Firebase Integration

Firebase integration code is included but **commented out** to maintain privacy-first design.

To enable (use with caution):
1. Uncomment Firebase code in `script.js`
2. Add Firebase SDK via CDN in `index.html`
3. Configure Firebase project credentials
4. **Only store privacy-safe data** (timestamps, event types)
5. **Never store video frames or raw biometric data**

---

## 📚 Resources

- [MediaPipe Face Mesh Documentation](https://google.github.io/mediapipe/solutions/face_mesh.html)
- [Web Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/WCAG21/quickref/)
- [FERPA Privacy Guidelines](https://www2.ed.gov/policy/gen/guid/fpco/ferpa/index.html)
- [Ethical AI in Education](https://www.unesco.org/en/artificial-intelligence/recommendation-ethics)

---

## 🤝 Contributing

This is a demonstration project. If you fork or extend it:
- Maintain privacy-first principles
- Enhance accessibility features
- Add more sophisticated detection algorithms
- Improve documentation and ethical guidelines

---

## 📄 License

This project is for educational purposes. Use responsibly and ethically.

---

## 👨‍💻 VS Code Extensions Used

The following extensions enhance the development experience:

✅ **Live Server** (`ritwickdey.liveserver`) - Already installed  
✅ **ESLint** (`dbaeumer.vscode-eslint`) - Already installed  
✅ **HTML CSS Support** (`ecmel.vscode-html-css`) - Already installed  

**All required extensions are already available in your workspace!**

---

## 🎯 Key Takeaways

1. **Privacy First**: No data leaves the browser
2. **Accessibility Aware**: Accommodates diverse user needs
3. **Ethical Design**: Clear disclaimers and limitations
4. **Educational Tool**: Not for production use without proper review
5. **Open & Transparent**: Fully documented and explainable

---

## ❓ FAQ

**Q: Does this record video?**  
A: No. Video frames are processed in real-time and immediately discarded.

**Q: Is data sent to any server?**  
A: No. All processing happens locally in your browser.

**Q: Can this detect all cheating?**  
A: No. It only detects gaze patterns. Many factors affect gaze, and many cheating methods don't involve looking away.

**Q: Should I use this for real exams?**  
A: Only as part of a comprehensive assessment strategy, with ethical review, accessibility accommodations, and human oversight.

**Q: How accurate is it?**  
A: Accuracy depends on lighting, camera quality, and individual factors. Not reliable enough for high-stakes decisions.

---

## 🔮 Future Enhancements (Ideas)

- Multi-language support
- Customizable alert sounds
- Better analytics dashboard
- Integration with LMS platforms (with privacy safeguards)
- Advanced ML models for context-aware detection
- Mobile device support
- Real-time collaboration features for proctors

---

**Built with ❤️ for educational purposes**  
**Remember: Technology should empower, not punish. Use wisely.**
