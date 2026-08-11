import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { AgeBand, Child } from '@kendihikayem/contract';
import { possessive, validateGivenName } from '@kendihikayem/shared';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { useChildren } from '../../../features/onboarding/catalogHooks';
import {
  AsyncGate,
  Chip,
  ChipRow,
  ErrorBanner,
  SecondaryButton,
  SelectCard,
  StepBar,
} from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { useCreateChild } from '../../../features/wizard/hooks';
import { useSession } from '../../../lib/session';

const AGE_BANDS: AgeBand[] = ['3-5', '6-8', '9-12'];

/**
 * W01 — Çocuk seçici. Entry of the registered-user wizard: pick an existing
 * child (their age band and reusable character flow along) or add a new one.
 * Guests are routed through S07 first — the wizard requires an account.
 */
export default function Sihirbaz(): ReactNode {
  const router = useRouter();
  const session = useSession();
  const { draft, patch } = useWizardDraft();
  const children = useChildren(session.phase === 'user');
  const createChild = useCreateChild();

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBand, setNewBand] = useState<AgeBand>('3-5');

  const validation = validateGivenName(newName);

  const selectChild = (child: Child): void => {
    patch({
      childId: child.id as string,
      childName: child.givenName,
      ageBand: child.ageBand,
      heroName: draft.heroIsChild ? child.givenName : draft.heroName,
      // Yeni çocuk = yeni karakter kararı; W03 yeniden soracak.
      reuseCharacterId: undefined,
    });
    router.push('/(app)/sihirbaz/tema');
  };

  if (session.phase !== 'user') {
    return (
      <Screen>
        <Title>Yeni Hikaye</Title>
        <Body>
          Hikaye sihirbazını kullanmak için önce telefonunuzla giriş yapın. Misafir olarak
          başladıysanız hiçbir şey kaybolmaz — her şey hesabınıza taşınır.
        </Body>
        <PrimaryButton
          label="Giriş yap"
          onPress={() => {
            router.push({ pathname: '/(onboarding)/giris', params: { donus: 'sihirbaz' } });
          }}
        />
        <SecondaryButton
          label="İlk masalımı misafir olarak kur"
          onPress={() => {
            router.push('/(onboarding)/kim-icin');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <StepBar step={1} total={7} labelTr="Adım 1 / 7 — Kim için?" />
      <Title>Bu masal kimin için?</Title>

      <AsyncGate
        isLoading={children.isLoading}
        error={children.error}
        data={children.data}
        onRetry={() => void children.refetch()}
        loadingTr="Çocuk profilleri yükleniyor…"
      >
        {(items) => (
          <>
            {items.length === 0 && !addOpen && (
              <Card>
                <Heading>Henüz çocuk profili yok</Heading>
                <Caption>İlk profili ekleyin; sonraki masallar iki dokunuş sürer.</Caption>
              </Card>
            )}
            <View style={styles.grid}>
              {items.map((child) => (
                <SelectCard
                  key={child.id as string}
                  icon={child.genderPresentation === 'erkek' ? '👦' : '👧'}
                  titleTr={child.givenName}
                  subtitleTr={`${child.ageBand} yaş · ${String(child.storyCount)} hikaye`}
                  footerTr={
                    child.defaultCharacterId !== undefined
                      ? `${possessive(child.givenName)} kahramanı hazır ⭐`
                      : undefined
                  }
                  selected={draft.childId === (child.id as string)}
                  onPress={() => {
                    selectChild(child);
                  }}
                />
              ))}
            </View>
          </>
        )}
      </AsyncGate>

      {addOpen ? (
        <Card>
          <Heading>Yeni çocuk ekle</Heading>
          <TextInput
            accessibilityLabel="Çocuğun adı"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={30}
            onChangeText={setNewName}
            placeholder="Adı"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={newName}
          />
          {newName.length > 0 && !validation.ok && (
            <Caption>{validation.messageTr ?? 'Bu isim kullanılamıyor.'}</Caption>
          )}
          <ChipRow>
            {AGE_BANDS.map((band) => (
              <Chip
                key={band}
                label={`${band} yaş`}
                selected={newBand === band}
                onPress={() => {
                  setNewBand(band);
                }}
              />
            ))}
          </ChipRow>
          {createChild.error != null && <ErrorBanner error={createChild.error} />}
          <PrimaryButton
            label={createChild.isPending ? 'Ekleniyor…' : 'Ekle ve devam et'}
            disabled={!validation.ok || createChild.isPending}
            onPress={() => {
              if (!validation.ok) return;
              createChild.mutate(
                { givenName: validation.normalized, ageBand: newBand },
                { onSuccess: selectChild },
              );
            }}
          />
          <SecondaryButton
            label="Vazgeç"
            onPress={() => {
              setAddOpen(false);
            }}
          />
        </Card>
      ) : (
        <SecondaryButton
          label="Yeni çocuk ekle"
          onPress={() => {
            setAddOpen(true);
          }}
        />
      )}

      <View style={styles.privacyRow}>
        <Text style={styles.privacyText}>
          Yalnızca ad ve yaş bandı tutulur. Fotoğraf ve doğum tarihi istemiyoruz.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  privacyRow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  privacyText: { ...typography.caption, color: colors.inkMuted },
});
