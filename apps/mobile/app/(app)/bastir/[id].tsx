import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { Body, Caption, Card, Heading, Screen, ScreenStub, Title } from '../../../components/ui';

/** B01–B08 — print flow. Owner: F2 (UI) + A6 (PDF, commerce). */
export default function Bastir(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <Title>Bastır</Title>
      <Body>
        21×21 cm, 24 sayfa, sert kapak. Her sayfada bir QR kod olabilir; okutan kişi o
        sayfayı sizin sesinizle dinler.
      </Body>

      <Card>
        <Heading>Seçilen masal</Heading>
        <Caption>{`Masal kimliği: ${id}`}</Caption>
      </Card>

      <Card>
        <Heading>Cayma hakkı</Heading>
        <Body>
          Kişiye özel üretilen kitaplarda cayma hakkı, üretim başladıktan sonra
          kullanılamaz. Ödeme adımından önce bu bilgiyi ayrıca onaylamanız istenecek.
        </Body>
      </Card>

      <ScreenStub
        screenCodes="B01–B08"
        note="Format seçimi, çift sayfa (spread) önizlemesi, ithaf, QR ayarı, adet/adres, cayma hakkı onayı ve iyzico ödemesi F2 + A6 tarafından yazılacak."
      />
    </Screen>
  );
}
