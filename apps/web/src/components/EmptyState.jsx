import AcaiLogo from './AcaiLogo.jsx';
import './EmptyState.css';

const SUGGESTIONS = [
  'Me explica o que é SSE em poucas palavras',
  'Resuma a Revolução Industrial em 5 tópicos',
  'Meu Node.js deu "Cannot find module". O que pode ser?',
];

/**
 * Welcome screen with clickable suggestions.
 * @param {{ onPick: (text: string) => void }} props
 */
export default function EmptyState({ onPick }) {
  return (
    <section className="empty">
      <div className="empty__logo">
        <AcaiLogo size={64} />
      </div>
      <h1 className="empty__title">Oi! Eu sou a AçaIA.</h1>
      <p className="empty__subtitle">Rápida, brasileira e sem enrolação. Pergunte o que quiser.</p>
      <ul className="empty__suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button type="button" className="empty__chip" onClick={() => onPick(suggestion)}>
              {suggestion}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
