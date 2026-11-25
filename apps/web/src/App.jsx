import Composer from './components/Composer.jsx';
import EmptyState from './components/EmptyState.jsx';
import Header from './components/Header.jsx';
import MessageList from './components/MessageList.jsx';
import { useChat } from './hooks/useChat.js';
import './App.css';

export default function App() {
  const chat = useChat();
  const hasMessages = chat.messages.length > 0;

  return (
    <div className="app">
      <Header onNewChat={chat.reset} canReset={hasMessages} />
      <main className="app__main">
        {hasMessages ? <MessageList messages={chat.messages} /> : <EmptyState onPick={chat.send} />}
      </main>
      <Composer onSend={chat.send} onStop={chat.stop} isStreaming={chat.isStreaming} />
    </div>
  );
}
