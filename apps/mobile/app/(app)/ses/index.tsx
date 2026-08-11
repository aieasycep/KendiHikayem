import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { VoiceProfile } from '@kendihikayem/contract';
import {
  Badge,
  Card,
  ChevronRightIcon,
  Text,
  palette,
  useTheme,
} from '@kendihikayem/ui';

import { useVoiceProfiles } from '../../../features/onboarding/catalogHooks';
import { AsyncGate, SecondaryButton, TrustStrip } from '../../../features/onboarding/components';
import { useVoiceFlow } from '../../../features/voice/flow';
import { Screen } from '../../../components/ui';

const STATUS_TR: Record<VoiceProfile['status'], string> = {
  draft: 'Taslak — kayıt bekliyor',
  recording: 'Kayıt sürüyor',
  processing: 'İşleniyor',
  preview_ready: 'Önizleme hazır — onayınızı bekliyor',
  ready: 'Kullanıma hazır',
  failed: 'Başarısız oldu',
  revoked: 'Silindi',
};

const BADGE_TR = { mukemmel: 'Mükemmel', iyi: 'İyi', kabul_edilebilir: 'Kabul edilebilir' } as const;

/**
 * Ses Stüdyom — Figma `VoiceStudio` liste görünümü. Lists existing profiles
 * (contract data) and starts the V01–V09 onboarding. Voice is OPTIONAL
 * everywhere — the product is complete with system voices, and this screen
 * says so explicitly.
 */
export default function SesHub(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const profiles = useVoiceProfiles();
  const flow = useVoiceFlow();

  const limitReached =
    profiles.data !== undefined && profiles.data.items.length >= profiles.data.limit;

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        Ses Stüdyom
      </Text>

      {/* Marka vaadi kartı — "Sen yanında olamasan bile sesin onunla" */}
      <View
        style={[
          styles.quoteCard,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: 'rgba(124,92,191,0.25)',
            borderRadius: radius.md,
            padding: spacing.md,
          },
        ]}
      >
        <Text variant="heading" style={styles.quoteText}>
          “Ailenizden bir ses,{'\n'}her masalda yanında.”
        </Text>
        <Text variant="caption" tone="muted">
          Sesinizi bir kez tanıtırsınız; sonrasında her hikayede yeniden kullanılır.
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
            {data.items.map((profile) => (
              <Card key={profile.id as string}>
                <View style={[styles.profileRow, { gap: spacing.md }]}>
                  <LinearGradient
                    colors={[palette.peach, palette.coral]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarEmoji} accessibilityElementsHidden>
                      {profile.relation === 'anne' ? '👩' : profile.relation === 'baba' ? '👨' : '🎙️'}
                    </Text>
                  </LinearGradient>
                  <View style={styles.profileBody}>
                    <View style={[styles.nameRow, { gap: spacing.sm }]}>
                      <Text variant="bodyStrong">{profile.displayName}</Text>
                      {profile.status === 'ready' && <Badge labelTr="Hazır" tone="success" />}
                    </View>
                    <Text variant="caption" tone="muted">
                      {STATUS_TR[profile.status]}
                    </Text>
                    {profile.qualityBadge !== undefined && (
                      <Text variant="caption" tone="muted">
                        {`Kalite: ${BADGE_TR[profile.qualityBadge]}`}
                      </Text>
                    )}
                    {profile.storiesUsingCount > 0 && (
                      <Text variant="caption" tone="muted">
                        {`${String(profile.storiesUsingCount)} hikayede kullanılıyor`}
                      </Text>
                    )}
                  </View>
                </View>
                {profile.status === 'preview_ready' && (
                  <SecondaryButton
                    label="Önizlemeyi dinle ve onayla"
                    onPress={() => {
                      flow.setProfile(profile.id as string, profile.displayName, profile.relation);
                      router.push('/(app)/ses/onizleme');
                    }}
                  />
                )}
              </Card>
            ))}
          </>
        )}
      </AsyncGate>

      {/* Yeni ses ekle — Figma'daki kesikli çerçeveli davet kartı */}
      <Text variant="caption" tone="muted" style={styles.sectionKicker}>
        YENİ SES EKLE
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Kendi sesinizi kaydedin — yaklaşık 60 saniyelik okuma, bir kez yeter"
        accessibilityState={{ disabled: limitReached }}
        disabled={limitReached}
        onPress={() => {
          router.push('/(app)/ses/deger');
        }}
        style={({ pressed }) => [
          styles.addCard,
          {
            borderColor: colors.border,
            borderRadius: radius.lg,
            padding: spacing.md,
            gap: spacing.md,
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
          <Text variant="bodyStrong" style={{ color: colors.primary }}>
            Kendi sesimi ekle
          </Text>
          <Text variant="caption" tone="muted">
            Yaklaşık 4 dakika · Bir kez yeter
          </Text>
        </View>
        <ChevronRightIcon size={18} color={colors.primary} />
      </Pressable>
      {limitReached && (
        <Text variant="caption" tone="muted">
          Ses profili hakkınız dolu. Yeni ses eklemek için Ayarlar → Sesim ekranından mevcut bir
          sesi silebilirsiniz.
        </Text>
      )}

      <TrustStrip
        items={[
          'Sesiniz AB’deki sunucumuzda şifreli saklanır.',
          'Tek dokunuşla silersiniz; sağlayıcıdan da silinir.',
          'Asla başka bir hesapta kullanılmaz.',
          'Çocuk sesi asla kaydedilmez.',
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  quoteCard: { borderWidth: 1, gap: 6 },
  quoteText: { fontSize: 19, lineHeight: 26 },

  sectionKicker: { fontSize: 12, letterSpacing: 0.8, fontWeight: '700' },

  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 24 },
  profileBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },

  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
