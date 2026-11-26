import { useEffect, useState } from 'react';
import AccessNotice from './components/AccessNotice.jsx';
import AcaiLogo from './components/AcaiLogo.jsx';
import Composer from './components/Composer.jsx';
import EmptyState from './components/EmptyState.jsx';
import Header from './components/Header.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import MessageList from './components/MessageList.jsx';
import Sidebar from './components/Sidebar.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useChat } from './hooks/useChat.js';
import { useConversations } from './hooks/useConversations.js';
import { useUsage } from './hooks/useUsage.js';
import { configureApi } from './lib/api.js';
import { getIdToken, signOut } from './lib/auth.js';
import './App.css';

export default function App() {
  const auth = useAuth();
  /** A 403 from the API (e-mail not verified / not invited) replaces the chat with an explanation. */
  const [accessError, setAccessError] = useState(/** @type {import('./lib/api.js').ApiError|null} */ (null));

  useEffect(() => {
    configureApi({
      getToken: () => getIdToken(),
      onAuthError: (error) => {
        if (error.status === 401) signOut(); // session expired → back to the login screen
        else setAccessError(error);
      },
    });
  }, []);

  if (auth.status === 'loading') return <Splash />;
  if (auth.status === 'signedOut') return <LoginScreen />;
  if (accessError) {
    return <AccessNotice error={accessError} email={auth.user?.email ?? null} onRetry={() => setAccessError(null)} />;
  }
  // `key` resets all chat state when a different person signs in.
  return <ChatShell key={auth.user?.uid ?? 'dev'} user={auth.user} loginEnabled={auth.status === 'signedIn'} />;
}

function Splash() {
  return (
    <div className="splash" role="status" aria-label="Carregando">
      <AcaiLogo size={64} className="splash__logo" />
    </div>
  );
}

/**
 * The logged-in app: sidebar with conversations + the chat.
 * @param {{ user: import('./lib/auth.js').AuthUser|null, loginEnabled: boolean }} props
 */
function ChatShell({ user, loginEnabled }) {
  const conversations = useConversations();
  const usage = useUsage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chat = useChat({
    onConversationCreated: () => conversations.refresh(),
    onAnswerFinished: () => {
      conversations.refresh(); // new title / new order
      usage.refresh();
    },
  });
  const hasMessages = chat.messages.length > 0;

  const selectConversation = (/** @type {string} */ id) => {
    setSidebarOpen(false);
    if (id !== chat.conversationId) chat.open(id);
  };
  const newChat = () => {
    setSidebarOpen(false);
    chat.reset();
  };
  const deleteConversation = async (/** @type {string} */ id) => {
    await conversations.remove(id);
    if (id === chat.conversationId) chat.reset();
  };

  const headerUser = user
    ? { name: user.displayName || user.email || 'Você', email: user.email }
    : { name: 'Dev local', email: null };

  return (
    <div className="app">
      <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} user={headerUser} onSignOut={loginEnabled ? () => signOut() : null} />
      <div className="app__body">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          conversations={conversations.items}
          activeId={chat.conversationId}
          onSelect={selectConversation}
          onNewChat={newChat}
          onRename={conversations.rename}
          onDelete={deleteConversation}
          usage={usage.data}
        />
        <main className="app__main">
          {chat.loading ? (
            <div className="app__loading" role="status">
              Carregando conversa…
            </div>
          ) : chat.loadError ? (
            <div className="app__loading app__loading--error" role="alert">
              {chat.loadError}
            </div>
          ) : hasMessages ? (
            <MessageList messages={chat.messages} />
          ) : (
            <EmptyState onPick={chat.send} />
          )}
          <Composer onSend={chat.send} onStop={chat.stop} isStreaming={chat.isStreaming} />
        </main>
      </div>
    </div>
  );
}
