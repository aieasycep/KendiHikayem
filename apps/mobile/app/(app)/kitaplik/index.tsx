import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { possessive } from '@kendihikayem/shared';

import {
  Body,
  Caption,
  Card,
  DemoBadge,
  Heading,
  Screen,
  ScreenStub,
  Title,
} from '../../../components/ui';
import { colors } from '../../../constants/theme';
import { listStories } from '../../../lib/api';
import type { DemoStory } from '../../../lib/fixtures';

/** L01 — library. Cover grid, filters and the "you stopped on page 3" card come later (F2). */
export default function Kitaplik(): ReactNode {
  const router = useRouter();
  const [stories, setStories] = useState<DemoStory[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listStories().then((result) => {
      if (!cancelled) setStories(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen>
      <Title>Kitaplık</Title>

      {stories === null ? (
        <View style={{ paddingVertical: 32 }}>
          <ActivityIndicator color={colors.primary} />
          <Caption>Masallar yükleniyor…</Caption>
        </View>
      ) : (
        stories.map((story) => (
          <Card
            key={story.id}
            onPress={() => {
              router.push({ pathname: '/(app)/hikaye/[id]', params: { id: story.id } });
            }}
          >
            <DemoBadge />
            <Heading>{story.titleTr}</Heading>
            <Caption>
              {`${possessive(story.childName)} masalı · ${story.ageBand} yaş · ${story.themeTr}`}
            </Caption>
            <Body>{story.blurbTr}</Body>
            <Caption>{`${story.pageCount} sayfa · ${story.durationMinutes} dk · ${story.voiceLabelTr}`}</Caption>
          </Card>
        ))
      )}

      <ScreenStub
        screenCodes="L01 · L02 · L03"
        note="Kapak ızgarası, çocuk profili/seri görünümü, filtre çipleri ve boş durum ekranı F2 tarafından tamamlanacak."
      />
    </Screen>
  );
}
