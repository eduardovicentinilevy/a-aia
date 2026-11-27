import { useMemo, useState } from 'react';
import { useHumanizer } from '../hooks/useHumanizer.js';
import { copyText } from '../lib/clipboard.js';
import { analyzeText } from '../lib/text-xray.js';
import { CheckIcon, CopyIcon, FeatherIcon, StopIcon } from './Icons.jsx';
import './Humanizer.css';

const MAX_LENGTH = 8000;

const TONES = [
  { value: 'natural', label: 'Natural' },
  { value: 'informal', label: 'Informal' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'academico', label: 'Acadêmico' },
];

const STRENGTHS = [
  { value: 'leve', label: 'Leve', hint: 'Só ajusta o que soa artificial.' },
  { value: 'media', label: 'Média', hint: 'Reescreve as frases que precisam.' },
  { value: 'forte', label: 'Forte', hint: 'Reescreve tudo com outras palavras.' },
];

/**
 * "Humanizar" screen: paste a robotic-sounding text, pick tone and strength, and get a
 * natural version (same content), side by side with the original and its x-ray.
 * @param {{ onFinished?: () => void, hidden?: boolean }} props
 *   onFinished is called after each rewrite (refreshes the usage meter).
 */
export default function Humanizer({ onFinished, hidden = false }) {
  const [text, setText] = useState('');
  const [tone, setTone] = useState('natural');
  const [strength, setStrength] = useState('media');
  const [copied, setCopied] = useState(false);
  const humanizer = useHumanizer({ onFinished });

  const before = useMemo(() => analyzeText(text), [text]);
  const finished = humanizer.status === 'done' && !humanizer.replaced;
  const after = useMemo(() => (finished ? analyzeText(humanizer.output) : null), [finished, humanizer.output]);
  const canRun = text.trim().length > 0 && !humanizer.isStreaming;
  const hasOutput = humanizer.output.length > 0;

  function submit() {
    if (!canRun) return;
    setCopied(false);
    humanizer.run({ text, tone, strength });
  }

  async function copyOutput() {
    if (await copyText(humanizer.output)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  function reuseOutput() {
    setText(humanizer.output);
    humanizer.reset();
  }

  return (
    <div className="humanizer" hidden={hidden}>
      <div className="humanizer__inner">
        <header className="humanizer__intro">
          <span className="humanizer__icon" aria-hidden="true">
            <FeatherIcon />
          </span>
          <div>
            <h1 className="humanizer__title gradient-text">Humanizar texto</h1>
            <p className="humanizer__subtitle">
              Cole um texto com cara de robô e receba uma versão natural, com o mesmo conteúdo.
            </p>
          </div>
        </header>

        <form
          className="humanizer__options"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Segmented label="Tom" name="tone" options={TONES} value={tone} onChange={setTone} disabled={humanizer.isStreaming} />
          <Segmented
            label="Intensidade"
            name="strength"
            options={STRENGTHS}
            value={strength}
            onChange={setStrength}
            disabled={humanizer.isStreaming}
          />
        </form>

        <div className="humanizer__panels">
          <section className="humanizer__panel" aria-labelledby="humanizer-original">
            <div className="humanizer__panel-head">
              <h2 id="humanizer-original">Original</h2>
              <span className={`humanizer__count${text.length > MAX_LENGTH * 0.9 ? ' humanizer__count--warn' : ''}`}>
                {text.length.toLocaleString('pt-BR')} / {MAX_LENGTH.toLocaleString('pt-BR')}
              </span>
            </div>
            <label htmlFor="humanizer-input" className="sr-only">
              Texto original
            </label>
            <textarea
              id="humanizer-input"
              className="humanizer__textarea"
              maxLength={MAX_LENGTH}
              placeholder="Cole aqui o texto que você quer deixar mais natural…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <XRayReport title="Raio-x do original" xray={text.trim() ? before : null} />
          </section>

          <section className="humanizer__panel humanizer__panel--output" aria-labelledby="humanizer-result" aria-busy={humanizer.isStreaming}>
            <div className="humanizer__panel-head">
              <h2 id="humanizer-result">Humanizado</h2>
              {hasOutput && !humanizer.isStreaming && (
                <div className="humanizer__actions">
                  <button type="button" className="humanizer__ghost" onClick={reuseOutput}>
                    Usar como original
                  </button>
                  <button type="button" className="humanizer__ghost" onClick={copyOutput} aria-live="polite">
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              )}
            </div>
            <div className="humanizer__output" tabIndex={0} aria-label="Texto humanizado">
              {hasOutput ? (
                <p className={humanizer.isStreaming ? 'humanizer__text humanizer__text--streaming' : 'humanizer__text'}>
                  {humanizer.output}
                </p>
              ) : humanizer.isStreaming ? (
                <p className="humanizer__placeholder humanizer__placeholder--busy">Reescrevendo…</p>
              ) : (
                <p className="humanizer__placeholder">O texto reescrito aparece aqui.</p>
              )}
            </div>
            {humanizer.status === 'error' && (
              <p className="humanizer__error" role="alert">
                {humanizer.error}
              </p>
            )}
            {humanizer.status === 'stopped' && <p className="humanizer__note">Interrompido. O texto acima pode estar incompleto.</p>}
            {after && <XRayReport title="Raio-x do resultado" xray={after} compareTo={before.signals.length} />}
          </section>
        </div>

        <div className="humanizer__footer">
          <p className="humanizer__hint">
            A AçaIA mantém fatos, números e nomes, mas pode errar: revise antes de usar. O texto não fica salvo.
          </p>
          {humanizer.isStreaming ? (
            <button type="button" className="humanizer__run humanizer__run--stop" onClick={humanizer.stop}>
              <StopIcon />
              Parar
            </button>
          ) : (
            <button type="button" className="humanizer__run" onClick={submit} disabled={!canRun}>
              <FeatherIcon />
              Humanizar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Row of radio buttons styled as a segmented control.
 * @param {{ label: string, name: string, options: { value: string, label: string, hint?: string }[],
 *   value: string, onChange: (value: string) => void, disabled?: boolean }} props
 */
function Segmented({ label, name, options, value, onChange, disabled }) {
  const hint = options.find((o) => o.value === value)?.hint;
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend className="segmented__label">{label}</legend>
      <div className="segmented__options" style={/** @type {any} */ ({ '--cols': options.length > 3 ? 2 : options.length })}>
        {options.map((option) => (
          <label key={option.value} className={`segmented__option${option.value === value ? ' segmented__option--active' : ''}`}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && <p className="segmented__hint">{hint}</p>}
    </fieldset>
  );
}

/**
 * @param {{ title: string, xray: import('../lib/text-xray.js').XRay|null, compareTo?: number }} props
 */
function XRayReport({ title, xray, compareTo }) {
  if (!xray) {
    return (
      <div className="xray xray--empty">
        <p className="xray__title">{title}</p>
        <p className="xray__summary">Mostra clichês, repetições e ritmo uniforme, que costumam deixar o texto com cara de robô.</p>
      </div>
    );
  }
  const count = xray.signals.length;
  const summary =
    count === 0 ? 'Nenhum sinal de texto artificial encontrado.' : count === 1 ? '1 sinal de texto artificial:' : `${count} sinais de texto artificial:`;
  return (
    <div className={`xray${count === 0 ? ' xray--clean' : ''}`}>
      <p className="xray__title">
        {title}
        {compareTo !== undefined && (
          <span className="xray__delta">
            {compareTo} → {count}
          </span>
        )}
      </p>
      <p className="xray__summary">{summary}</p>
      {count > 0 && (
        <ul className="xray__list">
          {xray.signals.map((signal) => (
            <li key={signal.id}>
              <strong>{signal.label}</strong>
              <span>{signal.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
