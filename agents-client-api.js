const fetchJsonFile = await fetch("./api.json");
const DID_API = await fetchJsonFile.json();

if (DID_API.key == "🤫")
  alert("Please put your api key inside ./api.json and restart..");

const RTCPeerConnection = (
  window.RTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection
).bind(window);

let peerConnection;
let streamId;
let sessionId;
let sessionClientAnswer;
let statsIntervalId;
let videoIsPlaying;
let lastBytesReceived;
let agentId;
let chatId;

const videoElement = document.getElementById("video-element");
videoElement.setAttribute("playsinline", "");
const peerStatusLabel = document.getElementById("peer-status-label");
const iceStatusLabel = document.getElementById("ice-status-label");
const iceGatheringStatusLabel = document.getElementById(
  "ice-gathering-status-label"
);
const signalingStatusLabel = document.getElementById("signaling-status-label");
const streamingStatusLabel = document.getElementById("streaming-status-label");
const agentIdLabel = document.getElementById("agentId-label");
const chatIdLabel = document.getElementById("chatId-label");
const textArea = document.getElementById("textArea");

// Play the idle video when the page is loaded
window.onload = (event) => {
  playIdleVideo();

  if (agentId == "" || agentId == undefined) {
    console.log(
      "Empty 'agentID' and 'chatID' variables\n\n1. Click on the 'Create new Agent with Knowledge' button\n2. Open the Console and wait for the process to complete\n3. Press on the 'Connect' button\n4. Type and send a message to the chat\nNOTE: You can store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats"
    );
  } else {
    console.log(
      "You are good to go!\nClick on the 'Connect Button', Then send a new message\nAgent ID: ",
      agentId,
      "\nChat ID: ",
      chatId
    );
    agentIdLabel.innerHTML = agentId;
    chatIdLabel.innerHTML = chatId;
  }
};
async function createPeerConnection(offer, iceServers) {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection({ iceServers });
    peerConnection.addEventListener(
      "icegatheringstatechange",
      onIceGatheringStateChange,
      true
    );
    peerConnection.addEventListener("icecandidate", onIceCandidate, true);
    peerConnection.addEventListener(
      "iceconnectionstatechange",
      onIceConnectionStateChange,
      true
    );
    peerConnection.addEventListener(
      "connectionstatechange",
      onConnectionStateChange,
      true
    );
    peerConnection.addEventListener(
      "signalingstatechange",
      onSignalingStateChange,
      true
    );
    peerConnection.addEventListener("track", onTrack, true);
  }

  await peerConnection.setRemoteDescription(offer);
  console.log("set remote sdp OK");

  const sessionClientAnswer = await peerConnection.createAnswer();
  console.log("create local sdp OK");

  await peerConnection.setLocalDescription(sessionClientAnswer);
  console.log("set local sdp OK");

  // Data Channel creation (for dispalying the Agent's responses as text)
  let dc = await peerConnection.createDataChannel("JanusDataChannel");
  dc.onopen = () => {
    console.log("datachannel open");
    startBtn.classList.remove("invisible")
  };

  let decodedMsg;
  // Agent Text Responses - Decoding the responses, pasting to the HTML element
  dc.onmessage = (event) => {
    let msg = event.data;
    let msgType = "chat/answer:";
    if (msg.includes(msgType)) {
      msg = decodeURIComponent(msg.replace(msgType, ""));
      console.log(msg);
      decodedMsg = msg;
      return decodedMsg;
    }
    if (msg.includes("stream/started")) {
      console.log(msg);
      document.getElementById(
        "msgHistory"
      ).innerHTML += `<span>${decodedMsg}</span><br><br>`;
    } else {
      console.log(msg);
    }
  };

  dc.onclose = () => {
    console.log("datachannel close");
  };

  return sessionClientAnswer;
}
function onIceGatheringStateChange() {
  iceGatheringStatusLabel.innerText = peerConnection.iceGatheringState;
  iceGatheringStatusLabel.className =
    "iceGatheringState-" + peerConnection.iceGatheringState;
}
function onIceCandidate(event) {
  if (event.candidate) {
    const { candidate, sdpMid, sdpMLineIndex } = event.candidate;

    // WEBRTC API CALL 3 - Submit network information
    fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}/ice`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        candidate,
        sdpMid,
        sdpMLineIndex,
        session_id: sessionId,
      }),
    });
  }
}
function onIceConnectionStateChange() {
  iceStatusLabel.innerText = peerConnection.iceConnectionState;
  iceStatusLabel.className =
    "iceConnectionState-" + peerConnection.iceConnectionState;
  if (
    peerConnection.iceConnectionState === "failed" ||
    peerConnection.iceConnectionState === "closed"
  ) {
    stopAllStreams();
    closePC();
  }
}
function onConnectionStateChange() {
  // not supported in firefox
  peerStatusLabel.innerText = peerConnection.connectionState;
  peerStatusLabel.className =
    "peerConnectionState-" + peerConnection.connectionState;
}
function onSignalingStateChange() {
  signalingStatusLabel.innerText = peerConnection.signalingState;
  signalingStatusLabel.className =
    "signalingState-" + peerConnection.signalingState;
}
function onVideoStatusChange(videoIsPlaying, stream) {
  let status;
  if (videoIsPlaying) {
    status = "streaming";

    const remoteStream = stream;
    setVideoElement(remoteStream);
  } else {
    status = "empty";
    playIdleVideo();
  }
  streamingStatusLabel.innerText = status;
  streamingStatusLabel.className = "streamingState-" + status;
}
function onTrack(event) {
  /**
   * The following code is designed to provide information about wether currently there is data
   * that's being streamed - It does so by periodically looking for changes in total stream data size
   *
   * This information in our case is used in order to show idle video while no video is streaming.
   * To create this idle video use the POST https://api.d-id.com/talks (or clips) endpoint with a silent audio file or a text script with only ssml breaks
   * https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html#break-tag
   * for seamless results use `config.fluent: true` and provide the same configuration as the streaming video
   */

  if (!event.track) return;

  statsIntervalId = setInterval(async () => {
    const stats = await peerConnection.getStats(event.track);
    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && report.kind === "video") {
        const videoStatusChanged =
          videoIsPlaying !== report.bytesReceived > lastBytesReceived;

        if (videoStatusChanged) {
          videoIsPlaying = report.bytesReceived > lastBytesReceived;
          onVideoStatusChange(videoIsPlaying, event.streams[0]);
        }
        lastBytesReceived = report.bytesReceived;
      }
    });
  }, 500);
}
function setVideoElement(stream) {
  if (!stream) return;
  // Add Animation Class
  videoElement.classList.add("animated");

  // Removing browsers' autoplay's 'Mute' Requirement
  videoElement.muted = false;

  videoElement.srcObject = stream;
  videoElement.loop = false;

  // Remove Animation Class after it's completed
  setTimeout(() => {
    videoElement.classList.remove("animated");
  }, 1000);

  // safari hotfix
  if (videoElement.paused) {
    videoElement
      .play()
      .then((_) => {})
      .catch((e) => {});
  }
}
function playIdleVideo() {
  // Add Animation Class
  videoElement.classList.toggle("animated");

  videoElement.srcObject = undefined;
  videoElement.src = "robert.mp4";
  videoElement.loop = true;

  // Remove Animation Class after it's completed
  setTimeout(() => {
    videoElement.classList.remove("animated");
  }, 1000);
}
function stopAllStreams() {
  if (videoElement.srcObject) {
    console.log("stopping video streams");
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
}
function closePC(pc = peerConnection) {
  if (!pc) return;
  console.log("stopping peer connection");
  pc.close();
  pc.removeEventListener(
    "icegatheringstatechange",
    onIceGatheringStateChange,
    true
  );
  pc.removeEventListener("icecandidate", onIceCandidate, true);
  pc.removeEventListener(
    "iceconnectionstatechange",
    onIceConnectionStateChange,
    true
  );
  pc.removeEventListener(
    "connectionstatechange",
    onConnectionStateChange,
    true
  );
  pc.removeEventListener("signalingstatechange", onSignalingStateChange, true);
  pc.removeEventListener("track", onTrack, true);
  clearInterval(statsIntervalId);
  iceGatheringStatusLabel.innerText = "";
  signalingStatusLabel.innerText = "";
  iceStatusLabel.innerText = "";
  peerStatusLabel.innerText = "";
  console.log("stopped peer connection");
  if (pc === peerConnection) {
    peerConnection = null;
  }
}
const maxRetryCount = 3;
const maxDelaySec = 4;
async function fetchWithRetries(url, options, retries = 1) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries <= maxRetryCount) {
      const delay =
        Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) * 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));

      console.log(
        `Request failed, retrying ${retries}/${maxRetryCount}. Error ${err}`
      );
      return fetchWithRetries(url, options, retries + 1);
    } else {
      throw new Error(`Max retries exceeded. error: ${err}`);
    }
  }
}

const connectButton = document.getElementById("connect-button");
connectButton.onclick = async () => {
  if (agentId == "" || agentId === undefined) {
    return alert(
      "1. Click on the 'Create new Agent with Knowledge' button\n2. Open the Console and wait for the process to complete\n3. Press on the 'Connect' button\n4. Type and send a message to the chat\nNOTE: You can store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats"
    );
  }

  if (peerConnection && peerConnection.connectionState === "connected") {
    return;
  }
  stopAllStreams();
  closePC();

  // WEBRTC API CALL 1 - Create a new stream
  const sessionResponse = await fetchWithRetries(
    `${DID_API.url}/${DID_API.service}/streams`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_url:
          "https://i.postimg.cc/y8b7NgzM/Whats-App-Image-2025-04-13-at-17-27-33.jpg",
      }),
    }
  );

  const {
    id: newStreamId,
    offer,
    ice_servers: iceServers,
    session_id: newSessionId,
  } = await sessionResponse.json();
  streamId = newStreamId;
  sessionId = newSessionId;
  try {
    sessionClientAnswer = await createPeerConnection(offer, iceServers);
  } catch (e) {
    console.log("error during streaming setup", e);
    stopAllStreams();
    closePC();
    return;
  }

  // WEBRTC API CALL 2 - Start a stream
  const sdpResponse = await fetch(
    `${DID_API.url}/${DID_API.service}/streams/${streamId}/sdp`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${DID_API.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answer: sessionClientAnswer,
        session_id: sessionId,
      }),
    }
  );
};

//******************************************************************** */
//-----------------My Added Code-----------------------//
let mediaRecorder;
let audioChunks = [];
let userinput = ""; // Final transcribed text

const startBtn = document.getElementById("startRecording");
const stopBtn = document.getElementById("stopRecording");
const loadingDiv = document.getElementById("loading");

startBtn.addEventListener("click", async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    loadingDiv.style.display = "block";
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const audioFile = new File([audioBlob], "voice_input.webm", {
      type: "audio/webm",
    });

    const formData = new FormData();
    formData.append("file", audioFile);
    // formData.append("model", "whisper-1");

    try {
      // const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      //   method: "POST",
      //   headers: {
      //     Authorization: `Bearer ${DID_API.openai}`
      //   },
      //   body: formData
      // });
      // async function sendAudioToWebhook(audioBlob) {
      const webhookUrl =
        "https://parkseroi.app.n8n.cloud/webhook-test/fe2c32c5-0bdb-4078-8760-f1f7b27838e2";

      try {
        // Send the POST request
        const response = await fetch(webhookUrl, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        console.log("Success:", responseData);
        sendMessage(responseData["text"]);
      } catch (error) {
        console.error("Error sending audio:", error);
        throw error;
      }

      // Example usage:
      // Assuming you have an audio blob from somewhere (like a recorder)
      // sendAudioToWebhook(audioBlob);

      // const data = await response.json();
      // userinput = data.text;
      // console.log("Transcribed Text:", userinput);
      // sendMessage(userinput);
      // } catch (error) {
      //   console.error("Transcription Error:", error);
      //   alert("Failed to transcribe. Try again.");
    } finally {
      loadingDiv.style.display = "none";
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  };
  function clickStopButton() {
    stopBtn.click();
  }
  mediaRecorder.start();
  console.log("Recording started...");
  startBtn.disabled = true;
  stopBtn.disabled = false;
  setTimeout(() => {
    clickStopButton();
  }, 6000);
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    console.log("Recording stopped.");
  }
});

//******************************************************************** */
let txtAreaValue = document.getElementById("textArea").value;
// Clearing the text-box element
const sendMessage = async (userInput) => {
  // connectionState not supported in firefox
  if (
    peerConnection?.signalingState === "stable" ||
    peerConnection?.iceConnectionState === "connected"
  ) {
    // Pasting the user's message to the Chat History element
    document.getElementById(
      "msgHistory"
    ).innerHTML += `<span style='opacity:0.5'><u>User:</u> ${userInput}</span><br>`;

    //   document.getElementById('textArea').value = '';

    // Agents Overview - Step 3: Send a Message to a Chat session - Send a message to a Chat
    const playResponse = await fetchWithRetries(
      `${DID_API.url}/agents/${agentId}/chat/${chatId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${DID_API.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          streamId: streamId,
          sessionId: sessionId,
          messages: [
            {
              role: "user",
              content: userInput,
              created_at: new Date().toString(),
            },
          ],
        }),
      }
    );
    const playResponseData = await playResponse.json();
    if (
      playResponse.status === 200 &&
      playResponseData.chatMode === "TextOnly"
    ) {
      console.log("User is out of credit, API only return text messages");
      document.getElementById(
        "msgHistory"
      ).innerHTML += `<span style='opacity:0.5'> ${playResponseData.result}</span><br>`;
    }
  }
};
const startButton = document.getElementById("start-button");
startButton.onclick = async () => {
  // connectionState not supported in firefox
  if (
    peerConnection?.signalingState === "stable" ||
    peerConnection?.iceConnectionState === "connected"
  ) {
    // Pasting the user's message to the Chat History element
    txtAreaValue = document.getElementById("textArea").value;
    document.getElementById("textArea").value = "";
    document.getElementById(
      "msgHistory"
    ).innerHTML += `<span style='opacity:0.5'><u>User:</u> ${txtAreaValue}</span><br>`;

    //   document.getElementById('textArea').value = '';

    // Agents Overview - Step 3: Send a Message to a Chat session - Send a message to a Chat
    const playResponse = await fetchWithRetries(
      `${DID_API.url}/agents/${agentId}/chat/${chatId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${DID_API.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          streamId: streamId,
          sessionId: sessionId,
          messages: [
            {
              role: "user",
              content: txtAreaValue,
              created_at: new Date().toString(),
            },
          ],
        }),
      }
    );
    const playResponseData = await playResponse.json();
    if (
      playResponse.status === 200 &&
      playResponseData.chatMode === "TextOnly"
    ) {
      console.log("User is out of credit, API only return text messages");
      document.getElementById(
        "msgHistory"
      ).innerHTML += `<span style='opacity:0.5'> ${playResponseData.result}</span><br>`;
    }
  }
};
startButton.click();
const destroyButton = document.getElementById("destroy-button");
destroyButton.onclick = async () => {
  await fetch(`${DID_API.url}/${DID_API.service}/streams/${streamId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${DID_API.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  stopAllStreams();
  closePC();
};

// Agents API Workflow
async function agentsAPIworkflow() {
  agentIdLabel.innerHTML = `<span style='color:orange'>Processing...<style='color:orange'>`;
  chatIdLabel.innerHTML = `<span style='color:orange'>Processing...<style='color:orange'>`;
  axios.defaults.baseURL = `${DID_API.url}`;
  axios.defaults.headers.common["Authorization"] = `Basic ${DID_API.key}`;
  axios.defaults.headers.common["content-type"] = "application/json";

  // Retry Mechanism (Polling) for this demo only - Please use Webhooks in real life applications!
  // as described in https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-2-add-documents-to-the-knowledge-base
  async function retry(url, retries = 1) {
    const maxRetryCount = 8; // Maximum number of retries
    const maxDelaySec = 12; // Maximum delay in seconds
    try {
      let response = await axios.get(`${url}`);
      if (response.data.status == "done") {
        return console.log(response.data.id + ": " + response.data.status);
      } else {
        throw new Error("Status is not 'done'");
      }
    } catch (err) {
      if (retries <= maxRetryCount) {
        const delay =
          Math.min(Math.pow(2, retries) / 4 + Math.random(), maxDelaySec) *
          1000;

        await new Promise((resolve) => setTimeout(resolve, delay));

        console.log(`Retrying ${retries}/${maxRetryCount}. ${err}`);
        return retry(url, retries + 1);
      } else {
        agentIdLabel.innerHTML = `<span style='color:red'>Failed</span>`;
        chatIdLabel.innerHTML = `<span style='color:red'>Failed</span>`;
        throw new Error(`Max retries exceeded. error: ${err}`);
      }
    }
  }

  // Knowledge Overview - Step 1: Create a new Knowledge Base
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-1-create-a-new-knowledge-base
  const createKnowledge = await axios.post("/knowledge", {
    name: "knowledge",
    description: "D-ID Agents API",
  });
  console.log("Create Knowledge:", createKnowledge.data);

  let knowledgeId = createKnowledge.data.id;
  console.log("Knowledge ID: " + knowledgeId);

  // Knowledge Overview - Step 2: Add Documents to the Knowledge Base
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-2-add-documents-to-the-knowledge-base

  const createDocument = await axios.post(
    `/knowledge/${knowledgeId}/documents`,
    {
      documentType: "pdf",
      source_url:
        "https://raw.githubusercontent.com/usman5-coder/new-repo/main/4_6043956009897040808%20(1).pdf",
      title: "A Father Persona who loves his Son",
    }
  );
  console.log("Create Document: ", createDocument.data);

  // Split the # to use in documentID
  let documentId = createDocument.data.id;
  let splitArr = documentId.split("#");
  documentId = splitArr[1];
  console.log("Document ID: " + documentId);

  // Knowledge Overview - Step 3: Retrieving the Document and Knowledge status
  // https://docs.d-id.com/reference/knowledge-overview#%EF%B8%8F-step-3-retrieving-the-document-and-knowledge-status
  await retry(`/knowledge/${knowledgeId}/documents/${documentId}`);
  await retry(`/knowledge/${knowledgeId}`);

  // Agents Overview - Step 1: Create an Agent
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-1-create-an-agent
  const createAgent = await axios.post("/agents", {
    // headers: {
    //   'Content-Type': 'application/json',

    //   'xi-api-key-external': 'sk_1a2791da045d9c8dc193b6aecf3754ac9f8b9b2864a157cd',
    // },
    knowledge: {
      provider: "pinecone",
      embedder: {
        provider: "azure-open-ai",
        model: "text-large-003",
      },
      id: knowledgeId,
    },
    presenter: {
      type: "talk",
      voice: {
        type: "elevenlabs",
        provider: "elevenlabs",
        voice_id: "Yko7PKHZNXotIFUBG7I9",
      },
      thumbnail:
        "https://i.postimg.cc/y8b7NgzM/Whats-App-Image-2025-04-13-at-17-27-33.jpg",
      source_url:
        "https://i.postimg.cc/y8b7NgzM/Whats-App-Image-2025-04-13-at-17-27-33.jpg",
    },
    llm: {
      type: "openai",
      provider: "openai",
      model: "gpt-3.5-turbo-1106",
      instructions:
        "You are an elderly man in his late 70s who has lived a full, rich life. You are kind-hearted, warm, and wise. You deeply love your family, especially your son, and you speak with the tender care of a father who has watched his child grow up through every stage of life. You often share stories from your past, offer heartfelt advice, and always speak with love, patience, and gentle humor. You are emotionally expressive, nostalgic, and value family above all. In everything you say, your deep love for your son and your appreciation for life should be clear. Respond to me as if I were your beloved child.",
      template: "rag-grounded",
    },
    preview_name: "Robert",
  });
  console.log("Create Agent: ", createAgent.data);
  let agentId = createAgent.data.id;
  console.log("Agent ID: " + agentId);

  // Agents Overview - Step 2: Create a new Chat session with the Agent
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-2-create-a-new-chat-session-with-the-agent
  const createChat = await axios.post(`/agents/${agentId}/chat`);
  console.log("Create Chat: ", createChat.data);
  let chatId = createChat.data.id;
  console.log("Chat ID: " + chatId);

  // Agents Overview - Step 3: Send a Message to a Chat session
  // https://docs.d-id.com/reference/agents-overview#%EF%B8%8F-step-3--send-a-message-to-a-chat-session
  // The WebRTC steps are called in the functions: 'connectButton.onclick', onIceCandidate(event), 'startButton.onclick'

  console.log(
    "Create new Agent with Knowledge - DONE!\n Press on the 'Connect' button to proceed.\n Store the created 'agentID' and 'chatId' variables at the bottom of the JS file for future chats"
  );
  agentIdLabel.innerHTML = agentId;
  chatIdLabel.innerHTML = chatId;
  return { agentId: agentId, chatId: chatId };
}

const agentsButton = document.getElementById("agents-button");
agentsButton.onclick = async () => {
  try {
    const agentsIds = ({} = await agentsAPIworkflow());
    console.log(agentsIds);
    agentId = agentsIds.agentId;
    chatId = agentsIds.chatId;
    connectButton.click();
    return;
  } catch (err) {
    agentIdLabel.innerHTML = `<span style='color:red'>Failed</span>`;
    chatIdLabel.innerHTML = `<span style='color:red'>Failed</span>`;
    throw new Error(err);
  }
};
agentsButton.click();

// Paste Your Created Agent and Chat IDs Here:
// agentId = "";
// chatId = "";
agentId = "agt__vaeBfE5";
chatId = "cht_rJnfAZQGC_GKh_n1gerA3";
