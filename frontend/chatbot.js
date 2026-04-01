const BACKEND_URL = 'http://localhost:3000/chat';
let history = [];

// --- Inject styles ---
const style = document.createElement('style');
style.textContent = `
  #ekho-bubble {
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    width: 56px; height: 56px; border-radius: 50%;
    background: #003865; color: #FFD200;
    font-size: 24px; cursor: pointer; border: none;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,56,101,0.35);
    font-family: sans-serif;
  }
  #ekho-window {
    position: fixed; bottom: 92px; right: 24px; z-index: 9999;
    width: 340px; height: 480px;
    background: #fff; border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    display: flex; flex-direction: column;
    font-family: sans-serif; overflow: hidden;
  }
  #ekho-header {
    background: #003865; color: #fff;
    padding: 14px 16px;
    display: flex; align-items: center; gap: 10px;
  }
  #ekho-header .avatar {
    width: 34px; height: 34px; border-radius: 50%;
    background: #FFD200; color: #003865;
    display: flex; align-items: center; justify-content: center;
    font-weight: bold; font-size: 13px;
  }
  #ekho-header .title { flex: 1; }
  #ekho-header .title h3 { margin: 0; font-size: 14px; font-weight: 600; }
  #ekho-header .title p  { margin: 0; font-size: 11px; opacity: 0.65; }
  #ekho-header .close-btn {
    background: none; border: none; color: #fff;
    font-size: 18px; cursor: pointer; padding: 0 4px;
  }
  #ekho-messages {
    flex: 1; overflow-y: auto;
    padding: 14px; display: flex;
    flex-direction: column; gap: 10px;
    background: #f4f6f9;
  }
  .ekho-msg {
    max-width: 82%; padding: 9px 13px;
    border-radius: 14px; font-size: 13.5px; line-height: 1.5;
  }
  .ekho-msg.bot {
    background: #fff; border: 1px solid #e0e0e0;
    border-bottom-left-radius: 4px; align-self: flex-start;
    color: #1a1a1a;
  }
  .ekho-msg.user {
    background: #003865; color: #fff;
    border-bottom-right-radius: 4px; align-self: flex-end;
  }
  #ekho-input-row {
    display: flex; gap: 8px; padding: 10px 12px;
    border-top: 1px solid #eee; background: #fff;
  }
  #ekho-input {
    flex: 1; border: 1px solid #ddd; border-radius: 20px;
    padding: 8px 14px; font-size: 13px; outline: none;
  }
  #ekho-input:focus { border-color: #003865; }
  #ekho-send {
    background: #003865; color: #FFD200;
    border: none; border-radius: 20px;
    padding: 8px 14px; cursor: pointer; font-size: 13px;
    font-weight: 600;
  }
  #ekho-send:hover { background: #004f8f; }
`;
document.head.appendChild(style);

// --- Build the widget ---
const bubble = document.createElement('button');
bubble.id = 'ekho-bubble';
bubble.innerHTML = '🐬';
bubble.title = 'Chat with EkhoBot';

const win = document.createElement('div');
win.id = 'ekho-window';
win.style.display = 'none';
win.innerHTML = `
  <div id="ekho-header">
    <div class="avatar">EK</div>
    <div class="title">
      <h3>EkhoBot</h3>
      <p>CSUCI Virtual Assistant</p>
    </div>
    <button class="close-btn" id="ekho-close">✕</button>
  </div>
  <div id="ekho-messages"></div>
  <div id="ekho-input-row">
    <input id="ekho-input" type="text" placeholder="Ask EkhoBot anything..." />
    <button id="ekho-send">Send</button>
  </div>
`;

document.body.appendChild(bubble);
document.body.appendChild(win);

// --- Toggle open/close ---
bubble.onclick = () => {
  const isHidden = win.style.display === 'none';
  win.style.display = isHidden ? 'flex' : 'none';
  if (isHidden && history.length === 0) {
    addMessage("Hi! I'm EkhoBot 🐬 — your CSUCI virtual assistant. How can I help you today?", 'bot');
  }
};
document.getElementById('ekho-close').onclick = () => {
  win.style.display = 'none';
};

// --- Messaging ---
document.getElementById('ekho-send').onclick = sendMessage;
document.getElementById('ekho-input').onkeydown = e => {
  if (e.key === 'Enter') sendMessage();
};

function addMessage(text, role) {
  const msgs = document.getElementById('ekho-messages');
  const div = document.createElement('div');
  div.className = 'ekho-msg ' + role;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('ekho-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  addMessage(text, 'user');
  history.push({ role: 'user', content: text });

  const thinking = document.createElement('div');
  thinking.className = 'ekho-msg bot';
  thinking.textContent = 'EkhoBot is typing...';
  thinking.id = 'ekho-typing';
  document.getElementById('ekho-messages').appendChild(thinking);

  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    });
    const data = await res.json();
    document.getElementById('ekho-typing')?.remove();
    addMessage(data.reply, 'bot');
    history.push({ role: 'assistant', content: data.reply });
  } catch (err) {
    document.getElementById('ekho-typing')?.remove();
    addMessage('Sorry, EkhoBot is offline right now. Try again shortly!', 'bot');
  }
}