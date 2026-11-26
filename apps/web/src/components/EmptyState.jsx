import { greeting } from '../lib/format.js';
import AcaiLogo from './AcaiLogo.jsx';
import { BookIcon, CodeIcon, FeatherIcon, LightbulbIcon } from './Icons.jsx';
import './EmptyState.css';

const SUGGESTIONS = [
  { icon: LightbulbIcon, label: 'Explicar', prompt: 'Me explica o que é SSE em poucas palavras' },
  { icon: BookIcon, label: 'Estudar', prompt: 'Resuma a Revolução Industrial em 5 tópicos' },
  { icon: CodeIcon, label: 'Programar', prompt: 'Meu Node.js deu "Cannot find module". O que pode ser?' },
  { icon: FeatherIcon, label: 'Escrever', prompt: 'Escreva um e-mail curto pedindo mais prazo para entregar um trabalho' },
];

/**
 * Welcome screen with a greeting and clickable suggestion cards.
 * @param {{ onPick: (text: string) => void, firstName: string|null }} props
 */
export default function EmptyState({ onPick, firstName }) {
  const hello = greeting(new Date());
  return (
    <section className="empty">
      <div className="empty__hero">
        <span className="empty__glow" aria-hidden="true" />
        <AcaiLogo size={76} className="empty__logo" />
      </div>
      <h1 className="empty__title">
        <span className="gradient-text">{firstName ? `${hello}, ${firstName}!` : `${hello}!`}</span>
        <span className="empty__question">Como posso ajudar hoje?</span>
      </h1>
      <p className="empty__subtitle">Sou a AçaIA: rápida, brasileira e sem enrolação.</p>
      <ul className="empty__grid">
        {SUGGESTIONS.map(({ icon: Icon, label, prompt }, index) => (
          <li key={prompt} style={{ '--delay': `${120 + index * 70}ms` }}>
            <button type="button" className="empty__card" onClick={() => onPick(prompt)}>
              <span className="empty__card-icon">
                <Icon />
              </span>
              <span className="empty__card-label">{label}</span>
              <span className="empty__card-prompt">{prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
