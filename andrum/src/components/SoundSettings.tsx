import { AMBIENT_LABELS, type AmbientType } from '../audio/ambient';
import { vibrationSupported } from '../lib/haptics';
import { setPrefs, usePrefs } from '../lib/prefs';
import { Chips, Slider, Toggle } from './ui';

const ambientOptions = (Object.keys(AMBIENT_LABELS) as AmbientType[]).map((v) => ({ value: v, label: AMBIENT_LABELS[v] }));

export function SoundControls() {
  const prefs = usePrefs();
  return (
    <div className="flex flex-col gap-1">
      <Toggle label="Ljud" checked={prefs.soundOn} onChange={(soundOn) => setPrefs({ soundOn })} />
      <Slider label="Signaler" value={prefs.cueVolume} disabled={!prefs.soundOn} onChange={(cueVolume) => setPrefs({ cueVolume })} />
      <div className={`py-2 ${prefs.soundOn ? '' : 'opacity-40'}`}>
        <p className="mb-2">Bakgrund</p>
        <Chips options={ambientOptions} value={prefs.ambient} onChange={(ambient) => setPrefs({ ambient })} />
      </div>
      <Slider
        label="Bakgrundsvolym"
        value={prefs.ambientVolume}
        disabled={!prefs.soundOn || prefs.ambient === 'off'}
        onChange={(ambientVolume) => setPrefs({ ambientVolume })}
      />
      {vibrationSupported ? (
        <Toggle label="Vibration" checked={prefs.vibration} onChange={(vibration) => setPrefs({ vibration })} />
      ) : (
        <p className="pt-2 text-sm text-muted">Vibration stöds inte i den här webbläsaren (t.ex. Safari på iPhone).</p>
      )}
    </div>
  );
}

/** Hopfällbar variant för startsidan av en session. */
export function SoundSettingsCollapsible() {
  const prefs = usePrefs();
  const summary = prefs.soundOn
    ? `Ljud på · ${prefs.ambient === 'off' ? 'ingen bakgrund' : AMBIENT_LABELS[prefs.ambient].toLowerCase()}`
    : 'Ljud av';
  return (
    <details className="group rounded-3xl border border-line bg-surface">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between px-5">
        <span>
          <span className="block">Ljud</span>
          <span className="block text-sm text-muted">{summary}</span>
        </span>
        <span className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-5 pb-4">
        <SoundControls />
      </div>
    </details>
  );
}
