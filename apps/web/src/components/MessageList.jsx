import { useLayoutEffect, useRef } from 'react';
import Message from './Message.jsx';
import './MessageList.css';

/** How close to the bottom (px) still counts as "following" the conversation. */
const STICKY_THRESHOLD = 80;

/**
 * Scrollable list of messages. Follows new tokens automatically, unless the user
 * scrolled up to read something older.
 * @param {{ messages: import('../lib/chat-reducer.js').ChatMessage[] }} props
 */
export default function MessageList({ messages }) {
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const followRef = useRef(true);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD;
  }

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="message-list" ref={listRef} onScroll={handleScroll} role="log" aria-label="Conversa">
      <div className="message-list__inner">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}
