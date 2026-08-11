import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Body, Caption, Card, DemoBadge, Heading, Screen, ScreenStub, Title } from '../../../components/ui';
import { listVoiceProfiles } from '../../../lib/api';
import type { DEMO_VOICE_PROFILES } from '../../../lib/fixtures';

type VoiceProfiles = typeof DEMO_VOICE_PROFILES;

/**
 * V01–V09 — voice onboarding and profiles.
 *
 * Nothing here records audio yet, and that is deliberate: recording may only start after
 * the separate aydınlatma (V02) and açık rıza (V03) screens, which are a legal requirement
 * (KVKK, SPEC §7 and §10). A1 + A5 own those; this screen is navigation only.
 */
export default function Ses(): ReactNode {
  const [profiles, setProfiles] = useState<VoiceProfiles>([]);

  useEffect(() => {
    let cancelled = false;
    void listVoiceProfiles().then((result) => {
      if (!cancelled) setProfiles(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen>
      <Title>Sesler</Title>
      <Body>
        Masalları hazır anlatıcı sesleriyle ya da kendi sesinizle dinletebilirsiniz. Ses
        kaydı, aydınlatma metnini okuyup açık rıza vermeden başlamaz.
      </Body>

      {profiles.map((profile) => (
        <Card key={profile.id}>
          <DemoBadge />
          <Heading>{profile.displayNameTr}</Heading>
          <Caption>{`${profile.relationTr} · ${profile.statusTr} · Kalite: ${profile.qualityBadgeTr}`}</Caption>
        </Card>
      ))}

      <ScreenStub
        screenCodes="V01–V09"
        note="Değer anlatımı, AYDINLATMA (V02), AÇIK RIZA (V03), mikrofon testi, sesli rıza + canlılık kontrolü, 4 pasaj kaydı ve önizleme F1 + A5 tarafından yazılacak. RECORD_AUDIO izni manifestte hazır."
      />
    </Screen>
  );
}
