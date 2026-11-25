import AcaiLogo from './AcaiLogo.jsx';
import { PlusIcon } from './Icons.jsx';
import './Header.css';

/**
 * @param {{ onNewChat: () => void, canReset: boolean }} props
 */
export default function Header({ onNewChat, canReset }) {
  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__brand">
          <span className="header__logo">
            <AcaiLogo size={28} />
          </span>
          <span className="header__name">AçaIA</span>
          <span className="header__badge">Fase 0</span>
        </div>
        <button type="button" className="header__new" onClick={onNewChat} disabled={!canReset}>
          <PlusIcon />
          <span>Nova conversa</span>
        </button>
      </div>
    </header>
  );
}
