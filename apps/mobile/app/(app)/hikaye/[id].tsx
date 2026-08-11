import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { possessive } from '@kendihikayem/shared';

import {
  Body,
  Caption,
  Card,
  DemoBadge,
  Heading,
  PrimaryButton,
  Screen,
  ScreenStub,
  Title,
} from '../../../components/ui';
import { colors } from '../../../constants/theme';
import { getStory } from '../../../lib/api';
import type { DemoStory } from '../../../lib/fixtures';

/** P01 — player. The karaoke engine, sleep mode and offline reader belong to F2. */
export default function Hikaye(): ReactNode {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [story, setStory] = useState<DemoStory | null | undefined>(null);

  useEffect(() => {
    let cancelled = false;
    void getStory(id).then((result) => {
      if (!cancelled) setStory(result ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (story === null) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
        <Caption>Masal açılıyor…</Caption>
      </Screen>
    );
  }

  if (story === undefined) {
    return (
      <Screen>
        <Title>Masal bulunamadı</Title>
        <Body>Bu masal silinmiş olabilir. Kitaplığa dönüp tekrar deneyin.</Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <DemoBadge />
      <Title>{story.titleTr}</Title>
      <Caption>
        {`${possessive(story.childName)} masalı · ${story.themeTr} · ${story.artStyleTr}`}
      </Caption>

      <Card>
        <Heading>Bu masal ne anlatıyor?</Heading>
        <Body>{story.lessonTr}</Body>
      </Card>

      {story.pages.map((page) => (
        <Card key={page.pageNo}>
          <Caption>{`Sayfa ${page.pageNo}`}</Caption>
          <Body>{page.textTr}</Body>
        </Card>
      ))}

      <PrimaryButton
        label="Bu masalı bastır"
        onPress={() => {
          router.push({ pathname: '/(app)/bastir/[id]', params: { id: story.id } });
        }}
      />

      <ScreenStub
        screenCodes="P01 · P02 · P03 · P04 · P05"
        note="Tam ekran oynatıcı, kelime vurgusu (karaoke), uyku modu, metin/görsel düzenleme ve paylaşım F2 tarafından yazılacak. Bu ekran şu an yalnızca demo metnini gösteriyor."
      />
    </Screen>
  );
}
