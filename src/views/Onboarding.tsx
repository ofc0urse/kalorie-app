import { saveSettings } from '../settings';
import { ProfileForm } from './Settings';

export function Onboarding() {
  return (
    <div class="page no-tabbar" data-testid="onboarding">
      <div class="hero">
        <img class="logo" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="72" height="72" />
        <h1>Witaj w Kalorie</h1>
        <p class="muted mt">
          Policzmy Twoje dzienne zapotrzebowanie. Dane zostają tylko na tym urządzeniu – bez kont i logowania.
        </p>
      </div>
      <section class="card mt">
        <ProfileForm
          initial={null}
          submitLabel="Zaczynamy"
          onSave={async (profile) => {
            await saveSettings({ profile, kcalGoalManual: false, onboarded: true });
          }}
        />
      </section>
      <button class="btn ghost block mt" onClick={() => saveSettings({ onboarded: true })} data-testid="skip-onboarding">
        Pomiń – ustawię cel później (domyślnie 2000 kcal)
      </button>
    </div>
  );
}
