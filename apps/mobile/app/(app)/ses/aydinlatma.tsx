import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Caption, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { AsyncGate } from '../../../features/onboarding/components';
import { legalBlocks, recordConsent, useLegalDocument } from '../../../features/voice/consent';

/**
 * V02 — AYDINLATMA. ⚠️ NO consent checkbox on this screen — that is a legal
 * requirement (Aydınlatma Tebliği m.5: information and consent must be separate
 * screens; SPEC §7 adım 2). Viewing is logged with `method: 'implicit_view'`,
 * which the contract explicitly marks as "rıza DEĞİLDİR".
 */
export default function Aydinlatma(): ReactNode {
  const router = useRouter();
  const doc = useLegalDocument('aydinlatma_ses');
  const viewLogged = useRef(false);

  // Log the VIEW (not consent) exactly once per screen entry.
  useEffect(() => {
    if (doc.data === undefined || viewLogged.current) return;
    viewLogged.current = true;
    void recordConsent({
      subject: 'aydinlatma_goruntuleme',
      granted: true,
      document: doc.data,
      method: 'implicit_view',
    }).catch(() => {
      /* Logging failure must not block the user from reading their rights. */
    });
  }, [doc.data]);

  return (
    <Screen>
      <Title>Aydınlatma Metni</Title>
      <Caption>
        Bu ekran yalnızca bilgilendirme içindir; herhangi bir onay istemez. Onay kutuları bir
        sonraki ekrandadır.
      </Caption>

      <AsyncGate
        isLoading={doc.isLoading}
        error={doc.error}
        data={doc.data}
        onRetry={() => void doc.refetch()}
        loadingTr="Metin yükleniyor…"
      >
        {(document) => (
          <View style={styles.docBox}>
            <Caption>{`Sürüm ${document.version}`}</Caption>
            {legalBlocks(document.bodyMd).map((block, index) =>
              block.kind === 'heading' ? (
                <Text key={index} style={styles.docHeading}>
                  {block.text}
                </Text>
              ) : block.kind === 'item' ? (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemBullet}>•</Text>
                  <Text style={styles.docText}>{block.text}</Text>
                </View>
              ) : (
                <Text key={index} style={styles.docText}>
                  {block.text}
                </Text>
              ),
            )}
          </View>
        )}
      </AsyncGate>

      <PrimaryButton
        label="Okudum, devam et"
        disabled={doc.data === undefined}
        onPress={() => {
          router.push('/(app)/ses/riza');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  docBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  docHeading: { ...typography.heading, fontSize: 18, lineHeight: 24, color: colors.ink },
  docText: {
    ...typography.caption,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
    flexShrink: 1,
  },
  itemRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  itemBullet: { ...typography.caption, fontSize: 14, color: colors.inkMuted },
});
