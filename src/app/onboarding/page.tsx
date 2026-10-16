import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MARK } from '~/lib/domain';
import { currentActor } from '~/server/auth/session';
import { OnboardingWizard } from '~/components/onboarding/wizard';
import { loadOnboardingContext } from '~/server/onboarding-context';

export const metadata: Metadata = {
  title: 'Introduce yourself',
  description: 'A few things before you enter.',
};

export default async function OnboardingPage() {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (actor.onboarded) redirect('/home');

  const context = await loadOnboardingContext(actor.userId);

  return (
    <div className="onboard">
      <header className="onboard-head">
        <span className="brand" aria-label="Enyd Arch">
          <span className="brand-mark" aria-hidden="true">
            {MARK}
          </span>
          <span className="brand-text">
            <span className="brand-name">Enyd Arch</span>
          </span>
        </span>

        <span className="member-id t-mono">{actor.memberIdLabel}</span>
      </header>

      <main className="onboard-main" id="main">
        <OnboardingWizard
          identity={{
            username: actor.username,
            displayName: actor.displayName,
            memberId: actor.memberIdLabel,
            isMinor: actor.isMinor,
            ageBand: actor.ageBand,
          }}
          context={context}
        />
      </main>
    </div>
  );
}