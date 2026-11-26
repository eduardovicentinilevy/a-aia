import { useState } from 'react';
import { authErrorMessage, sendPasswordReset, signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/auth.js';
import AcaiLogo from './AcaiLogo.jsx';
import { GoogleIcon } from './Icons.jsx';
import './AuthScreens.css';

/**
 * Sign in with Google or e-mail/password, create an account, reset the password.
 * Passwords go straight to Firebase; our API never sees them.
 */
export default function LoginScreen() {
  const [mode, setMode] = useState(/** @type {'signin'|'signup'} */ ('signin'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [info, setInfo] = useState(/** @type {string|null} */ (null));

  /** @param {() => Promise<void>} action @param {string} [success] */
  async function run(action, success) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      if (success) setInfo(success);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** @param {import('react').FormEvent} event */
  function submit(event) {
    event.preventDefault();
    if (mode === 'signin') run(() => signInWithEmail(email, password));
    else run(() => signUpWithEmail(name, email, password), `Conta criada! Enviamos um link de confirmação para ${email}.`);
  }

  function resetPassword() {
    if (!email) {
      setError('Digite seu e-mail acima e clique de novo em "Esqueci minha senha".');
      return;
    }
    run(() => sendPasswordReset(email), `Se existir uma conta com ${email}, enviamos um link para criar uma nova senha.`);
  }

  return (
    <main className="auth">
      <section className="auth__card" aria-labelledby="auth-title">
        <div className="auth__brand">
          <span className="auth__logo">
            <AcaiLogo size={44} />
          </span>
          <h1 id="auth-title" className="auth__title">
            AçaIA
          </h1>
          <p className="auth__subtitle">Sua assistente brasileira: rápida e sem enrolação.</p>
        </div>

        <button type="button" className="auth__google" onClick={() => run(signInWithGoogle)} disabled={busy}>
          <GoogleIcon />
          <span>Entrar com Google</span>
        </button>

        <div className="auth__divider">
          <span>ou com e-mail</span>
        </div>

        <div className="auth__tabs" role="tablist" aria-label="Forma de acesso">
          {[
            ['signin', 'Entrar'],
            ['signup', 'Criar conta'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`auth__tab${mode === value ? ' auth__tab--active' : ''}`}
              onClick={() => {
                setMode(/** @type {'signin'|'signup'} */ (value));
                setError(null);
                setInfo(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="auth__form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="auth__field">
              <span>Nome</span>
              <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
          )}
          <label className="auth__field">
            <span>E-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="auth__field">
            <span>Senha</span>
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <p className="auth__message auth__message--error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="auth__message auth__message--info" role="status">
              {info}
            </p>
          )}

          <button type="submit" className="auth__submit" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </button>
          {mode === 'signin' && (
            <button type="button" className="auth__link" onClick={resetPassword} disabled={busy}>
              Esqueci minha senha
            </button>
          )}
        </form>

        <p className="auth__footnote">A AçaIA está em teste fechado: só e-mails convidados conseguem usar.</p>
      </section>
    </main>
  );
}
