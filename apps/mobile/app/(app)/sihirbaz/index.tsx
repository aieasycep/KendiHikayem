import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AgeBand, Child } from '@kendihikayem/contract';
import { validateGivenName } from '@kendihikayem/shared';
import { Input, Text, palette, useTheme } from '@kendihikayem/ui';

import { Body, Caption, Card, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { useChildren } from '../../../features/onboarding/catalogHooks';
import {
  AsyncGate,
  Chip,
  ChipRow,
  ErrorBanner,
  SecondaryButton,
  SelectedCheck,
  StepBar,
} from '../../../features/onboarding/components';
import { useWizardDraft } from '../../../features/onboarding/draft';
import { useCreateChild } from '../../../features/wizard/hooks';
import { useSession } from '../../../lib/session';

const AGE_BANDS: AgeBand[] = ['3-5', '6-8', '9-12'];

/**
 * W01 — Çocuk seçici (Figma `StoryCreation` 1. adım "Bu hikâye kimin için?").
 * Tasarımdaki tam genişlik çocuk satırları: degrade avatar, ad + yaş, seçilince
 * mor kenarlık + lavanta zemin + onay dairesi; altta kesikli "Başka bir çocuk"
 * satırı. Misafirler S07'ye yönlenir — sihirbaz hesap ister.
 */
export default function Sihirbaz(): ReactNode {
  const router = useRouter();
  const session = useSession();
  const { spacing } = useTheme();
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
      // Yeni çocuk = yeni karakter kararı; kahraman adımı yeniden soracak.
      reuseCharacterId: undefined,
    });
    router.push('/(app)/sihirbaz/kahraman');
  };

  if (session.phase !== 'user') {
    return (
      <Screen>
        <Title>Yeni Hikâye</Title>
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
      <StepBar step={1} total={7} labelTr="Yeni Hikâye" />
      <Title>Bu hikâye kimin için?</Title>
      <Body>Masalını kimin için oluşturduğunu seç.</Body>

      <AsyncGate
        isLoading={children.isLoading}
        error={children.error}
        data={children.data}
        onRetry={() => void children.refetch()}
        loadingTr="Çocuk profilleri yükleniyor…"
      >
        {(items) => (
          <View style={{ gap: spacing.sm }}>
            {items.map((child) => (
              <ChildRow
                key={child.id as string}
                child={child}
                selected={draft.childId === (child.id as string)}
                onPress={() => {
                  selectChild(child);
                }}
              />
            ))}
          </View>
        )}
      </AsyncGate>

      {addOpen ? (
        <Card>
          <Heading>Yeni çocuk ekle</Heading>
          <Input
            label="Çocuğun adı"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={30}
            onChangeText={setNewName}
            placeholder="Örn. Elif"
            value={newName}
            errorTr={
              newName.length > 0 && !validation.ok
                ? (validation.messageTr ?? 'Bu isim kullanılamıyor.')
                : undefined
            }
          />
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
          <Caption>Yalnızca ad ve yaş bandı tutulur. Fotoğraf ve doğum tarihi istemiyoruz.</Caption>
        </Card>
      ) : (
        <AddChildRow
          onPress={() => {
            setAddOpen(true);
          }}
        />
      )}
    </Screen>
  );
}

/** Figma çocuk satırı: 48 degrade avatar, ad + yaş, seçilince mor onay dairesi. */
function ChildRow({
  child,
  selected,
  onPress,
}: {
  child: Child;
  selected: boolean;
  onPress: () => void;
}): ReactNode {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${child.givenName}, ${child.ageBand} yaş`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.childRow,
        {
          backgroundColor: selected
            ? colors.surfaceRaised
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
        selected && styles.childRowSelected,
      ]}
    >
      <LinearGradient
        colors={[palette.lavenderPale, palette.lavenderMist]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.childAvatar}
      >
        <Text style={styles.childEmoji} accessibilityElementsHidden>
          {child.genderPresentation === 'kiz' ? '👧' : '🧒'}
        </Text>
      </LinearGradient>
      <View style={styles.childBody}>
        <Text variant="heading" style={styles.childName}>
          {child.givenName}
        </Text>
        <Text variant="caption" tone="muted" style={styles.childAge}>
          {`${child.ageBand} yaş`}
        </Text>
      </View>
      {selected && <SelectedCheck size={24} />}
    </Pressable>
  );
}

/** Figma "Başka bir çocuk" — kesikli çerçeve + artı dairesi. */
function AddChildRow({ onPress }: { onPress: () => void }): ReactNode {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Başka bir çocuk ekle"
      onPress={onPress}
      style={({ pressed }) => [
        styles.childRow,
        styles.addRow,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
        },
      ]}
    >
      <View style={[styles.childAvatar, { backgroundColor: colors.surfaceMuted }]}>
        <Text style={styles.addPlus} accessibilityElementsHidden>
          +
        </Text>
      </View>
      <Text variant="label" tone="muted" style={styles.addLabel}>
        Başka bir çocuk
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Figma: 16/18 dolgu · 18 yarıçap · 2 px kenarlık · 14 boşluk. */
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 2,
  },
  /* Figma: seçili kart gölgesi 0 4 16 rgba(124,92,191,0.15). */
  childRowSelected: {
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  childAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childEmoji: { fontSize: 24 },
  childBody: { flex: 1, gap: 2 },
  childName: { fontSize: 18, lineHeight: 24 },
  childAge: { fontSize: 13, lineHeight: 18 },

  addRow: { borderStyle: 'dashed' },
  addPlus: { fontSize: 22, lineHeight: 26 },
  addLabel: { fontSize: 15, lineHeight: 20 },
});
