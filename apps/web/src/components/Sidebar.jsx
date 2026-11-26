import { useState } from 'react';
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from './Icons.jsx';
import './Sidebar.css';

/**
 * Conversation list with rename/delete, plus today's usage meter.
 * On small screens it slides in as a drawer.
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   conversations: import('../lib/api.js').ConversationSummary[],
 *   activeId: string|null,
 *   onSelect: (id: string) => void,
 *   onNewChat: () => void,
 *   onRename: (id: string, title: string) => Promise<void>,
 *   onDelete: (id: string) => Promise<void>,
 *   usage: { tokensUsed: number, dailyTokenLimit: number }|null,
 * }} props
 */
export default function Sidebar({ open, onClose, conversations, activeId, onSelect, onNewChat, onRename, onDelete, usage }) {
  return (
    <>
      <div className={`sidebar__backdrop${open ? ' sidebar__backdrop--visible' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar${open ? ' sidebar--open' : ''}`} aria-label="Conversas">
        <div className="sidebar__top">
          <button type="button" className="sidebar__new" onClick={onNewChat}>
            <PlusIcon />
            Nova conversa
          </button>
          <button type="button" className="sidebar__close" onClick={onClose} aria-label="Fechar lista de conversas">
            <CloseIcon />
          </button>
        </div>

        <nav className="sidebar__list">
          {conversations.length === 0 ? (
            <p className="sidebar__empty">Suas conversas aparecem aqui.</p>
          ) : (
            <ul>
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeId}
                  onSelect={onSelect}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </nav>

        {usage && <UsageMeter used={usage.tokensUsed} limit={usage.dailyTokenLimit} />}
      </aside>
    </>
  );
}

/**
 * @param {{
 *   conversation: import('../lib/api.js').ConversationSummary,
 *   active: boolean,
 *   onSelect: (id: string) => void,
 *   onRename: (id: string, title: string) => Promise<void>,
 *   onDelete: (id: string) => Promise<void>,
 * }} props
 */
function ConversationItem({ conversation, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conversation.title);

  async function saveTitle() {
    const trimmed = title.trim();
    setEditing(false);
    if (trimmed && trimmed !== conversation.title) await onRename(conversation.id, trimmed).catch(() => setTitle(conversation.title));
    else setTitle(conversation.title);
  }

  if (editing) {
    return (
      <li className="sidebar__item sidebar__item--editing">
        <form
          className="sidebar__rename"
          onSubmit={(event) => {
            event.preventDefault();
            saveTitle();
          }}
        >
          <input
            aria-label="Novo título da conversa"
            value={title}
            maxLength={120}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setTitle(conversation.title);
                setEditing(false);
              }
            }}
          />
          <button type="submit" className="sidebar__icon" aria-label="Salvar título">
            <CheckIcon />
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className={`sidebar__item${active ? ' sidebar__item--active' : ''}`}>
      <button type="button" className="sidebar__select" onClick={() => onSelect(conversation.id)} aria-current={active ? 'page' : undefined}>
        {conversation.title}
      </button>
      <span className="sidebar__actions">
        <button type="button" className="sidebar__icon" onClick={() => setEditing(true)} aria-label={`Renomear "${conversation.title}"`}>
          <PencilIcon />
        </button>
        <button
          type="button"
          className="sidebar__icon sidebar__icon--danger"
          onClick={() => {
            if (window.confirm(`Apagar a conversa "${conversation.title}"? Isso não pode ser desfeito.`)) onDelete(conversation.id);
          }}
          aria-label={`Apagar "${conversation.title}"`}
        >
          <TrashIcon />
        </button>
      </span>
    </li>
  );
}

/** @param {{ used: number, limit: number }} props */
function UsageMeter({ used, limit }) {
  const unlimited = limit === 0;
  const percent = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const format = (n) => n.toLocaleString('pt-BR');
  return (
    <div className="usage" title="Tokens são pedaços de texto (≈ 4 letras) lidos e escritos pelo modelo.">
      <div className="usage__label">
        <span>Uso hoje</span>
        <span>{unlimited ? `${format(used)} tokens` : `${format(used)} / ${format(limit)}`}</span>
      </div>
      {!unlimited && (
        <div
          className={`usage__bar${percent >= 90 ? ' usage__bar--high' : ''}`}
          role="progressbar"
          aria-label="Uso de tokens hoje"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
