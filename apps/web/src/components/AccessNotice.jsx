import { useState } from 'react';
import { authErrorMessage, refreshVerification, resendVerificationEmail, signOut } from '../lib/auth.js';
import AcaiLogo from './AcaiLogo.jsx';
import './AuthScreens.css';

/**
 * Shown when the API answers 403: e-mail not verified yet, or not on the invite list.
 * @param {{ error: import('../lib/api.js').ApiError, email: string|null, onRetry: () => void }} props
 */
export default function AccessNotice({ error, email, onRetry }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string|null} */ (null));
  const notVerified = error.code === 'email_not_verified';

  /** @param {() => Promise<void>} action */
  async function run(action) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth__card" aria-labelledby="notice-title">
        <div className="auth__brand">
          <span className="auth__logo">
            <AcaiLogo size={44} />
          </span>
          <h1 id="notice-title" className="auth__title auth__title--small">
            {notVerified ? 'Confirme seu e-mail' : 'Teste fechado'}
          </h1>
          <p className="auth__subtitle">
            {notVerified ? (
              <>Enviamos um link de confirmação para <strong>{email}</strong>. Abra o e-mail, clique no link e volte aqui.</>
            ) : (
              <>A AçaIA está em teste fechado e <strong>{email}</strong> ainda não foi convidado. Peça para entrar na lista de testadores.</>
            )}
          </p>
        </div>

        {message && (
          <p className="auth__message auth__message--info" role="status">
            {message}
          </p>
        )}

        <div className="auth__actions">
          {notVerified && (
            <>
              <button
                type="button"
                className="auth__submit"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    if (await refreshVerification()) onRetry();
                    else setMessage('Ainda não aparece como confirmado. Clique no link do e-mail e tente de novo.');
                  })
                }
              >
                Já confirmei
              </button>
              <button
                type="button"
                className="auth__secondary"
                disabled={busy}
                onClick={() => run(async () => {
                  await resendVerificationEmail();
                  setMessage('Enviamos outro link. Confira também a caixa de spam.');
                })}
              >
                Reenviar e-mail
              </button>
            </>
          )}
          <button type="button" className="auth__link" onClick={() => signOut()} disabled={busy}>
            Sair e usar outra conta
          </button>
        </div>
      </section>
    </main>
  );
}
