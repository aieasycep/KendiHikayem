import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { useSystemVoices } from '../../../features/onboarding/catalogHooks';
import { SecondaryButton, TrustStrip } from '../../../features/onboarding/components';
import { SamplePlayer } from '../../../features/voice/SamplePlayer';

/**
 * V01 — Değer + A/B demo (SPEC §7 adım 1).
 *
 * The same paragraph twice: first a system voice, then a cloned one (produced
 * with a consented actor). Below, the trust strip — the four sentences from the
 * SPEC, verbatim. No consent UI here; that starts at V02.
 */
export default function Deger(): ReactNode {
  const router = useRouter();
  const voices = useSystemVoices();
  const systemSample = voices.data?.[0]?.sample.url ?? 'https://cdn.kendihikayem.com/mock/audio/voice/sistem-deniz.m4a';

  return (
    <Screen>
      <Title>Masalı siz okuyormuşsunuz gibi</Title>
      <Body>
        Aynı paragrafı iki kez dinleyin: önce hazır anlatıcı, sonra kendi sesiyle kaydettiren
        bir ebeveynin klonlanmış sesi. Fark ilk cümlede belli olur.
      </Body>

      <Card>
        <Heading>Aynı paragraf, iki ses</Heading>
        <SamplePlayer
          labelTr="1 · Sistem sesi"
          sublabelTr="Hazır anlatıcı — her zaman kullanılabilir"
          url={systemSample}
        />
        <SamplePlayer
          labelTr="2 · Klonlanmış ebeveyn sesi"
          sublabelTr="4 kısa pasajdan üretildi (~110 saniye kayıt)"
          url="https://cdn.kendihikayem.com/mock/audio/voice/anne-onizleme.m4a"
        />
      </Card>

      <TrustStrip
        items={[
          'Sesiniz AB’deki sunucumuzda şifreli saklanır.',
          'Tek dokunuşla silersiniz.',
          'Asla başka bir hesapta kullanılmaz.',
          'Çocuk sesi asla kaydedilmez.',
        ]}
      />

      <PrimaryButton
        label="Sesimi tanıtmaya başla"
        onPress={() => {
          router.push('/(app)/ses/aydinlatma');
        }}
      />
      <SecondaryButton
        label="Şimdi değil"
        onPress={() => {
          router.back();
        }}
      />
      <Caption>
        Toplam süre yaklaşık 4 dakika: kısa bir bilgilendirme, iki onay kutusu ve 4 pasajlık
        kayıt. İstediğiniz an yarıda bırakabilirsiniz.
      </Caption>
    </Screen>
  );
}
