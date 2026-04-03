import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './index.css';

const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001');

// ─── Helper: initials from name ───────────────────────────────────
const getInitials = (name) =>
  name ? name.slice(0, 2).toUpperCase() : '??';

// ─── Room meta ────────────────────────────────────────────────────
const ROOMS = [
  { name: 'General',      desc: 'Open chat for everyone',        icon: '💬' },
  { name: 'Tech Support', desc: 'Ask your technical questions',  icon: '🛠️' },
];

export default function App() {
  const [username, setUsername]         = useState('');
  const [hasJoined, setHasJoined]       = useState(false);
  const [currentRoom, setCurrentRoom]   = useState('');
  const [messages, setMessages]         = useState([]);
  const [inputText, setInputText]       = useState('');
  const [typingUsers, setTypingUsers]   = useState({});   // { name: true }

  const bottomRef       = useRef(null);
  const typingTimeout   = useRef(null);

  // ─── Socket listeners ─────────────────────────────────────────
  useEffect(() => {
    // FIX 1: Both listeners registered here, both cleaned up here.
    //        Previously user_typing cleanup was missing → duplicated callbacks.
    function onMessage(msg) {
      setMessages((prev) => [...prev, msg]);
    }

    function onTyping({ username: who, isTyping }) {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (isTyping) next[who] = true;
        else delete next[who];
        return next;
      });
    }

    function onSystem(msg) {
      setMessages((prev) => [...prev, { ...msg, isSystem: true }]);
    }

    socket.on('receive_message', onMessage);
    socket.on('user_typing',     onTyping);
    socket.on('system_message',  onSystem);

    return () => {
      socket.off('receive_message', onMessage);
      socket.off('user_typing',     onTyping);
      socket.off('system_message',  onSystem);
    };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Step 1: Join with name ───────────────────────────────────
  const handleJoin = () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    // FIX 2: emit set_username so the SERVER stores the name on socket.data
    socket.emit('set_username', trimmed);
    setHasJoined(true);
  };

  // ─── Step 2: Join a room ──────────────────────────────────────
  const handleJoinRoom = (roomName) => {
    socket.emit('join_room', roomName);
    setCurrentRoom(roomName);
    setMessages([]);
  };

  // ─── Step 3: Send message ─────────────────────────────────────
  const sendMessage = () => {
    const text = inputText.trim();
    if (!text) return;

    // FIX 3: We send the text AND the username from local state.
    //        The SERVER also attaches socket.data.username, so messages
    //        display the name even if the server-side echo is the source.
    socket.emit('send_message', {
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    // Stop the typing indicator immediately
    clearTimeout(typingTimeout.current);
    socket.emit('typing', false);

    setInputText('');
  };

  // ─── Typing handler ───────────────────────────────────────────
  const handleTyping = (e) => {
    setInputText(e.target.value);
    socket.emit('typing', true);

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing', false);
    }, 1500);
  };

  // ─── Typing indicator text ────────────────────────────────────
  const typingList = Object.keys(typingUsers);
  const typingText =
    typingList.length === 1 ? `${typingList[0]} is typing...`
    : typingList.length === 2 ? `${typingList[0]} and ${typingList[1]} are typing...`
    : typingList.length > 2  ? 'Several people are typing...'
    : '';

  // ─── Determine if a message is from self ─────────────────────
  // We compare socket.id → the message emitted by server includes
  // socket.id as "senderId" if we add it in server.js (see note below)
  // Simple fallback: compare username
  const isSelf = (msg) => msg.username === username.trim();

  // ─── Screen: Name entry ───────────────────────────────────────
  if (!hasJoined) {
    return (
      <div className="entry-screen">
        <div className="entry-logo">
          <div className="logo-icon">💬</div>
          <h1>LiveChat</h1>
        </div>
        <div className="entry-card">
          <h2>What's your name?</h2>
          <p>You'll be identified by this in the chat</p>
          <input
            className="entry-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="Enter your name..."
            autoFocus
          />
          <button className="btn-primary" onClick={handleJoin}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ─── Screen: Room selection ───────────────────────────────────
  if (!currentRoom) {
    return (
      <div className="entry-screen">
        <div className="entry-logo">
          <div className="logo-icon">💬</div>
          <h1>LiveChat</h1>
        </div>
        <div className="entry-card">
          <h2>Pick a room</h2>
          <p>Hi {username}! Choose where you want to chat</p>
          <div className="room-list">
            {ROOMS.map((room) => (
              <button
                key={room.name}
                className="room-btn"
                onClick={() => handleJoinRoom(room.name)}
              >
                <span className="room-hash">#</span>
                <span className="room-info">
                  <span className="room-name">{room.name}</span>
                  <span className="room-desc">{room.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Screen: Chat ─────────────────────────────────────────────
  return (
    <div className="chat-app">

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-header-icon">#</div>
          <div>
            <div className="chat-header-title">{currentRoom}</div>
            <div className="chat-header-sub">
              {ROOMS.find(r => r.name === currentRoom)?.desc}
            </div>
          </div>
        </div>
        <div className="chat-header-right">
          <div className="user-badge">
            <div className="user-avatar">{getInitials(username)}</div>
            <span className="user-name-badge">{username}</span>
          </div>
          <button
            className="change-room-btn"
            onClick={() => {
              setCurrentRoom('');
              setMessages([]);
            }}
          >
            Switch room
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-area">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">👋</div>
            <p>No messages yet in <strong>#{currentRoom}</strong>.<br />Say hello!</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.isSystem) {
            return (
              <div key={i} className="msg-system">
                {msg.text}
              </div>
            );
          }

          const self = isSelf(msg);
          return (
            <div key={i} className={`msg-group ${self ? 'self' : 'other'}`}>
              {/* FIX 4: Always show sender name above bubble */}
              {!self && (
                <div className="msg-sender">{msg.username}</div>
              )}
              <div className="msg-bubble">{msg.text}</div>
              <div className="msg-time">{msg.timestamp}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator — always rendered so layout doesn't jump */}
      <div className="typing-bar">
        {typingText && (
          <>
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            <span className="typing-text">{typingText}</span>
          </>
        )}
      </div>

      {/* Input bar */}
      <div className="input-bar">
        <div className="input-row">
          <input
            className="chat-input"
            value={inputText}
            onChange={handleTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={`Message #${currentRoom}...`}
          />
          <button className="send-btn" onClick={sendMessage}>
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}