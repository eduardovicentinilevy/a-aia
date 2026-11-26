import { useEffect, useRef, useState } from 'react';
import AcaiLogo from './AcaiLogo.jsx';
import { LogOutIcon, MenuIcon } from './Icons.jsx';
import './Header.css';

/**
 * @param {{
 *   onToggleSidebar: () => void,
 *   user: { name: string, email: string|null } | null,
 *   onSignOut: (() => void) | null,
 * }} props  `onSignOut` is null when login is disabled (development).
 */
export default function Header({ onToggleSidebar, user, onSignOut }) {
  return (
    <header className="header">
      <div className="header__inner">
        <button type="button" className="header__menu" onClick={onToggleSidebar} aria-label="Abrir lista de conversas">
          <MenuIcon />
        </button>
        <div className="header__brand">
          <span className="header__logo">
            <AcaiLogo size={28} />
          </span>
          <span className="header__name">AçaIA</span>
          <span className="header__badge">Beta</span>
        </div>
        {user && <UserMenu user={user} onSignOut={onSignOut} />}
      </div>
    </header>
  );
}

/** @param {{ user: { name: string, email: string|null }, onSignOut: (() => void) | null }} props */
function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return undefined;
    /** @param {MouseEvent} event */
    const onClick = (event) => {
      if (!ref.current?.contains(/** @type {Node} */ (event.target))) setOpen(false);
    };
    /** @param {KeyboardEvent} event */
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu__button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <span className="user-menu__avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="user-menu__name">{user.name}</span>
      </button>
      {open && (
        <div className="user-menu__panel" role="menu">
          <p className="user-menu__who">
            <strong>{user.name}</strong>
            {user.email && <span>{user.email}</span>}
          </p>
          {onSignOut ? (
            <button type="button" role="menuitem" className="user-menu__item" onClick={onSignOut}>
              <LogOutIcon />
              Sair
            </button>
          ) : (
            <p className="user-menu__note">Login desligado (desenvolvimento).</p>
          )}
        </div>
      )}
    </div>
  );
}
