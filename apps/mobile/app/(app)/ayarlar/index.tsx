import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import Constants from 'expo-constants';

import {
  Body,
  Caption,
  Card,
  Heading,
  PrimaryButton,
  Screen,
  ScreenStub,
  Title,
} from '../../../components/ui';
import { API_MODE, apiModeLabelTr } from '../../../lib/api';

/** A01–A06 — account, privacy, voice, data, delete account, reading preferences. */
export default function Ayarlar(): ReactNode {
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? '0.0.0';

  return (
    <Screen>
      <Title>Ayarlar</Title>

      <Card
        onPress={() => {
          router.push('/(app)/ses');
        }}
      >
        <Heading>Sesim</Heading>
        <Caption>Ses profillerinizi dinleyin, silin veya kötüye kullanım bildirin.</Caption>
      </Card>

      <Card>
        <Heading>Gizlilik ve İzinler</Heading>
        <Body>
          Çocuğunuzun fotoğrafını hiçbir zaman istemiyoruz. Ses kaydı yalnızca açık rızanızla
          alınır ve rızanızı geri çektiğinizde ne olacağı size önceden gösterilir.
        </Body>
      </Card>

      <Card>
        <Heading>Uygulama bilgisi</Heading>
        <Caption>{`Sürüm ${version}`}</Caption>
        <Caption>{`Veri kaynağı: ${apiModeLabelTr()}`}</Caption>
        <Caption>{`API_MODE = ${API_MODE}`}</Caption>
      </Card>

      <PrimaryButton
        label="Kitaplığa dön"
        onPress={() => {
          router.push('/(app)/kitaplik');
        }}
      />

      <ScreenStub
        screenCodes="A01–A06"
        note="Hesap, Verilerim (KVKK başvurusu, veri haritası), Hesabı Sil ve okuma tercihleri (font, punto, vurgu, uyku modu) F2 tarafından yazılacak."
      />
    </Screen>
  );
}
