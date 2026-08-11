import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card, Text, useTheme } from '@kendihikayem/ui';

import { useVoiceProfiles } from '../../../features/onboarding/catalogHooks';
import { AsyncGate, BackCircle } from '../../../features/onboarding/components';
import { VoiceCard } from '../../../features/voice/VoiceCard';
import { useVoiceFlow } from '../../../features/voice/flow';
import { Screen } from '../../../components/ui';

/**
 * Ses Stüdyom — Figma `VoiceStudio` liste görünümü BİREBİR: geri dairesi +
 * başlık, lavanta alıntı kartı, "AİLE SESLERİ" kartları (dinleme + üç-nokta
 * menüsü) ve "YENİ SES EKLE" kesikli daveti. Veriler sözleşmeden gelir; ses
 * özelliği her yerde İSTEĞE BAĞLIDIR.
 */
export default function SesHub(): ReactNode {
  const router = useRouter();
  const { colors } = useTheme();
  const profiles = useVoiceProfiles();
  const flow = useVoiceFlow();

  const limitReached =
    profiles.data !== undefined && profiles.data.items.length >= profiles.data.limit;

  return (
    <Screen>
      {/* ── Figma başlık: geri dairesi + Fraunces başlık ────── */}
      <View style={styles.headerRow}>
        <BackCircle
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(app)/ayarlar');
          }}
        />
        <Text variant="title" accessibilityRole="header">
          Ses Stüdyom
        </Text>
      </View>

      {/* ── Figma alıntı kartı: lavanta degrade zemin ───────── */}
      <View
        style={[
          styles.quoteCard,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: 'rgba(124,92,191,0.2)',
          },
        ]}
      >
        <Text variant="heading" style={styles.quoteText}>
          {'"Ailenden bir ses,\nher masalda yanında."'}
        </Text>
        <Text variant="caption" tone="muted" style={styles.quoteSub}>
          Kayıtlı sesler tüm hikâyelerinde kullanılabilir.
        </Text>
      </View>

      <AsyncGate
        isLoading={profiles.isLoading}
        error={profiles.error}
        data={profiles.data}
        onRetry={() => void profiles.refetch()}
        loadingTr="Ses profilleriniz yükleniyor…"
      >
        {(data) => (
          <>
            <Text variant="caption" tone="muted" style={styles.sectionKicker}>
              AİLE SESLERİ
            </Text>
            {data.items.length === 0 && (
              <Card>
                <Text variant="heading">Masallar henüz sesinizi tanımıyor</Text>
                <Text variant="caption" tone="muted">
                  Sistem sesleri her zaman hazır. Kendi sesinizi eklemek tamamen isteğe bağlı —
                  yaklaşık 4 dakika sürer.
                </Text>
              </Card>
            )}
            <View style={styles.cardList}>
              {data.items.map((profile) => (
                <VoiceCard
                  key={profile.id as string}
                  profile={profile}
                  onApprovePreview={() => {
                    flow.setProfile(profile.id as string, profile.displayName, profile.relation);
                    router.push('/(app)/ses/onizleme');
                  }}
                />
              ))}
            </View>
          </>
        )}
      </AsyncGate>

      {/* ── Figma "YENİ SES EKLE" — kesikli davet kartı ─────── */}
      <Text variant="caption" tone="muted" style={styles.sectionKicker}>
        YENİ SES EKLE
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ses kaydı oluştur — yaklaşık 4 dakika, bir kez yeter"
        accessibilityState={{ disabled: limitReached }}
        disabled={limitReached}
        onPress={() => {
          router.push('/(app)/ses/deger');
        }}
        style={({ pressed }) => [
          styles.addCard,
          {
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            opacity: limitReached ? 0.5 : 1,
          },
        ]}
      >
        <View style={[styles.addIcon, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={styles.addIconEmoji} accessibilityElementsHidden>
            🎙
          </Text>
        </View>
        <View style={styles.addBody}>
          <Text variant="bodyStrong" style={[styles.addTitle, { color: colors.primary }]}>
            Ses Kaydı Oluştur
          </Text>
          <Text variant="caption" tone="muted" style={styles.addSub}>
            Yaklaşık 4 dakika · Bir kez yeter
          </Text>
        </View>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
          <Path
            d="M9 18l6-6-6-6"
            stroke={colors.primary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>
      {limitReached && (
        <Text variant="caption" tone="muted">
          Ses profili hakkınız dolu. Yeni ses eklemek için mevcut bir sesi silebilirsiniz
          (kartın üç-nokta menüsü).
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  /* Figma: 16/20 dolgu · 16 yarıçap · 1 px mor kenarlık. */
  quoteCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 4,
  },
  /* Figma: Fraunces 17/600. */
  quoteText: { fontSize: 17, lineHeight: 22 },
  quoteSub: { fontSize: 13, lineHeight: 18 },

  sectionKicker: { fontSize: 12, letterSpacing: 0.8, fontWeight: '700' },
  cardList: { gap: 10 },

  /* Figma: 18 dolgu · 18 yarıçap · 2 px kesikli kenarlık. */
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  addIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIconEmoji: { fontSize: 22 },
  addBody: { flex: 1, gap: 2 },
  addTitle: { fontSize: 15, lineHeight: 20 },
  addSub: { fontSize: 13, lineHeight: 18 },
});
