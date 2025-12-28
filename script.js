/**
 * Cheat Detector - Privacy-First Eye Movement Monitoring
 * 
 * This system detects behavioral anomalies only.
 * No video frames are recorded or transmitted.
 * All processing happens locally in the browser.
 */

// ============================================
// GLOBAL STATE
// ============================================

// Session States: IDLE, CALIBRATING, MONITORING, PAUSED, FACE_NOT_DETECTED
let sessionState = 'IDLE';
let calibrationStartTime = null;
let calibrationDuration = 8; // 8 seconds calibration
let baselineGazeCenter = null;
let baselineFaceCenter = null;

let faceMesh = null;
let camera = null;
let isMonitoring = false;
let isPaused = false;
let accessibilityMode = false;
let debugMode = false;

// Performance optimization
let lastProcessTime = 0;
const FRAME_INTERVAL = 66; // ~15 FPS (throttle processing)
let processingFrameCount = 0;

// Error handling
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;
let hasWebcamPermission = false;

// Canvas and video elements
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;

// Behavior tracking - Eye Gaze
let currentGazeDirection = 'CENTER';
let lastGazeChangeTime = Date.now();
let lookingAwayStartTime = null;

// Behavior tracking - Face/Head Movement (separate from eye gaze)
let currentFaceDirection = 'FACE_CENTER';
let lastFaceDirectionChangeTime = Date.now();
let faceMovedAwayStartTime = null;
let faceNotDetectedStartTime = null;
let initialNosePosition = null;

// Warning counters
let totalWarnings = 0;
let lookingAwayWarnings = 0;  // Eye gaze warnings
let faceMovementWarnings = 0; // Head movement warnings
let faceNotDetectedWarnings = 0;

// Behavior log (privacy-safe: only timestamps and event types)
let behaviorLog = [];

// ============================================
// SESSION TRACKING & PATTERN DETECTION
// ============================================

// Session tracking
let sessionStartTime = null;
let totalMonitoringTime = 0;
let pausedTime = 0;

// Pattern detection - rolling window (last 60 seconds)
let gazeChangeHistory = []; // Array of {timestamp, direction}
let faceMovementHistory = []; // Array of {timestamp, direction}
let lastEventTimestamp = 0; // For cooldown between events

// Confidence/Severity tracking
let currentConfidenceLevel = 'LOW'; // LOW, MEDIUM, HIGH
let confidenceScore = 0; // 0-100

// False positive protection
const EVENT_COOLDOWN = 2000; // 2 seconds between similar events
const PATTERN_WINDOW = 60000; // 60 second rolling window
const BRIEF_MOVEMENT_THRESHOLD = 0.5; // Ignore movements < 0.5 seconds

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Normal mode thresholds (in seconds)
    normal: {
        lookingAwayThreshold: 3,        // Trigger alert after 3 seconds looking away (eye gaze)
        faceMovementThreshold: 3,       // Trigger alert after 3 seconds head turned away
        faceNotDetectedThreshold: 3,    // Trigger alert after 3 seconds face not detected
        gazeThreshold: 0.08,            // Eye gaze sensitivity (lower = more sensitive)
        faceMovementThreshold_value: 0.15,  // Head movement sensitivity (normalized by face width)
        
        // Pattern detection thresholds
        rapidGazeSwitchThreshold: 5,    // 5+ gaze changes in 30 seconds = distraction
        longDownwardGazeThreshold: 5,   // 5+ seconds looking down = possible device
        excessiveHeadMovementThreshold: 6, // 6+ head movements in 60 seconds = suspicious
        
        // Multi-signal fusion weights
        fusionTimeWindow: 10,           // Consider last 10 seconds for fusion
        combinedSignalThreshold: 0.7    // 70% confidence for combined signals
    },
    // Accessibility mode - increased tolerance
    accessibility: {
        lookingAwayThreshold: 8,        // 8 seconds tolerance for eye gaze
        faceMovementThreshold: 8,       // 8 seconds tolerance for head movement
        faceNotDetectedThreshold: 12,   // 12 seconds tolerance
        gazeThreshold: 0.20,            // Reduced eye gaze sensitivity
        faceMovementThreshold_value: 0.30,  // Increased tolerance for head movement (tremors, etc.)
        
        // Pattern detection - DISABLED in accessibility mode to prevent false positives
        rapidGazeSwitchThreshold: 999,  // Effectively disabled
        longDownwardGazeThreshold: 15,  // Much higher tolerance
        excessiveHeadMovementThreshold: 999, // Effectively disabled
        
        // Multi-signal fusion - more lenient
        fusionTimeWindow: 15,
        combinedSignalThreshold: 0.85   // 85% confidence required (harder to trigger)
    }
};

// Eye landmark indices for MediaPipe Face Mesh (468 landmarks total)
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
const IRIS_LEFT = [468, 469, 470, 471, 472];
const IRIS_RIGHT = [473, 474, 475, 476, 477];

// Face/Head movement landmarks
const NOSE_TIP = 1;
const FACE_LEFT_SIDE = 234;
const FACE_RIGHT_SIDE = 454;
const FOREHEAD = 10;
const CHIN = 152;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    setupEventListeners();
    checkBrowserCompatibility();
    showWelcomeMessage();
    updateStatus('Ready to start. Click "Start Monitoring"', false);
});

function checkBrowserCompatibility() {
    // Check for required browser APIs
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Browser Incompatible', 'Your browser does not support webcam access. Please use Chrome, Edge, or Firefox.');
        document.getElementById('startButton').disabled = true;
        return false;
    }
    
    // Check for Canvas support
    if (!window.CanvasRenderingContext2D) {
        showError('Canvas Not Supported', 'Your browser does not support required graphics features.');
        document.getElementById('startButton').disabled = true;
        return false;
    }
    
    console.log('✅ Browser compatibility check passed');
    return true;
}

function showWelcomeMessage() {
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) {
        welcomeEl.style.display = 'block';
        welcomeEl.innerHTML = `
            <h3>👋 Welcome to Cheat Detector Demo</h3>
            <p>This privacy-first monitoring system analyzes behavioral patterns only.</p>
            <ul>
                <li>✅ No video recording</li>
                <li>✅ Local processing only</li>
                <li>✅ Accessibility-aware</li>
            </ul>
            <p><strong>To begin:</strong> Click "Start Monitoring" and allow webcam access.</p>
        `;
    }
}

function initializeElements() {
    videoElement = document.getElementById('webcam');
    canvasElement = document.getElementById('overlay');
    canvasCtx = canvasElement.getContext('2d');
}

function setupEventListeners() {
    document.getElementById('startButton').addEventListener('click', startMonitoring);
    document.getElementById('stopButton').addEventListener('click', stopMonitoring);
    document.getElementById('pauseButton').addEventListener('click', pauseMonitoring);
    document.getElementById('resumeButton').addEventListener('click', resumeMonitoring);
    document.getElementById('accessibilityMode').addEventListener('change', toggleAccessibilityMode);
    document.getElementById('clearLogButton').addEventListener('click', clearLog);
    document.getElementById('exportLogButton').addEventListener('click', exportLog);
    document.getElementById('exportSummaryButton').addEventListener('click', exportSessionSummary);
    document.getElementById('debugToggle').addEventListener('change', toggleDebugMode);
}

// ============================================
// WEBCAM & MEDIAPIPE SETUP
// ============================================

async function startMonitoring() {
    try {
        initializationAttempts++;
        
        // Hide welcome message
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) welcomeEl.style.display = 'none';
        
        updateStatus('Requesting webcam access...', false);
        updateSessionState('IDLE');
        
        // Request webcam permission with better error handling
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });
            hasWebcamPermission = true;
        } catch (permissionError) {
            handleWebcamError(permissionError);
            return;
        }
        
        videoElement.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play().then(resolve).catch(reject);
            };
            setTimeout(() => reject(new Error('Video load timeout')), 10000);
        });
        
        // Initialize MediaPipe Face Mesh with error handling
        updateStatus('Loading AI model (MediaPipe Face Mesh)...', false);
        try {
            await initializeFaceMesh();
        } catch (modelError) {
            handleModelLoadError(modelError);
            return;
        }
        
        // Add visual feedback - webcam border glow
        document.querySelector('.video-wrapper').classList.add('webcam-active');
        
        // Start CALIBRATION phase
        updateStatus(`Calibration phase: Look naturally at the screen for ${calibrationDuration} seconds...`, false);
        updateSessionState('CALIBRATING');
        showCalibrationProgress();
        startCalibration();
        
    } catch (error) {
        console.error('Error starting monitoring:', error);
        handleGeneralError(error);
    }
}

function handleWebcamError(error) {
    console.error('Webcam access error:', error);
    
    let message = 'Could not access webcam.';
    let suggestion = '';
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = 'Webcam Permission Denied';
        suggestion = 'Please allow camera access and try again. Check your browser settings if the permission prompt doesn\'t appear.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        message = 'No Camera Found';
        suggestion = 'Please connect a webcam and try again.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        message = 'Camera Already in Use';
        suggestion = 'Please close other applications using the camera and try again.';
    }
    
    showError(message, suggestion);
    updateStatus(`Error: ${message}`, false);
    updateStatusIndicator('error');
    updateSessionState('IDLE');
}

function handleModelLoadError(error) {
    console.error('MediaPipe model load error:', error);
    
    const message = 'AI Model Failed to Load';
    const suggestion = initializationAttempts < MAX_INIT_ATTEMPTS 
        ? 'Retrying... Please wait or refresh the page if this persists.'
        : 'Please refresh the page and check your internet connection.';
    
    showError(message, suggestion);
    updateStatus('Error loading AI model', false);
    updateStatusIndicator('error');
    
    // Auto-retry
    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
        setTimeout(() => {
            console.log(`Retry attempt ${initializationAttempts + 1}/${MAX_INIT_ATTEMPTS}`);
            startMonitoring();
        }, 2000);
    } else {
        updateSessionState('IDLE');
    }
}

function handleGeneralError(error) {
    console.error('General error:', error);
    showError('Unexpected Error', 'Something went wrong. Please refresh the page and try again.');
    updateStatus('Error occurred', false);
    updateStatusIndicator('error');
    updateSessionState('IDLE');
}

function showError(title, message) {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.innerHTML = `
            <h3>⚠️ ${title}</h3>
            <p>${message}</p>
        `;
        errorEl.style.display = 'block';
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 10000);
    }
    
    // Also log to behavior log
    logEvent('error', title, message);
}

function startCalibration() {
    calibrationStartTime = Date.now();
    sessionStartTime = Date.now();
    isMonitoring = true;
    
    // Reset baseline data
    baselineGazeCenter = null;
    baselineFaceCenter = null;
    
    // Disable regular monitoring alerts during calibration
    lookingAwayStartTime = null;
    faceMovedAwayStartTime = null;
    faceNotDetectedStartTime = null;
    
    document.getElementById('startButton').disabled = true;
    document.getElementById('stopButton').disabled = false;
    document.getElementById('pauseButton').disabled = true;
    
    // Add visual feedback
    document.querySelector('.video-wrapper').classList.add('calibrating');
    
    console.log('🎯 Calibration phase started - collecting baseline data');
    logEvent('info', 'Calibration phase started', `Duration: ${calibrationDuration}s`);
}

function showCalibrationProgress() {
    const progressEl = document.getElementById('calibrationProgress');
    if (progressEl) {
        progressEl.style.display = 'block';
    }
}

function completeCalibration() {
    console.log('✅ Calibration complete');
    console.log('   Baseline gaze center:', baselineGazeCenter);
    console.log('   Baseline face center:', baselineFaceCenter);
    
    // Hide calibration progress
    const progressEl = document.getElementById('calibrationProgress');
    if (progressEl) {
        progressEl.style.display = 'none';
    }
    
    // Remove calibrating visual state
    document.querySelector('.video-wrapper').classList.remove('calibrating');
    document.querySelector('.video-wrapper').classList.add('monitoring');
    
    // Start actual monitoring
    updateSessionState('MONITORING');
    updateStatus('✓ Monitoring active - Behavioral analysis in progress', true);
    updateStatusIndicator('active');
    
    document.getElementById('pauseButton').disabled = false;
    
    // Reset tracking variables
    lastGazeChangeTime = Date.now();
    lastFaceDirectionChangeTime = Date.now();
    lookingAwayStartTime = null;
    faceMovedAwayStartTime = null;
    faceNotDetectedStartTime = null;
    
    // Reset pattern detection
    gazeChangeHistory = [];
    faceMovementHistory = [];
    confidenceScore = 0;
    currentConfidenceLevel = 'LOW';
    
    logEvent('info', 'Monitoring started', 'Calibration complete - Baseline established');
    
    // Show brief success message
    showSuccessMessage('Calibration successful! Monitoring started.');
}

function stopMonitoring() {
    isMonitoring = false;
    isPaused = false;
    
    // Stop camera properly
    if (camera) {
        try {
            camera.stop();
            console.log('Camera stopped');
        } catch (e) {
            console.warn('Error stopping camera:', e);
        }
        camera = null;
    }
    
    // Stop all video tracks
    if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => {
            track.stop();
        });
        videoElement.srcObject = null;
    }
    
    // Clear face mesh
    if (faceMesh) {
        try {
            faceMesh.close();
        } catch (e) {
            console.warn('Error closing faceMesh:', e);
        }
        faceMesh = null;
    }
    
    // Reset UI
    document.getElementById('startButton').disabled = false;
    document.getElementById('stopButton').disabled = true;
    document.getElementById('pauseButton').disabled = true;
    document.getElementById('resumeButton').disabled = true;
    
    updateStatus('Monitoring stopped', false);
    updateStatusIndicator('');
    updateSessionState('IDLE');
    
    // Remove visual classes
    const videoWrapper = document.querySelector('.video-wrapper');
    if (videoWrapper) {
        videoWrapper.classList.remove('webcam-active', 'calibrating', 'monitoring');
    }
    
    // Clear canvas
    if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
    
    // Generate session summary
    generateSessionSummary();
    
    // Reset initialization attempts
    initializationAttempts = 0;
    
    logEvent('info', 'Monitoring stopped', 'Session ended');
    
    console.log('✅ Monitoring stopped - All resources cleaned up');
}

function pauseMonitoring() {
    if (!isMonitoring || isPaused) return;
    
    isPaused = true;
    updateSessionState('PAUSED');
    updateStatus('Monitoring paused', false);
    updateStatusIndicator('');
    
    // Record pause time for accurate session duration
    pausedTime = Date.now();
    
    document.getElementById('pauseButton').disabled = true;
    document.getElementById('resumeButton').disabled = false;
    
    console.log('⏸️ Monitoring paused');
    logEvent('info', 'Monitoring paused', '');
}

function resumeMonitoring() {
    if (!isMonitoring || !isPaused) return;
    
    isPaused = false;
    updateSessionState('MONITORING');
    updateStatus('Monitoring resumed', true);
    updateStatusIndicator('active');
    
    // Adjust session start time to exclude paused duration
    if (pausedTime && sessionStartTime) {
        const pauseDuration = Date.now() - pausedTime;
        sessionStartTime += pauseDuration;
    }
    
    // Reset timers to prevent false positives after resume
    lookingAwayStartTime = null;
    faceMovedAwayStartTime = null;
    faceNotDetectedStartTime = null;
    
    document.getElementById('pauseButton').disabled = false;
    document.getElementById('resumeButton').disabled = true;
    
    console.log('▶️ Monitoring resumed');
    logEvent('info', 'Monitoring resumed', '');
}

async function initializeFaceMesh() {
    console.log('Initializing MediaPipe Face Mesh...');
    
    // Initialize MediaPipe Face Mesh with correct configuration
    faceMesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
        }
    });
    
    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    faceMesh.onResults(onFaceMeshResults);
    
    console.log('Initializing Camera...');
    
    // Initialize MediaPipe Camera utility for continuous frame processing
    camera = new Camera(videoElement, {
        onFrame: async () => {
            if (isMonitoring && faceMesh) {
                await faceMesh.send({ image: videoElement });
            }
        },
        width: 640,
        height: 480
    });
    
    await camera.start();
    console.log('Camera started successfully');
}

// ============================================
// FACE MESH RESULTS PROCESSING
// ============================================

function onFaceMeshResults(results) {
    if (!isMonitoring) return;
    
    // Performance optimization: Throttle processing to ~15 FPS
    const currentTime = Date.now();
    if (currentTime - lastProcessTime < FRAME_INTERVAL) {
        return; // Skip this frame
    }
    lastProcessTime = currentTime;
    processingFrameCount++;
    
    // Sync canvas dimensions with video (only when needed)
    if (canvasElement.width !== results.image.width || canvasElement.height !== results.image.height) {
        canvasElement.width = results.image.width;
        canvasElement.height = results.image.height;
    }
    
    // Clear previous frame
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Draw face mesh overlay
        drawFaceMesh(landmarks);
        
        // Check if in calibration phase
        if (sessionState === 'CALIBRATING') {
            handleCalibrationPhase(landmarks);
            return;
        }
        
        // Skip analysis if paused
        if (isPaused) {
            return;
        }
        
        console.log(`Face detected with ${landmarks.length} landmarks`);
        
        // Analyze BOTH eye gaze AND face/head movement
        const gazeDirection = analyzeGaze(landmarks);
        const faceDirection = analyzeFaceMovement(landmarks);
        
        // Update UI for both
        updateGazeUI(gazeDirection);
        updateFaceDirectionUI(faceDirection);
        
        // Multi-signal fusion and pattern detection
        performMultiSignalAnalysis(gazeDirection, faceDirection);
        
        // Check for behavioral anomalies (both eye and face)
        checkBehavioralAnomalies(gazeDirection, faceDirection);
        
        // Update debug overlay if enabled
        if (debugMode) {
            updateDebugOverlay(gazeDirection, faceDirection, landmarks);
        }
        
        // Reset face not detected timer
        if (faceNotDetectedStartTime) {
            const duration = (Date.now() - faceNotDetectedStartTime) / 1000;
            console.log(`Face redetected after ${duration.toFixed(1)}s`);
            faceNotDetectedStartTime = null;
            if (sessionState === 'FACE_NOT_DETECTED') {
                updateSessionState('MONITORING');
            }
        }
        
    } else {
        console.log('No face detected in frame');
        
        // Skip if paused or calibrating
        if (isPaused || sessionState === 'CALIBRATING') {
            return;
        }
        
        // Face not detected
        handleFaceNotDetected();
    }
}

function drawFaceMesh(landmarks) {
    // Draw connections between eye landmarks
    canvasCtx.strokeStyle = '#00FF00';
    canvasCtx.lineWidth = 1;
    canvasCtx.globalAlpha = 0.5;
    
    // Draw left eye outline
    drawConnectedPoints(landmarks, LEFT_EYE_INDICES);
    
    // Draw right eye outline
    drawConnectedPoints(landmarks, RIGHT_EYE_INDICES);
    
    // Draw iris points if available (refined landmarks)
    if (landmarks.length > 468) {
        canvasCtx.fillStyle = '#00FFFF';
        canvasCtx.globalAlpha = 0.8;
        
        // Draw left iris
        IRIS_LEFT.forEach(idx => {
            if (landmarks[idx]) {
                canvasCtx.beginPath();
                canvasCtx.arc(
                    landmarks[idx].x * canvasElement.width,
                    landmarks[idx].y * canvasElement.height,
                    3, 0, 2 * Math.PI
                );
                canvasCtx.fill();
            }
        });
        
        // Draw right iris
        IRIS_RIGHT.forEach(idx => {
            if (landmarks[idx]) {
                canvasCtx.beginPath();
                canvasCtx.arc(
                    landmarks[idx].x * canvasElement.width,
                    landmarks[idx].y * canvasElement.height,
                    3, 0, 2 * Math.PI
                );
                canvasCtx.fill();
            }
        });
    }
    
    // Draw eye corner markers for debugging
    canvasCtx.fillStyle = '#FF0000';
    [LEFT_EYE_OUTER, LEFT_EYE_INNER, RIGHT_EYE_OUTER, RIGHT_EYE_INNER].forEach(idx => {
        canvasCtx.beginPath();
        canvasCtx.arc(
            landmarks[idx].x * canvasElement.width,
            landmarks[idx].y * canvasElement.height,
            4, 0, 2 * Math.PI
        );
        canvasCtx.fill();
    });
    
    canvasCtx.globalAlpha = 1.0;
}

function drawConnectedPoints(landmarks, indices) {
    canvasCtx.beginPath();
    indices.forEach((idx, i) => {
        const point = landmarks[idx];
        const x = point.x * canvasElement.width;
        const y = point.y * canvasElement.height;
        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
    });
    canvasCtx.closePath();
    canvasCtx.stroke();
}

// ============================================
// GAZE DIRECTION ANALYSIS
// ============================================

function analyzeGaze(landmarks) {
    // Get eye corner landmarks for normalization
    const leftEyeOuter = landmarks[LEFT_EYE_OUTER];
    const leftEyeInner = landmarks[LEFT_EYE_INNER];
    const rightEyeOuter = landmarks[RIGHT_EYE_OUTER];
    const rightEyeInner = landmarks[RIGHT_EYE_INNER];
    
    // Calculate eye widths for normalization
    const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x);
    const rightEyeWidth = Math.abs(rightEyeOuter.x - rightEyeInner.x);
    
    // Calculate eye centers
    const leftEyeCenter = calculateCenter(landmarks, LEFT_EYE_INDICES);
    const rightEyeCenter = calculateCenter(landmarks, RIGHT_EYE_INDICES);
    
    // Use iris landmarks for precise gaze detection
    let gazeDirection = 'CENTER';
    
    if (landmarks.length > 468) {
        const leftIrisCenter = calculateCenter(landmarks, IRIS_LEFT);
        const rightIrisCenter = calculateCenter(landmarks, IRIS_RIGHT);
        
        // Calculate normalized offsets (relative to eye width)
        const leftHorizontalOffset = (leftIrisCenter.x - leftEyeCenter.x) / leftEyeWidth;
        const rightHorizontalOffset = (rightIrisCenter.x - rightEyeCenter.x) / rightEyeWidth;
        const avgHorizontalOffset = (leftHorizontalOffset + rightHorizontalOffset) / 2;
        
        // Calculate vertical offsets
        const leftVerticalOffset = (leftIrisCenter.y - leftEyeCenter.y) / leftEyeWidth;
        const rightVerticalOffset = (rightIrisCenter.y - rightEyeCenter.y) / rightEyeWidth;
        const avgVerticalOffset = (leftVerticalOffset + rightVerticalOffset) / 2;
        
        // Get threshold from config
        const config = accessibilityMode ? CONFIG.accessibility : CONFIG.normal;
        const threshold = config.gazeThreshold;
        
        console.log(`Gaze Analysis - H: ${avgHorizontalOffset.toFixed(3)}, V: ${avgVerticalOffset.toFixed(3)}, Threshold: ${threshold}`);
        
        // Determine direction with priority: vertical first, then horizontal
        if (Math.abs(avgVerticalOffset) > threshold) {
            if (avgVerticalOffset > 0) {
                gazeDirection = 'DOWN';
            } else {
                gazeDirection = 'UP';
            }
        } else if (Math.abs(avgHorizontalOffset) > threshold) {
            if (avgHorizontalOffset < 0) {
                gazeDirection = 'LEFT';
            } else {
                gazeDirection = 'RIGHT';
            }
        } else {
            gazeDirection = 'CENTER';
        }
        
        console.log(`Detected Gaze Direction: ${gazeDirection}`);
    } else {
        console.log('Iris landmarks not available, using CENTER as default');
    }
    
    return gazeDirection;
}

function calculateCenter(landmarks, indices) {
    let sumX = 0, sumY = 0;
    indices.forEach(idx => {
        sumX += landmarks[idx].x;
        sumY += landmarks[idx].y;
    });
    return {
        x: sumX / indices.length,
        y: sumY / indices.length
    };
}

// ============================================
// FACE/HEAD MOVEMENT ANALYSIS
// ============================================

function analyzeFaceMovement(landmarks) {
    // Get nose tip position (primary reference point)
    const noseTip = landmarks[NOSE_TIP];
    const faceLeftSide = landmarks[FACE_LEFT_SIDE];
    const faceRightSide = landmarks[FACE_RIGHT_SIDE];
    const forehead = landmarks[FOREHEAD];
    const chin = landmarks[CHIN];
    
    // Calculate face width for normalization
    const faceWidth = Math.abs(faceRightSide.x - faceLeftSide.x);
    const faceHeight = Math.abs(chin.y - forehead.y);
    
    // Calculate face center (midpoint between left and right side)
    const faceCenterX = (faceLeftSide.x + faceRightSide.x) / 2;
    const faceCenterY = (forehead.y + chin.y) / 2;
    
    // Calculate normalized displacement of nose from face center
    const horizontalDisplacement = (noseTip.x - faceCenterX) / faceWidth;
    const verticalDisplacement = (noseTip.y - faceCenterY) / faceHeight;
    
    // Get threshold from config
    const config = accessibilityMode ? CONFIG.accessibility : CONFIG.normal;
    const threshold = config.faceMovementThreshold_value;
    
    console.log(`Face Movement Analysis - H: ${horizontalDisplacement.toFixed(3)}, V: ${verticalDisplacement.toFixed(3)}, Threshold: ${threshold}`);
    console.log(`Nose position: (${noseTip.x.toFixed(3)}, ${noseTip.y.toFixed(3)}), Face center: (${faceCenterX.toFixed(3)}, ${faceCenterY.toFixed(3)})`);
    
    let faceDirection = 'FACE_CENTER';
    
    // Determine face direction with noise filtering
    // Prioritize vertical movement (looking down), then horizontal (turning head)
    if (Math.abs(verticalDisplacement) > threshold) {
        if (verticalDisplacement > 0) {
            faceDirection = 'FACE_DOWN';
        }
        // Note: FACE_UP is uncommon in exam scenarios, so we focus on DOWN
    } else if (Math.abs(horizontalDisplacement) > threshold) {
        if (horizontalDisplacement > 0) {
            // Nose moved right = face turned RIGHT
            faceDirection = 'FACE_RIGHT';
        } else {
            // Nose moved left = face turned LEFT
            faceDirection = 'FACE_LEFT';
        }
    }
    
    console.log(`Detected Face Direction: ${faceDirection}`);
    
    return faceDirection;
}

// ============================================
// BEHAVIOR ANOMALY DETECTION
// ============================================

function checkBehavioralAnomalies(gazeDirection, faceDirection) {
    const config = accessibilityMode ? CONFIG.accessibility : CONFIG.normal;
    const currentTime = Date.now();
    
    // ===== EYE GAZE TRACKING =====
    if (gazeDirection !== currentGazeDirection) {
        currentGazeDirection = gazeDirection;
        lastGazeChangeTime = currentTime;
        
        if (gazeDirection === 'CENTER' && lookingAwayStartTime) {
            const duration = (currentTime - lookingAwayStartTime) / 1000;
            logEvent('info', 'Eyes returned to center', `Duration: ${duration.toFixed(1)}s`);
            lookingAwayStartTime = null;
        }
    }
    
    // Check if looking away from center (EYE GAZE)
    if (gazeDirection !== 'CENTER') {
        if (!lookingAwayStartTime) {
            lookingAwayStartTime = currentTime;
        }
        
        const lookingAwayDuration = (currentTime - lookingAwayStartTime) / 1000;
        
        if (lookingAwayDuration > config.lookingAwayThreshold) {
            triggerBehaviorAlert(`Eye gaze ${gazeDirection} for extended period`, lookingAwayDuration, 'looking_away');
            lookingAwayStartTime = currentTime;
        }
    } else {
        lookingAwayStartTime = null;
    }
    
    // ===== FACE/HEAD MOVEMENT TRACKING =====
    if (faceDirection !== currentFaceDirection) {
        currentFaceDirection = faceDirection;
        lastFaceDirectionChangeTime = currentTime;
        
        if (faceDirection === 'FACE_CENTER' && faceMovedAwayStartTime) {
            const duration = (currentTime - faceMovedAwayStartTime) / 1000;
            logEvent('info', 'Head returned to center', `Duration: ${duration.toFixed(1)}s`);
            faceMovedAwayStartTime = null;
        }
    }
    
    // Check if head is turned away from center (FACE MOVEMENT)
    if (faceDirection !== 'FACE_CENTER') {
        if (!faceMovedAwayStartTime) {
            faceMovedAwayStartTime = currentTime;
        }
        
        const faceMovedAwayDuration = (currentTime - faceMovedAwayStartTime) / 1000;
        
        if (faceMovedAwayDuration > config.faceMovementThreshold) {
            triggerBehaviorAlert(`Head turned ${faceDirection.replace('FACE_', '')} for extended period`, faceMovedAwayDuration, 'face_movement');
            faceMovedAwayStartTime = currentTime;
        }
    } else {
        faceMovedAwayStartTime = null;
    }
}

function handleFaceNotDetected() {
    const currentTime = Date.now();
    const config = accessibilityMode ? CONFIG.accessibility : CONFIG.normal;
    
    if (!faceNotDetectedStartTime) {
        faceNotDetectedStartTime = currentTime;
        console.log('Face lost - starting detection timer');
    }
    
    const duration = (currentTime - faceNotDetectedStartTime) / 1000;
    
    // Update UI for both gaze and face
    updateGazeUI('FACE_NOT_DETECTED');
    updateFaceDirectionUI('FACE_NOT_DETECTED');
    
    // Trigger alert if exceeds threshold
    if (duration > config.faceNotDetectedThreshold) {
        triggerBehaviorAlert('Face not detected', duration, 'face_not_detected');
        faceNotDetectedStartTime = currentTime;
    }
}

function triggerBehaviorAlert(message, duration, type) {
    totalWarnings++;
    
    if (type === 'looking_away') {
        lookingAwayWarnings++;
        document.getElementById('lookingAwayCount').textContent = lookingAwayWarnings;
    } else if (type === 'face_movement') {
        faceMovementWarnings++;
        // Update face movement counter if element exists, otherwise add to looking away
        const faceMovementCountEl = document.getElementById('faceMovementCount');
        if (faceMovementCountEl) {
            faceMovementCountEl.textContent = faceMovementWarnings;
        }
    } else if (type === 'face_not_detected') {
        faceNotDetectedWarnings++;
        document.getElementById('faceNotDetectedCount').textContent = faceNotDetectedWarnings;
    }
    
    // Update counter display
    document.getElementById('warningCount').textContent = totalWarnings;
    
    // Log the alert (privacy-safe: only type, timestamp, duration)
    logEvent('alert', message, `Duration: ${duration.toFixed(1)}s`);
    
    console.log(`⚠️ ALERT: ${message} (${duration.toFixed(1)}s) - Type: ${type}`);
    
    // Visual feedback
    updateStatusIndicator('warning');
    setTimeout(() => {
        if (isMonitoring) {
            updateStatusIndicator('active');
        }
    }, 2000);
}

// ============================================
// UI UPDATES
// ============================================

function updateGazeUI(direction) {
    const gazePointer = document.getElementById('gazePointer');
    const gazeText = document.getElementById('gazeDirection');
    
    gazeText.textContent = 'Eye: ' + direction.replace('_', ' ');
    
    // Move pointer based on direction
    let translateX = 0, translateY = 0;
    
    switch(direction) {
        case 'LEFT':
            translateX = -60;
            break;
        case 'RIGHT':
            translateX = 60;
            break;
        case 'UP':
            translateY = -60;
            break;
        case 'DOWN':
            translateY = 60;
            break;
        case 'CENTER':
            translateX = 0;
            translateY = 0;
            break;
        case 'FACE_NOT_DETECTED':
            gazePointer.style.opacity = '0.3';
            gazeText.style.color = '#dc3545';
            return;
    }
    
    gazePointer.style.opacity = '1';
    gazePointer.style.transform = `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px))`;
    gazeText.style.color = direction === 'CENTER' ? '#28a745' : '#ffc107';
}

function updateFaceDirectionUI(faceDirection) {
    // Create or update face direction display
    let faceDirectionText = document.getElementById('faceDirectionText');
    if (!faceDirectionText) {
        faceDirectionText = document.createElement('div');
        faceDirectionText.id = 'faceDirectionText';
        faceDirectionText.className = 'face-direction-text';
        document.querySelector('.gaze-indicator').appendChild(faceDirectionText);
    }
    
    const displayText = faceDirection.replace('FACE_', '').replace('_', ' ');
    faceDirectionText.textContent = 'Head: ' + displayText;
    
    if (faceDirection === 'FACE_CENTER') {
        faceDirectionText.style.color = '#28a745';
    } else if (faceDirection === 'FACE_NOT_DETECTED') {
        faceDirectionText.style.color = '#dc3545';
    } else {
        faceDirectionText.style.color = '#ff6b6b';
    }
    
    console.log(`UI Updated - Face Direction: ${faceDirection}`);
}

function updateStatus(message, isActive) {
    document.getElementById('statusText').textContent = message;
}

function updateStatusIndicator(status) {
    const indicator = document.getElementById('statusIndicator');
    indicator.className = 'status-indicator';
    if (status) {
        indicator.classList.add(status);
    }
}

function toggleAccessibilityMode(event) {
    accessibilityMode = event.target.checked;
    const mode = accessibilityMode ? 'Accessibility Mode' : 'Normal Mode';
    
    console.log(`♿ Accessibility Mode: ${accessibilityMode ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Eye gaze threshold: ${accessibilityMode ? CONFIG.accessibility.gazeThreshold : CONFIG.normal.gazeThreshold}`);
    console.log(`   Face movement threshold: ${accessibilityMode ? CONFIG.accessibility.faceMovementThreshold_value : CONFIG.normal.faceMovementThreshold_value}`);
    console.log(`   Time thresholds: ${accessibilityMode ? '8s/8s/12s' : '3s/3s/3s'}`);
    
    logEvent('info', `Switched to ${mode}`, accessibilityMode ? 
        'Increased tolerance and reduced sensitivity for head tremors and movement' : 
        'Standard detection parameters');
    
    updateStatus(`Monitoring active (${mode})`, true);
}

// ============================================
// BEHAVIOR LOGGING (PRIVACY-SAFE)
// ============================================

function logEvent(type, message, details) {
    const timestamp = new Date().toLocaleString();
    
    // Privacy-safe log entry: only timestamp, event type, no images or biometric data
    const logEntry = {
        timestamp: timestamp,
        type: type,
        message: message,
        details: details
    };
    
    behaviorLog.push(logEntry);
    
    // Update UI
    updateLogDisplay();
}

function updateLogDisplay() {
    const logContainer = document.getElementById('behaviorLog');
    
    if (behaviorLog.length === 0) {
        logContainer.innerHTML = '<p class="log-empty">No events logged yet. Start monitoring to begin.</p>';
        return;
    }
    
    // Show most recent logs first
    const recentLogs = behaviorLog.slice(-20).reverse();
    
    logContainer.innerHTML = recentLogs.map(entry => {
        const cssClass = entry.type === 'alert' ? 'alert' : entry.type === 'warning' ? 'warning' : '';
        return `
            <div class="log-entry ${cssClass}">
                <div class="log-time">${entry.timestamp}</div>
                <div class="log-message">${entry.message}</div>
                ${entry.details ? `<div class="log-details">${entry.details}</div>` : ''}
            </div>
        `;
    }).join('');
}

function clearLog() {
    if (confirm('Are you sure you want to clear the behavior log?')) {
        behaviorLog = [];
        totalWarnings = 0;
        lookingAwayWarnings = 0;
        faceMovementWarnings = 0;
        faceNotDetectedWarnings = 0;
        
        document.getElementById('warningCount').textContent = '0';
        document.getElementById('lookingAwayCount').textContent = '0';
        document.getElementById('faceNotDetectedCount').textContent = '0';
        const faceMovementCountEl = document.getElementById('faceMovementCount');
        if (faceMovementCountEl) {
            faceMovementCountEl.textContent = '0';
        }
        
        updateLogDisplay();
        logEvent('info', 'Log cleared', '');
        console.log('Behavior log cleared');
    }
}

function exportLog() {
    if (behaviorLog.length === 0) {
        alert('No log data to export.');
        return;
    }
    
    // Create CSV format (privacy-safe export)
    const csvHeader = 'Timestamp,Type,Message,Details\n';
    const csvData = behaviorLog.map(entry => 
        `"${entry.timestamp}","${entry.type}","${entry.message}","${entry.details}"`
    ).join('\n');
    
    const csv = csvHeader + csvData;
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `behavior-log-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logEvent('info', 'Log exported', 'CSV file downloaded');
}

// ============================================
// OPTIONAL: FIREBASE INTEGRATION (COMMENTED)
// ============================================

/*
 * Firebase integration is commented out for privacy-first design.
 * Uncomment and configure if you need to store logs in the cloud.
 * 
 * IMPORTANT: Only store privacy-safe data (timestamps, event types).
 * Never store video frames, images, or raw biometric data.
 * 
 * Example Firebase configuration:
 * 
 * import { initializeApp } from 'firebase/app';
 * import { getFirestore, collection, addDoc } from 'firebase/firestore';
 * 
 * const firebaseConfig = {
 *     apiKey: "YOUR_API_KEY",
 *     authDomain: "YOUR_AUTH_DOMAIN",
 *     projectId: "YOUR_PROJECT_ID",
 *     storageBucket: "YOUR_STORAGE_BUCKET",
 *     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
 *     appId: "YOUR_APP_ID"
 * };
 * 
 * const app = initializeApp(firebaseConfig);
 * const db = getFirestore(app);
 * 
 * async function saveLogToFirebase(logEntry) {
 *     try {
 *         await addDoc(collection(db, 'behaviorLogs'), logEntry);
 *         console.log('Log saved to Firebase');
 *     } catch (error) {
 *         console.error('Error saving to Firebase:', error);
 *     }
 * }
 */

// ============================================
// NOTES
// ============================================

/*
 * This system is designed with privacy and accessibility in mind:
 * 
 * 1. PRIVACY-FIRST DESIGN:
 *    - All processing happens locally in the browser
 *    - No video frames are recorded or transmitted
 *    - Only behavioral timestamps and event types are logged
 *    - No biometric data is stored
 * 
 * 2. ACCESSIBILITY MODE:
 *    - Increased time thresholds for users with mobility differences
 *    - Reduced sensitivity to accommodate head movement
 *    - Configurable tolerance levels
 * 
 * 3. ETHICAL CONSIDERATIONS:
 *    - This system detects behavioral anomalies only
 *    - Must not be used as sole method to accuse or punish students
 *    - Consider individual circumstances and accessibility needs
 *    - Combine with human judgment and multiple assessment methods
 * 
 * 4. LIMITATIONS:
 *    - Accuracy depends on lighting conditions
 *    - May not work well with glasses or facial accessories
 *    - Cultural differences in eye contact norms
 *    - Individual differences in attention patterns
 */
// This file contains additional functions that need to be added to script.js
// Copy and paste these into script.js after the triggerBehaviorAlert function

// ============================================
// CALIBRATION PHASE HANDLER
// ============================================

function handleCalibrationPhase(landmarks) {
    const elapsedTime = (Date.now() - calibrationStartTime) / 1000;
    const remainingTime = Math.max(0, calibrationDuration - elapsedTime);
    
    updateStatus(`Calibration: ${remainingTime.toFixed(1)}s remaining - Look naturally at the screen`, false);
    
    // Collect baseline data during calibration
    const gazeDirection = analyzeGaze(landmarks);
    const faceDirection = analyzeFaceMovement(landmarks);
    
    // Store baseline if looking center
    if (gazeDirection === 'CENTER' && faceDirection === 'FACE_CENTER') {
        const leftIrisCenter = landmarks.length > 468 ? calculateCenter(landmarks, IRIS_LEFT) : null;
        const rightIrisCenter = landmarks.length > 468 ? calculateCenter(landmarks, IRIS_RIGHT) : null;
        const noseTip = landmarks[NOSE_TIP];
        
        if (leftIrisCenter && rightIrisCenter) {
            baselineGazeCenter = {
                x: (leftIrisCenter.x + rightIrisCenter.x) / 2,
                y: (leftIrisCenter.y + rightIrisCenter.y) / 2
            };
        }
        
        baselineFaceCenter = {
            x: noseTip.x,
            y: noseTip.y
        };
    }
    
    // Complete calibration after duration
    if (elapsedTime >= calibrationDuration) {
        completeCalibration();
    }
}

// ============================================
// MULTI-SIGNAL FUSION & PATTERN DETECTION
// ============================================

function performMultiSignalAnalysis(gazeDirection, faceDirection) {
    const currentTime = Date.now();
    const config = accessibilityMode ? CONFIG.accessibility : CONFIG.normal;
    
    // Add to history
    gazeChangeHistory.push({ timestamp: currentTime, direction: gazeDirection });
    faceMovementHistory.push({ timestamp: currentTime, direction: faceDirection });
    
    // Clean up old entries
    const windowStart = currentTime - PATTERN_WINDOW;
    gazeChangeHistory = gazeChangeHistory.filter(entry => entry.timestamp > windowStart);
    faceMovementHistory = faceMovementHistory.filter(entry => entry.timestamp > windowStart);
    
    // Pattern detection
    const recentGazeChanges = countDirectionChanges(gazeChangeHistory, 30000);
    if (recentGazeChanges >= config.rapidGazeSwitchThreshold) {
        if (canTriggerEvent('rapid_gaze_switch')) {
            triggerPatternAlert('Rapid gaze switching detected', recentGazeChanges, 'distraction_pattern');
            increaseConfidenceScore(15);
        }
    }
    
    // Decay confidence
    decayConfidenceScore();
    updateConfidenceLevel();
}

function countDirectionChanges(history, timeWindow) {
    if (history.length < 2) return 0;
    
    const cutoffTime = Date.now() - timeWindow;
    const recentHistory = history.filter(entry => entry.timestamp > cutoffTime);
    
    let changes = 0;
    for (let i = 1; i < recentHistory.length; i++) {
        if (recentHistory[i].direction !== recentHistory[i-1].direction) {
            changes++;
        }
    }
    return changes;
}

function canTriggerEvent(eventType) {
    const currentTime = Date.now();
    const timeSinceLastEvent = currentTime - lastEventTimestamp;
    return timeSinceLastEvent >= EVENT_COOLDOWN;
}

function triggerPatternAlert(message, value, patternType) {
    lastEventTimestamp = Date.now();
    console.log(`🚨 PATTERN: ${message} (${value})`);
    logEvent('pattern', message, `Type: ${patternType}`);
}

function increaseConfidenceScore(amount) {
    confidenceScore = Math.min(100, confidenceScore + amount);
}

function decayConfidenceScore() {
    confidenceScore = Math.max(0, confidenceScore - 0.5);
}

function updateConfidenceLevel() {
    let newLevel;
    if (confidenceScore <= 30) newLevel = 'LOW';
    else if (confidenceScore <= 60) newLevel = 'MEDIUM';
    else newLevel = 'HIGH';
    
    if (newLevel !== currentConfidenceLevel) {
        currentConfidenceLevel = newLevel;
    }
    
    updateConfidenceLevelUI();
}

function updateConfidenceLevelUI() {
    const el = document.getElementById('confidenceLevel');
    if (el) {
        el.textContent = currentConfidenceLevel;
        el.className = 'confidence-badge confidence-' + currentConfidenceLevel.toLowerCase();
    }
    
    const scoreEl = document.getElementById('confidenceScore');
    if (scoreEl) {
        scoreEl.textContent = Math.round(confidenceScore);
    }
}

function updateSessionState(state) {
    sessionState = state;
    const el = document.getElementById('sessionState');
    if (el) {
        el.textContent = state;
        el.className = 'session-state state-' + state.toLowerCase().replace('_', '-');
    }
    console.log(`📊 Session State: ${state}`);
}

function toggleDebugMode(event) {
    debugMode = event.target.checked;
    console.log(`🐛 Debug Mode: ${debugMode ? 'ENABLED' : 'DISABLED'}`);
    
    const overlay = document.getElementById('debugOverlay');
    if (overlay) {
        overlay.style.display = debugMode ? 'block' : 'none';
    }
}

function updateDebugOverlay(gazeDirection, faceDirection, landmarks) {
    const overlay = document.getElementById('debugOverlay');
    if (!overlay || !debugMode) return;
    
    const noseTip = landmarks[NOSE_TIP];
    const leftIris = landmarks.length > 468 ? landmarks[IRIS_LEFT[0]] : null;
    
    overlay.innerHTML = `
        <strong>DEBUG MODE</strong><br>
        Gaze: ${gazeDirection}<br>
        Face: ${faceDirection}<br>
        Nose: (${noseTip.x.toFixed(3)}, ${noseTip.y.toFixed(3)})<br>
        ${leftIris ? `Iris: (${leftIris.x.toFixed(3)}, ${leftIris.y.toFixed(3)})` : ''}<br>
        Confidence: ${Math.round(confidenceScore)}<br>
        Pattern Events: ${gazeChangeHistory.length}
    `;
}

function generateSessionSummary() {
    if (!sessionStartTime) return;
    
    const duration = (Date.now() - sessionStartTime) / 1000;
    
    const summary = {
        totalDuration: duration.toFixed(1) + 's',
        totalAlerts: totalWarnings,
        gazeAlerts: lookingAwayWarnings,
        faceAlerts: faceMovementWarnings,
        faceNotDetected: faceNotDetectedWarnings,
        confidenceLevel: currentConfidenceLevel,
        accessibilityMode: accessibilityMode
    };
    
    console.log('📊 SESSION SUMMARY:', summary);
    
    const summaryEl = document.getElementById('sessionSummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <h3>Session Summary</h3>
            <p><strong>Duration:</strong> ${summary.totalDuration}</p>
            <p><strong>Total Alerts:</strong> ${summary.totalAlerts}</p>
            <p><strong>Eye Gaze Alerts:</strong> ${summary.gazeAlerts}</p>
            <p><strong>Head Movement Alerts:</strong> ${summary.faceAlerts}</p>
            <p><strong>Face Not Detected:</strong> ${summary.faceNotDetected}</p>
            <p><strong>Final Confidence:</strong> ${summary.confidenceLevel}</p>
            <p><strong>Accessibility Mode:</strong> ${summary.accessibilityMode ? 'Enabled' : 'Disabled'}</p>
        `;
        summaryEl.style.display = 'block';
    }
    
    return summary;
}

function exportSessionSummary() {
    const summary = generateSessionSummary();
    if (!summary) {
        alert('No session data to export.');
        return;
    }
    
    const json = JSON.stringify(summary, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-summary-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    logEvent('info', 'Session summary exported', 'JSON file downloaded');
}

// ============================================
// PRODUCTION UX HELPERS
// ============================================

function showSuccessMessage(message) {
    const successEl = document.getElementById('successMessage');
    if (successEl) {
        successEl.textContent = message;
        successEl.style.display = 'block';
        setTimeout(() => {
            successEl.style.display = 'none';
        }, 3000);
    }
}

function updateCalibrationProgress(percentage) {
    const progressBar = document.getElementById('calibrationProgressBar');
    const progressText = document.getElementById('calibrationProgressText');
    
    if (progressBar) {
        progressBar.style.width = percentage + '%';
    }
    
    if (progressText) {
        progressText.textContent = Math.round(percentage) + '%';
    }
}

// Add to handleCalibrationPhase to show visual progress
function handleCalibrationPhaseEnhanced(landmarks) {
    const elapsedTime = (Date.now() - calibrationStartTime) / 1000;
    const remainingTime = Math.max(0, calibrationDuration - elapsedTime);
    const progress = (elapsedTime / calibrationDuration) * 100;
    
    updateCalibrationProgress(Math.min(progress, 100));
    updateStatus(`Calibration: ${remainingTime.toFixed(1)}s remaining - Look naturally at the screen`, false);
    
    // Rest of calibration logic...
    const gazeDirection = analyzeGaze(landmarks);
    const faceDirection = analyzeFaceMovement(landmarks);
    
    if (gazeDirection === 'CENTER' && faceDirection === 'FACE_CENTER') {
        const leftIrisCenter = landmarks.length > 468 ? calculateCenter(landmarks, IRIS_LEFT) : null;
        const rightIrisCenter = landmarks.length > 468 ? calculateCenter(landmarks, IRIS_RIGHT) : null;
        const noseTip = landmarks[NOSE_TIP];
        
        if (leftIrisCenter && rightIrisCenter) {
            baselineGazeCenter = {
                x: (leftIrisCenter.x + rightIrisCenter.x) / 2,
                y: (leftIrisCenter.y + rightIrisCenter.y) / 2
            };
        }
        
        baselineFaceCenter = {
            x: noseTip.x,
            y: noseTip.y
        };
    }
    
    if (elapsedTime >= calibrationDuration) {
        completeCalibration();
    }
}

// Performance monitoring
function logPerformanceMetrics() {
    if (debugMode && processingFrameCount > 0) {
        const fps = processingFrameCount / ((Date.now() - sessionStartTime) / 1000);
        console.log(`⚡ Performance: ${fps.toFixed(1)} FPS, ${processingFrameCount} frames processed`);
    }
}

// Cleanup on page unload (prevent memory leaks)
window.addEventListener('beforeunload', () => {
    if (isMonitoring) {
        stopMonitoring();
    }
});

// Keyboard shortcuts (accessibility)
document.addEventListener('keydown', (e) => {
    // Space = Pause/Resume
    if (e.code === 'Space' && isMonitoring && !isPaused) {
        e.preventDefault();
        pauseMonitoring();
    } else if (e.code === 'Space' && isMonitoring && isPaused) {
        e.preventDefault();
        resumeMonitoring();
    }
    
    // Escape = Stop
    if (e.code === 'Escape' && isMonitoring) {
        e.preventDefault();
        stopMonitoring();
    }
});

