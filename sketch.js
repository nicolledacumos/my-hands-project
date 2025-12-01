// For this project I really wanted to circle back to an idea I had when I first joined this course. I saw a video back in 2024 of this girl using code to control vocal harmony, and I wondered how I would be able to do that. After our class using the webcam, I realized it could be possible. I used MediaHands in order to have my hand gestures detected and Ableton Live (free trial because I can't afford the actual thing yet!) for the vocal recordings. So far, I've been able to have the code work when I am not recording anything in Ableton, so I need to set up a separate camera to use p5js in so I can actually record live vocals. 
// This has been a fun experience, and I'm glad I got the opportunity to try this out! 
// I used ChatGPT to help with understanding how to use Ableton (because the last time I used it was 5 years ago), and with adjusting the hand gestures. Once I was finally able to set Ableton up, the code was straightforward! I hope I can keep fine tuning this and create a full video soon.

let video;
let hands;
let latestLandmarks = null;
let midiAccess = null;
let midiOutput = null;
let lastGesture = null;
let sending = false;
let gestureBuffer = [];
const BUFFER_SIZE = 6;
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20]
];

let activeNotes = [];
const BASE_NOTE = 60; // Middle C

function setup() {
  createCanvas(640, 480);

  // MIDI setup
  navigator.requestMIDIAccess().then(midi => {
    midiAccess = midi;
    for (let output of midiAccess.outputs.values()) {
      midiOutput = output;
      console.log("Using MIDI Output:", midiOutput.name);
      break;
    }
    if (!midiOutput) console.warn("No MIDI output found!");
  });

  // Video setup
  video = createCapture(VIDEO);
  video.size(width, height);
  video.elt.setAttribute("playsinline", "");
  video.hide();

  // MediaPipe Hands
  hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6
  });

  hands.onResults(results => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      latestLandmarks = results.multiHandLandmarks[0];
    } else {
      latestLandmarks = null;
    }
    sending = false;
  });
}

function draw() {
  background(30);

  // Mirror video
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  if (!sending && video.loadedmetadata) {
    sending = true;
    hands.send({ image: video.elt });
  }

  if (!latestLandmarks) return;

  drawHand(latestLandmarks);

  const fingerStates = getFingerStates(latestLandmarks);
  const gesture = interpretGesture(fingerStates);

  gestureBuffer.push(gesture);
  if (gestureBuffer.length > BUFFER_SIZE) gestureBuffer.shift();
  const stableGesture = mostCommon(gestureBuffer);

  fill(255, 230, 120);
  noStroke();
  textSize(28);
  textAlign(LEFT, TOP);
  text(stableGesture, 12, 12);

  handleGesture(stableGesture);
}

function sendMidiNote(note, velocity = 100) {
  if (midiOutput) {
    midiOutput.send([0x90, note, velocity]);
    console.log("Note ON:", note);
  }
}

function sendMidiNoteOff(note) {
  if (midiOutput) {
    midiOutput.send([0x80, note, 0]);
    console.log("Note OFF:", note);
  }
}

function drawHand(landmarks) {
  const coords = landmarks.map(lm => lmToCanvasMirror(lm));

  stroke(0, 255, 0);
  strokeWeight(2);
  for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
    const [x1, y1] = coords[startIdx];
    const [x2, y2] = coords[endIdx];
    line(x1, y1, x2, y2);
  }

  noStroke();
  fill(255, 0, 0);
  for (const [x, y] of coords) circle(x, y, 8);

  const xs = coords.map(p => p[0]);
  const ys = coords.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  noFill();
  stroke(255, 160, 0);
  strokeWeight(2);
  rect(minX - 8, minY - 8, maxX - minX + 16, maxY - minY + 16, 8);
}

function lmToCanvasMirror(lm) {
  return [width - (lm.x * width), lm.y * height];
}

function getFingerStates(landmarks) {
  const tips = [4, 8, 12, 16, 20];
  const pip = [3, 6, 10, 14, 18];
  const mcp = [2, 5, 9, 13, 17];
  const res = { thumb:false, index:false, middle:false, ring:false, pinky:false };
  const indexMCP = landmarks[5];

  ['thumb','index','middle','ring','pinky'].forEach((name,i) => {
    const tip = landmarks[tips[i]];
    const pipL = landmarks[pip[i]];
    if (name !== 'thumb') res[name] = tip.y < pipL.y;
    else res.thumb = Math.abs(tip.x - indexMCP.x) > 0.05;
  });
  return res;
}

function interpretGesture(states) {
  const count = Object.values(states).filter(v => v).length;
  if (count === 0) return "Fist";
  if (count === 1) return "1 Finger";
  if (count === 2) return "2 Fingers";
  if (count === 3) return "3 Fingers";
  if (count === 5) return "Open Hand";
  return "Other";
}

function mostCommon(arr) {
  const freq = {};
  let max = 0, best = arr[0];
  for (const v of arr) {
    freq[v] = (freq[v] || 0) + 1;
    if (freq[v] > max) { max = freq[v]; best = v; }
  }
  return best;
}

function handleGesture(gesture) {
  if (gesture === lastGesture) return;
  lastGesture = gesture;

  // Turn off previous notes
  activeNotes.forEach(note => sendMidiNoteOff(note));
  activeNotes = [];

  let notesToSend = [];
  switch(gesture) {
    case "Fist": break;
    case "Open Hand": notesToSend = [BASE_NOTE-2, BASE_NOTE, BASE_NOTE+3, BASE_NOTE+5, BASE_NOTE+7]; break;
    case "1 Finger": notesToSend = [BASE_NOTE+3]; break;
    case "2 Fingers": notesToSend = [BASE_NOTE+3, BASE_NOTE+5]; break;
    case "3 Fingers": notesToSend = [BASE_NOTE-2, BASE_NOTE+3, BASE_NOTE+5]; break;
    default: return;
  }

  notesToSend.forEach(note => {
    sendMidiNote(note);
    activeNotes.push(note);
  });
}
